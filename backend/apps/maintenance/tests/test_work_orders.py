import datetime

import pytest
from django.utils import timezone

from apps.fleet.exceptions import AircraftRetired
from apps.fleet.models import Aircraft
from apps.fleet.tests.factories import AircraftFactory
from apps.maintenance import services
from apps.maintenance.exceptions import (
    DuplicateOpenTask,
    EmptyWorkOrder,
    InvalidTimestamp,
    ItemNotPending,
    MissingPerformer,
    MissingReason,
    TaskNotInProgram,
    WorkOrderNotOpen,
)
from apps.maintenance.models import TaskCompletion, WorkOrder, WorkOrderItem
from apps.maintenance.services import DueState

from .conftest import DAYS, HOURS, add_task
from .factories import MaintenanceProgramFactory

pytestmark = pytest.mark.django_db

HOUR = datetime.timedelta(hours=1)


@pytest.fixture
def now():
    return timezone.now().replace(microsecond=0)


@pytest.fixture
def tasks(program):
    return [add_task(program, (HOURS, 50), code="A"), add_task(program, (DAYS, 90), code="B")]


def open_order(aircraft, tasks, opened_at):
    return services.create_work_order(aircraft, tasks, title="50 h check", opened_at=opened_at)


def items_by_code(work_order):
    return {i.task.code: i for i in work_order.items.select_related("task")}


class TestCreate:
    def test_creates_open_order_with_pending_items(self, aircraft, tasks, now):
        work_order = open_order(aircraft, tasks, now - HOUR)

        assert work_order.status == WorkOrder.Status.OPEN
        assert work_order.closed_at is None
        assert {i.task.code: i.status for i in work_order.items.all()} == {
            "A": WorkOrderItem.Status.PENDING,
            "B": WorkOrderItem.Status.PENDING,
        }

    @pytest.mark.parametrize(
        ("scenario", "error"),
        [
            ("retired aircraft", AircraftRetired),
            ("no tasks", EmptyWorkOrder),
            ("duplicate task", EmptyWorkOrder),
            ("other program", TaskNotInProgram),
            ("inactive task", TaskNotInProgram),
            ("future opening", InvalidTimestamp),
        ],
    )
    def test_rejections_write_nothing(self, aircraft, program, tasks, now, scenario, error):
        task_list, opened_at = list(tasks), now - HOUR
        if scenario == "retired aircraft":
            Aircraft.objects.filter(pk=aircraft.pk).update(status=Aircraft.Status.RETIRED)
        elif scenario == "no tasks":
            task_list = []
        elif scenario == "duplicate task":
            task_list = [tasks[0], tasks[0]]
        elif scenario == "other program":
            task_list = [add_task(MaintenanceProgramFactory(), (HOURS, 10))]
        elif scenario == "inactive task":
            task_list = [add_task(program, (HOURS, 10), is_active=False)]
        elif scenario == "future opening":
            opened_at = now + HOUR

        with pytest.raises(error):
            open_order(aircraft, task_list, opened_at)

        assert not WorkOrder.objects.exists()
        assert not WorkOrderItem.objects.exists()

    def test_task_pending_on_another_open_order_is_rejected(self, aircraft, tasks, now):
        open_order(aircraft, [tasks[0]], now - HOUR)

        with pytest.raises(DuplicateOpenTask):
            open_order(aircraft, tasks, now - HOUR)

        assert WorkOrder.objects.count() == 1

    def test_same_task_on_other_aircraft_is_allowed(self, aircraft, program, tasks, now):
        sibling = AircraftFactory(model=program.aircraft_model)
        open_order(aircraft, [tasks[0]], now - HOUR)

        open_order(sibling, [tasks[0]], now - HOUR)

    def test_task_is_available_again_after_completion_or_cancellation(self, aircraft, tasks, now):
        done = open_order(aircraft, [tasks[0]], now - 3 * HOUR)
        services.sign_off_item(done.items.get(), performed_at=now - 2 * HOUR, performed_by="Tech")
        cancelled = open_order(aircraft, [tasks[0]], now - HOUR)
        services.cancel_work_order(cancelled, reason="Parts not available")

        open_order(aircraft, [tasks[0]], now - HOUR)


