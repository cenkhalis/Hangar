import datetime

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.fleet.tests.factories import AircraftFactory
from apps.maintenance import services
from apps.maintenance.models import WorkOrder

from .conftest import DAYS, HOURS, add_task, at

pytestmark = pytest.mark.django_db

BASE = "/api/maintenance"


@pytest.fixture
def api():
    return APIClient()


def ids(response):
    return [row["id"] for row in response.json()["results"]]


class TestProgramsTasksIntervals:
    def test_program_includes_tasks_and_intervals(self, api, program):
        add_task(program, (HOURS, "2.5"), (DAYS, 90), code="INSP-1")

        body = api.get(f"{BASE}/programs/{program.pk}/").json()

        [task] = body["tasks"]
        assert task["code"] == "INSP-1"
        assert {i["interval_type"]: i["value"] for i in task["intervals"]} == {
            "flight_hours": "2.50",
            "calendar_days": "90.00",
        }

    def test_create_task_and_interval(self, api, program):
        task = api.post(
            f"{BASE}/tasks/",
            {"program": program.pk, "code": "INSP-50H", "title": "50 h inspection"},
            format="json",
        )
        assert task.status_code == 201

        interval = api.post(
            f"{BASE}/intervals/",
            {
                "task": task.json()["id"],
                "interval_type": "flight_hours",
                "value": "50",
                "warning_threshold_percent": "20",
            },
            format="json",
        )
        assert interval.status_code == 201, interval.json()
        assert interval.json()["warning_threshold_percent"] == "20.00"

    @pytest.mark.parametrize(
        ("interval_type", "value", "threshold"),
        [
            ("cycles", "2.5", "10"),
            ("calendar_days", "1.5", "10"),
            ("flight_hours", "0", "10"),
            ("flight_hours", "5", "100"),
        ],
    )
    def test_invalid_intervals_rejected(self, api, program, interval_type, value, threshold):
        task = add_task(program)

        response = api.post(
            f"{BASE}/intervals/",
            {
                "task": task.pk,
                "interval_type": interval_type,
                "value": value,
                "warning_threshold_percent": threshold,
            },
            format="json",
        )

        assert response.status_code == 400

    def test_filter_tasks(self, api, program):
        active = add_task(program)
        add_task(program, is_active=False)

        assert ids(api.get(f"{BASE}/tasks/", {"is_active": "true"})) == [active.pk]

    def test_delete_task_with_history_returns_409(self, api, aircraft, program):
        task = add_task(program)
        services.record_historical_completion(
            aircraft, task, performed_at=at(2026, 1, 5), performed_by="Tech"
        )

        assert api.delete(f"{BASE}/tasks/{task.pk}/").status_code == 409

    def test_delete_unused_task(self, api, program):
        assert api.delete(f"{BASE}/tasks/{add_task(program).pk}/").status_code == 204


class TestWorkOrderFlow:
    def test_create_sign_off_and_auto_complete(self, api, aircraft, program):
        a = add_task(program, (HOURS, 50), code="A")
        b = add_task(program, (DAYS, 90), code="B")
        opened = (timezone.now() - datetime.timedelta(hours=3)).isoformat()

        created = api.post(
            f"{BASE}/work-orders/",
            {
                "aircraft": aircraft.pk,
                "tasks": [a.pk, b.pk],
                "title": "50 h check",
                "opened_at": opened,
            },
            format="json",
        )
        assert created.status_code == 201, created.json()
        order = created.json()
        assert order["status"] == "open"
        assert [i["task_code"] for i in order["items"]] == ["A", "B"]

        for item in order["items"]:
            response = api.post(
                f"{BASE}/work-order-items/{item['id']}/sign-off/",
                {"performed_by": "J. Doe", "notes": "OK"},
                format="json",
            )
            assert response.status_code == 200, response.json()
            assert response.json()["kind"] == "work_order"
            assert response.json()["work_order"] == order["id"]

        order = api.get(f"{BASE}/work-orders/{order['id']}/").json()
        assert order["status"] == "completed"
        assert order["closed_at"] is not None
        assert all(i["status"] == "signed_off" and i["completion"] for i in order["items"])

    def test_create_errors(self, api, aircraft, program):
        task = add_task(program)
        api.post(
            f"{BASE}/work-orders/",
            {"aircraft": aircraft.pk, "tasks": [task.pk], "title": "First"},
            format="json",
        )

        duplicate = api.post(
            f"{BASE}/work-orders/",
            {"aircraft": aircraft.pk, "tasks": [task.pk], "title": "Second"},
            format="json",
        )
        empty = api.post(
            f"{BASE}/work-orders/",
            {"aircraft": aircraft.pk, "tasks": [], "title": "Empty"},
            format="json",
        )

        assert duplicate.status_code == 400
        assert duplicate.json()["code"] == "duplicate_open_task"
        assert empty.status_code == 400
        assert WorkOrder.objects.count() == 1

    def test_update_only_title_and_notes(self, api, aircraft, program):
        order = services.create_work_order(
            aircraft, [add_task(program)], title="Old", opened_at=timezone.now()
        )

        response = api.patch(
            f"{BASE}/work-orders/{order.pk}/",
            {"title": "New", "notes": "Hangar 2", "status": "completed"},
            format="json",
        )

        assert response.status_code == 200
        order.refresh_from_db()
        assert (order.title, order.notes, order.status) == ("New", "Hangar 2", "open")

    def test_cancel(self, api, aircraft, program):
        order = services.create_work_order(
            aircraft, [add_task(program)], title="WO", opened_at=timezone.now()
        )

        missing = api.post(f"{BASE}/work-orders/{order.pk}/cancel/", {}, format="json")
        response = api.post(
            f"{BASE}/work-orders/{order.pk}/cancel/", {"reason": "Not needed"}, format="json"
        )
        again = api.post(
            f"{BASE}/work-orders/{order.pk}/cancel/", {"reason": "Again"}, format="json"
        )

        assert missing.status_code == 400
        assert response.status_code == 200
        assert response.json()["status"] == "cancelled"
        assert response.json()["items"][0]["status"] == "cancelled"
        assert again.json()["code"] == "work_order_not_open"

    def test_sign_off_errors(self, api, aircraft, program):
        order = services.create_work_order(
            aircraft, [add_task(program)], title="WO", opened_at=timezone.now()
        )
        item = order.items.get()
        future = (timezone.now() + datetime.timedelta(days=1)).isoformat()

        no_performer = api.post(f"{BASE}/work-order-items/{item.pk}/sign-off/", {}, format="json")
        in_future = api.post(
            f"{BASE}/work-order-items/{item.pk}/sign-off/",
            {"performed_by": "Tech", "performed_at": future},
            format="json",
        )

        assert no_performer.status_code == 400
        assert in_future.json()["code"] == "invalid_timestamp"

    def test_delete_not_allowed(self, api, aircraft, program):
        order = services.create_work_order(
            aircraft, [add_task(program)], title="WO", opened_at=timezone.now()
        )

        assert api.delete(f"{BASE}/work-orders/{order.pk}/").status_code == 405

    def test_filter_and_query_count(self, api, program, django_assert_max_num_queries):
        task = add_task(program)
        for _ in range(10):
            services.create_work_order(
                AircraftFactory(model=program.aircraft_model),
                [task],
                title="WO",
                opened_at=timezone.now(),
            )

        with django_assert_max_num_queries(3):
            response = api.get(f"{BASE}/work-orders/", {"status": "open"})

        assert response.json()["count"] == 10


