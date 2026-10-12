import datetime
from decimal import Decimal

import pytest

from apps.fleet.models import Aircraft
from apps.fleet.tests.factories import AircraftFactory
from apps.maintenance import services
from apps.maintenance.services import DueState

from .conftest import CYCLES, DAYS, HOURS, add_task, at, fly
from .factories import MaintenanceProgramFactory

pytestmark = pytest.mark.django_db

TODAY = datetime.date(2026, 6, 1)


def status_of(aircraft, task, today=TODAY):
    return services.get_task_status(aircraft, task, today=today)


def sign_off(aircraft, task, when):
    return services.record_historical_completion(
        aircraft, task, performed_at=when, performed_by="Tech"
    )


def test_never_done_counts_from_new(aircraft, program):
    task = add_task(program, (HOURS, 50), (DAYS, 180))
    aircraft.flight_seconds = 48 * 3600
    aircraft.save()

    status = status_of(aircraft, task)

    by_type = {i.interval_type: i for i in status.intervals}
    assert by_type[HOURS].used == Decimal("48")
    assert by_type[HOURS].state == DueState.DUE_SOON
    assert by_type[DAYS].used == Decimal((TODAY - aircraft.in_service_date).days)
    assert status.last_completion is None


def test_never_done_without_in_service_date_has_calendar_not_started(program):
    aircraft = AircraftFactory(model=program.aircraft_model, in_service_date=None)
    task = add_task(program, (DAYS, 90))

    assert status_of(aircraft, task).state == DueState.NOT_STARTED


def test_sign_off_resets_the_interval(aircraft, program):
    task = add_task(program, (HOURS, 50))
    aircraft.flight_seconds = 60 * 3600
    aircraft.save()
    assert status_of(aircraft, task).state == DueState.OVERDUE

    sign_off(aircraft, task, at(2026, 5, 1))

    status = status_of(aircraft, task)
    assert status.state == DueState.OK
    assert status.intervals[0].used == Decimal("0")
    assert status.intervals[0].due_at_aircraft_hours == Decimal("110")


def test_usage_after_sign_off_accumulates(aircraft, program):
    task = add_task(program, (HOURS, 10), (CYCLES, 20))
    sign_off(aircraft, task, at(2026, 5, 1))
    for day in range(2, 11):
        fly(aircraft, at(2026, 5, day), 60, cycles=2)  # 9 h, 18 cycles

    status = status_of(aircraft, task)

    by_type = {i.interval_type: i for i in status.intervals}
    assert by_type[HOURS].used == Decimal("9")
    assert by_type[CYCLES].used == Decimal("18")
    assert status.state == DueState.DUE_SOON


def test_calendar_restarts_from_sign_off_date(aircraft, program):
    task = add_task(program, (DAYS, 30))
    sign_off(aircraft, task, at(2026, 5, 20))

    interval = status_of(aircraft, task).intervals[0]

    assert interval.used == Decimal("12")
    assert interval.due_date == datetime.date(2026, 6, 19)


def test_latest_valid_completion_is_used(aircraft, program):
    task = add_task(program, (DAYS, 30))
    sign_off(aircraft, task, at(2026, 4, 1))
    latest = sign_off(aircraft, task, at(2026, 5, 25))
    sign_off(aircraft, task, at(2026, 3, 1))  # backfilled older record

    assert status_of(aircraft, task).last_completion == latest


def test_voided_completion_falls_back_to_previous(aircraft, program):
    task = add_task(program, (DAYS, 30))
    previous = sign_off(aircraft, task, at(2026, 4, 1))
    mistaken = sign_off(aircraft, task, at(2026, 5, 25))

    services.void_completion(mistaken, reason="Wrong aircraft")

    status = status_of(aircraft, task)
    assert status.last_completion == previous
    assert status.state == DueState.OVERDUE


def test_voiding_only_completion_falls_back_to_new(aircraft, program):
    task = add_task(program, (HOURS, 50))
    aircraft.flight_seconds = 55 * 3600
    aircraft.save()
    services.void_completion(sign_off(aircraft, task, at(2026, 5, 1)), reason="Typo")

    assert status_of(aircraft, task).state == DueState.OVERDUE


def test_first_due_interval_wins(aircraft, program):
    task = add_task(program, (HOURS, 500), (DAYS, 30))
    sign_off(aircraft, task, at(2026, 4, 1))

    status = status_of(aircraft, task)

    assert {i.interval_type: i.state for i in status.intervals} == {
        HOURS: DueState.OK,
        DAYS: DueState.OVERDUE,
    }
    assert status.state == DueState.OVERDUE


def test_completions_on_other_aircraft_do_not_count(aircraft, program):
    task = add_task(program, (DAYS, 30))
    sibling = AircraftFactory(model=program.aircraft_model)
    sign_off(sibling, task, at(2026, 5, 30))

    assert status_of(aircraft, task).last_completion is None