class TestSignOff:
    def test_sign_off_records_completion_and_resets_task(self, aircraft, tasks, now):
        aircraft.flight_seconds = 60 * 3600
        aircraft.save()
        assert services.get_task_status(aircraft, tasks[0], today=now.date()).state == "overdue"
        work_order = open_order(aircraft, tasks, now - 2 * HOUR)
        item = items_by_code(work_order)["A"]

        completion = services.sign_off_item(
            item, performed_at=now - HOUR, performed_by="  J. Doe ", notes="All good"
        )

        assert completion.kind == TaskCompletion.Kind.WORK_ORDER
        assert completion.work_order_item == item
        assert completion.performed_by == "J. Doe"
        assert completion.aircraft == aircraft
        item.refresh_from_db()
        assert item.status == WorkOrderItem.Status.SIGNED_OFF
        status = services.get_task_status(aircraft, tasks[0], today=now.date())
        assert status.state == DueState.OK
        assert status.last_completion == completion

    def test_order_completes_when_last_item_is_signed_off(self, aircraft, tasks, now):
        work_order = open_order(aircraft, tasks, now - 5 * HOUR)
        items = items_by_code(work_order)

        services.sign_off_item(items["B"], performed_at=now - 2 * HOUR, performed_by="Tech")
        work_order.refresh_from_db()
        assert work_order.status == WorkOrder.Status.OPEN

        services.sign_off_item(items["A"], performed_at=now - 4 * HOUR, performed_by="Tech")
        work_order.refresh_from_db()
        assert work_order.status == WorkOrder.Status.COMPLETED
        assert work_order.closed_at == now - 2 * HOUR  # latest performed_at

    def test_item_cannot_be_signed_off_twice(self, aircraft, tasks, now):
        item = items_by_code(open_order(aircraft, tasks, now - 2 * HOUR))["A"]
        services.sign_off_item(item, performed_at=now - HOUR, performed_by="Tech")

        with pytest.raises(ItemNotPending):
            services.sign_off_item(item, performed_at=now - HOUR, performed_by="Tech")

        assert TaskCompletion.objects.count() == 1

    def test_cancelled_order_cannot_be_signed_off(self, aircraft, tasks, now):
        work_order = open_order(aircraft, tasks, now - 2 * HOUR)
        services.cancel_work_order(work_order, reason="Aircraft lost")

        with pytest.raises(WorkOrderNotOpen):
            services.sign_off_item(
                items_by_code(work_order)["A"], performed_at=now - HOUR, performed_by="Tech"
            )

    @pytest.mark.parametrize(
        ("offset", "performer", "error"),
        [
            (HOUR, "Tech", InvalidTimestamp),  # future
            (-3 * HOUR, "Tech", InvalidTimestamp),  # before the order was opened
            (-HOUR, "   ", MissingPerformer),
        ],
    )
    def test_invalid_sign_offs_write_nothing(self, aircraft, tasks, now, offset, performer, error):
        item = items_by_code(open_order(aircraft, tasks, now - 2 * HOUR))["A"]

        with pytest.raises(error):
            services.sign_off_item(item, performed_at=now + offset, performed_by=performer)

        item.refresh_from_db()
        assert item.status == WorkOrderItem.Status.PENDING
        assert not TaskCompletion.objects.exists()


class TestCancel:
    def test_cancel_keeps_signed_off_items(self, aircraft, tasks, now):
        work_order = open_order(aircraft, tasks, now - 2 * HOUR)
        items = items_by_code(work_order)
        services.sign_off_item(items["A"], performed_at=now - HOUR, performed_by="Tech")

        services.cancel_work_order(work_order, reason="Aircraft grounded for repair")

        work_order.refresh_from_db()
        assert work_order.status == WorkOrder.Status.CANCELLED
        assert work_order.cancel_reason == "Aircraft grounded for repair"
        assert work_order.closed_at is not None
        assert {i.task.code: i.status for i in work_order.items.all()} == {
            "A": WorkOrderItem.Status.SIGNED_OFF,
            "B": WorkOrderItem.Status.CANCELLED,
        }
        assert TaskCompletion.objects.filter(voided_at__isnull=True).count() == 1

    def test_cancel_twice_is_rejected(self, aircraft, tasks, now):
        work_order = open_order(aircraft, tasks, now - HOUR)
        services.cancel_work_order(work_order, reason="Duplicate")

        with pytest.raises(WorkOrderNotOpen):
            services.cancel_work_order(work_order, reason="Again")

    def test_cancel_requires_reason(self, aircraft, tasks, now):
        work_order = open_order(aircraft, tasks, now - HOUR)

        with pytest.raises(MissingReason):
            services.cancel_work_order(work_order, reason=" ")

        work_order.refresh_from_db()
        assert work_order.status == WorkOrder.Status.OPEN