class TestCompletions:
    def test_create_historical_and_void(self, api, aircraft, program):
        task = add_task(program, (DAYS, 90))

        created = api.post(
            f"{BASE}/completions/",
            {
                "aircraft": aircraft.pk,
                "task": task.pk,
                "performed_at": "2026-01-10T09:00:00Z",
                "performed_by": "Previous operator",
            },
            format="json",
        )
        assert created.status_code == 201, created.json()
        assert created.json()["kind"] == "historical"
        assert created.json()["work_order"] is None

        completion_id = created.json()["id"]
        voided = api.post(
            f"{BASE}/completions/{completion_id}/void/",
            {"reason": "Duplicate entry"},
            format="json",
        )
        assert voided.status_code == 200
        assert voided.json()["voided"] is True

        again = api.post(
            f"{BASE}/completions/{completion_id}/void/", {"reason": "x"}, format="json"
        )
        assert again.json()["code"] == "completion_already_voided"

    def test_filter_voided(self, api, aircraft, program):
        task = add_task(program)
        kept = services.record_historical_completion(
            aircraft, task, performed_at=at(2026, 2, 1), performed_by="Tech"
        )
        voided = services.record_historical_completion(
            aircraft, task, performed_at=at(2026, 2, 2), performed_by="Tech"
        )
        services.void_completion(voided, reason="Mistake")

        assert ids(api.get(f"{BASE}/completions/", {"voided": "false"})) == [kept.pk]
        assert ids(api.get(f"{BASE}/completions/", {"voided": "true"})) == [voided.pk]

    def test_completions_are_immutable(self, api, aircraft, program):
        completion = services.record_historical_completion(
            aircraft, add_task(program), performed_at=at(2026, 2, 1), performed_by="Tech"
        )

        assert api.patch(f"{BASE}/completions/{completion.pk}/", {}).status_code == 405
        assert api.delete(f"{BASE}/completions/{completion.pk}/").status_code == 405


class TestStatusAndDue:
    def test_aircraft_status(self, api, aircraft, program):
        task = add_task(program, (HOURS, 50), (DAYS, 30), code="INSP")
        services.record_historical_completion(
            aircraft,
            task,
            performed_at=timezone.now() - datetime.timedelta(days=28),
            performed_by="Tech",
        )

        body = api.get(f"{BASE}/aircraft/{aircraft.pk}/status/").json()

        assert body["aircraft"] == aircraft.pk
        assert body["state"] == "due_soon"
        [task_status] = body["tasks"]
        assert task_status["code"] == "INSP"
        assert task_status["last_completion"]["performed_by"] == "Tech"
        by_type = {i["interval_type"]: i for i in task_status["intervals"]}
        assert by_type["flight_hours"]["due_at_aircraft_hours"] == "50.00"
        assert by_type["calendar_days"]["used"] == "28.00"
        assert by_type["calendar_days"]["due_date"] is not None

    def test_status_for_unknown_aircraft_is_404(self, api):
        assert api.get(f"{BASE}/aircraft/999999/status/").status_code == 404

    def test_due_list(self, api, aircraft, program):
        add_task(program, (DAYS, 1), code="LATE")
        add_task(program, (DAYS, 100_000), code="FINE")

        body = api.get(f"{BASE}/due/").json()
        overdue = api.get(f"{BASE}/due/", {"state": "overdue", "aircraft": aircraft.pk}).json()
        ok_only = api.get(f"{BASE}/due/", {"state": "ok"}).json()

        assert [(row["code"], row["state"]) for row in body] == [("LATE", "overdue")]
        assert body[0]["aircraft_serial"] == aircraft.serial_number
        assert overdue == body
        assert [row["code"] for row in ok_only] == ["FINE"]

    @pytest.mark.parametrize("params", [{"state": "bogus"}, {"aircraft": "abc"}])
    def test_due_list_rejects_bad_params(self, api, params):
        assert api.get(f"{BASE}/due/", params).status_code == 400