class TestAircraftReport:
    def test_report_covers_active_tasks_only(self, aircraft, program):
        add_task(program, (HOURS, 50), code="A")
        add_task(program, (HOURS, 50), code="B", is_active=False)

        report = services.get_aircraft_maintenance_status(aircraft, today=TODAY)

        assert [s.task.code for s in report.tasks] == ["A"]

    def test_report_state_is_worst_task(self, aircraft, program):
        ok = add_task(program, (DAYS, 365), code="OK")
        due = add_task(program, (DAYS, 10), code="DUE")
        sign_off(aircraft, ok, at(2026, 5, 1))
        sign_off(aircraft, due, at(2026, 5, 23))

        report = services.get_aircraft_maintenance_status(aircraft, today=TODAY)

        assert {s.task.code: s.state for s in report.tasks} == {
            "OK": DueState.OK,
            "DUE": DueState.DUE_SOON,
        }
        assert report.state == DueState.DUE_SOON

    def test_report_matches_single_task_status(self, aircraft, program):
        tasks = [add_task(program, (HOURS, 10), (CYCLES, 30)) for _ in range(3)]
        sign_off(aircraft, tasks[0], at(2026, 5, 1))
        sign_off(aircraft, tasks[1], at(2026, 5, 5))
        for day in range(2, 9):
            fly(aircraft, at(2026, 5, day), 50)

        report = services.get_aircraft_maintenance_status(aircraft, today=TODAY)

        for task_status in report.tasks:
            assert task_status == status_of(aircraft, task_status.task)

    def test_each_task_counts_only_flights_after_its_own_sign_off(self, aircraft, program):
        early = add_task(program, (HOURS, 100), code="EARLY")
        late = add_task(program, (HOURS, 100), code="LATE")
        sign_off(aircraft, early, at(2026, 5, 1))
        sign_off(aircraft, late, at(2026, 5, 10))
        fly(aircraft, at(2026, 5, 5), 120)  # between the two sign-offs (e.g. a late log)
        fly(aircraft, at(2026, 5, 12), 60)

        report = services.get_aircraft_maintenance_status(aircraft, today=TODAY)

        used = {s.task.code: s.intervals[0].used for s in report.tasks}
        assert used == {"EARLY": Decimal("3"), "LATE": Decimal("1")}

    def test_aircraft_without_program_is_untracked(self):
        report = services.get_aircraft_maintenance_status(AircraftFactory(), today=TODAY)

        assert report.state == DueState.UNTRACKED
        assert report.tasks == []

    def test_query_count_is_constant(self, aircraft, program, django_assert_max_num_queries):
        for _ in range(20):
            task = add_task(program, (HOURS, 50), (DAYS, 90))
            sign_off(aircraft, task, at(2026, 5, 1))
        for day in range(2, 12):
            fly(aircraft, at(2026, 5, day), 30)

        # program, tasks, intervals, latest completions, flights
        with django_assert_max_num_queries(5):
            report = services.get_aircraft_maintenance_status(aircraft, today=TODAY)

        assert len(report.tasks) == 20


class TestFleetDueList:
    def test_lists_due_soon_and_overdue_only(self, aircraft, program):
        add_task(program, (DAYS, 1000), code="FINE")
        add_task(program, (DAYS, 160), code="SOON")  # 151 days since in-service
        add_task(program, (DAYS, 100), code="LATE")

        items = services.get_fleet_due_list(today=TODAY)

        assert [(i.status.task.code, i.status.state) for i in items] == [
            ("LATE", DueState.OVERDUE),
            ("SOON", DueState.DUE_SOON),
        ]

    def test_excludes_retired_aircraft(self, program):
        add_task(program, (DAYS, 10))
        AircraftFactory(
            model=program.aircraft_model,
            in_service_date=datetime.date(2025, 1, 1),
            status=Aircraft.Status.RETIRED,
        )

        assert services.get_fleet_due_list(today=TODAY) == []

    def test_filters_by_state_and_aircraft(self, aircraft, program):
        add_task(program, (DAYS, 160), code="SOON")
        add_task(program, (DAYS, 100), code="LATE")
        other = AircraftFactory(
            model=program.aircraft_model, in_service_date=datetime.date(2026, 1, 1)
        )

        overdue = services.get_fleet_due_list(today=TODAY, states=[DueState.OVERDUE])
        mine = services.get_fleet_due_list(today=TODAY, aircraft_ids=[other.pk])

        assert {i.aircraft for i in overdue} == {aircraft, other}
        assert {i.status.state for i in overdue} == {DueState.OVERDUE}
        assert {i.aircraft for i in mine} == {other}

    def test_aircraft_of_other_models_use_their_own_program(self, aircraft, program):
        add_task(program, (DAYS, 100))
        other_program = MaintenanceProgramFactory()
        AircraftFactory(
            model=other_program.aircraft_model, in_service_date=datetime.date(2026, 1, 1)
        )

        items = services.get_fleet_due_list(today=TODAY)

        assert {i.aircraft for i in items} == {aircraft}
