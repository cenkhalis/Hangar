"""Database-level constraints, exercised by bypassing the service layer."""

from decimal import Decimal

import pytest
from django.db import IntegrityError
from django.utils import timezone

from apps.maintenance.models import InspectionInterval, TaskCompletion, WorkOrder, WorkOrderItem

from .factories import (
    InspectionIntervalFactory,
    MaintenanceProgramFactory,
    MaintenanceTaskFactory,
    TaskCompletionFactory,
    WorkOrderFactory,
)

pytestmark = pytest.mark.django_db

IntervalType = InspectionInterval.IntervalType


def test_one_program_per_aircraft_model():
    program = MaintenanceProgramFactory()

    with pytest.raises(IntegrityError):
        MaintenanceProgramFactory(aircraft_model=program.aircraft_model)


def test_task_code_unique_per_program():
    task = MaintenanceTaskFactory(code="X")
    MaintenanceTaskFactory(code="X")  # other program

    with pytest.raises(IntegrityError):
        MaintenanceTaskFactory(program=task.program, code="X")


def test_interval_type_unique_per_task():
    interval = InspectionIntervalFactory()

    with pytest.raises(IntegrityError):
        InspectionIntervalFactory(task=interval.task, interval_type=interval.interval_type)


@pytest.mark.parametrize(
    "overrides",
    [
        {"value": Decimal("0")},
        {"interval_type": IntervalType.CYCLES, "value": Decimal("2.5")},
        {"interval_type": IntervalType.CALENDAR_DAYS, "value": Decimal("30.5")},
        {"warning_threshold_percent": Decimal("0")},
        {"warning_threshold_percent": Decimal("100")},
    ],
)
def test_interval_checks(overrides):
    with pytest.raises(IntegrityError):
        InspectionIntervalFactory(**overrides)


def test_fractional_hours_allowed():
    assert InspectionIntervalFactory(value=Decimal("2.5")).value == Decimal("2.5")


def test_open_order_cannot_have_closed_at():
    with pytest.raises(IntegrityError):
        WorkOrderFactory(closed_at=timezone.now())


def test_closed_order_requires_closed_at():
    with pytest.raises(IntegrityError):
        WorkOrderFactory(status=WorkOrder.Status.COMPLETED)


def test_closed_at_cannot_precede_opened_at():
    now = timezone.now()
    with pytest.raises(IntegrityError):
        WorkOrderFactory(
            status=WorkOrder.Status.COMPLETED,
            opened_at=now,
            closed_at=now - timezone.timedelta(minutes=1),
        )


def test_cancel_reason_only_on_cancelled_orders():
    with pytest.raises(IntegrityError):
        WorkOrderFactory(cancel_reason="Why not")


def test_task_once_per_order():
    work_order = WorkOrderFactory()
    task = MaintenanceTaskFactory()
    WorkOrderItem.objects.create(work_order=work_order, task=task)

    with pytest.raises(IntegrityError):
        WorkOrderItem.objects.create(work_order=work_order, task=task)


def test_work_order_completion_requires_item():
    with pytest.raises(IntegrityError):
        TaskCompletionFactory(kind=TaskCompletion.Kind.WORK_ORDER, performed_at=timezone.now())


def test_historical_completion_cannot_link_item():
    item = WorkOrderItem.objects.create(
        work_order=WorkOrderFactory(), task=MaintenanceTaskFactory()
    )

    with pytest.raises(IntegrityError):
        TaskCompletionFactory(
            kind=TaskCompletion.Kind.HISTORICAL, work_order_item=item, performed_at=timezone.now()
        )


def test_voided_at_requires_reason():
    with pytest.raises(IntegrityError):
        TaskCompletionFactory(performed_at=timezone.now(), voided_at=timezone.now())


def test_reason_requires_voided_at():
    with pytest.raises(IntegrityError):
        TaskCompletionFactory(performed_at=timezone.now(), void_reason="Mistake")


def test_performed_by_required():
    with pytest.raises(IntegrityError):
        TaskCompletionFactory(performed_at=timezone.now(), performed_by="")


def test_item_has_at_most_one_completion():
    item = WorkOrderItem.objects.create(
        work_order=WorkOrderFactory(), task=MaintenanceTaskFactory()
    )
    TaskCompletionFactory(
        kind=TaskCompletion.Kind.WORK_ORDER, work_order_item=item, performed_at=timezone.now()
    )

    with pytest.raises(IntegrityError):
        TaskCompletionFactory(
            kind=TaskCompletion.Kind.WORK_ORDER, work_order_item=item, performed_at=timezone.now()
        )
