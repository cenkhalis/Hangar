"""Maintenance domain logic: resetting inspection intervals, due status, work orders, sign-offs.

Usage since a sign-off is summed from flights that departed after it rather than snapshotted at
sign-off time, so flight logs that arrive late are attributed to the correct side of the sign-off.
"""

from __future__ import annotations

import datetime
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum

from django.db import transaction
from django.utils import timezone

from apps.fleet import services as fleet_services
from apps.fleet.exceptions import AircraftRetired
from apps.fleet.models import Aircraft
from apps.flights.models import Flight

from .exceptions import (
    CompletionAlreadyVoided,
    DuplicateOpenTask,
    EmptyWorkOrder,
    InvalidTimestamp,
    ItemNotPending,
    MissingPerformer,
    MissingReason,
    TaskNotInProgram,
    WorkOrderNotOpen,
)
from .models import (
    InspectionInterval,
    MaintenanceProgram,
    MaintenanceTask,
    TaskCompletion,
    WorkOrder,
    WorkOrderItem,
)

IntervalType = InspectionInterval.IntervalType


class DueState(StrEnum):
    UNTRACKED = "untracked"
    NOT_STARTED = "not_started"
    OK = "ok"
    DUE_SOON = "due_soon"
    OVERDUE = "overdue"


_SEVERITY = {
    DueState.UNTRACKED: 0,
    DueState.NOT_STARTED: 1,
    DueState.OK: 2,
    DueState.DUE_SOON: 3,
    DueState.OVERDUE: 4,
}

_FROM_LIFE_STATE = {
    fleet_services.LifeState.OK: DueState.OK,
    fleet_services.LifeState.DUE_SOON: DueState.DUE_SOON,
    fleet_services.LifeState.EXPIRED: DueState.OVERDUE,
}


def worst_state(states: Iterable[DueState]) -> DueState:
    return max(states, key=_SEVERITY.__getitem__, default=DueState.UNTRACKED)


# --- Interval evaluation (pure) --------------------------------------------------------------


@dataclass(frozen=True)
class IntervalStatus:
    interval_type: str
    interval: Decimal
    used: Decimal | None
    remaining: Decimal | None
    percent_used: Decimal | None
    state: DueState
    # Exactly one of these describes when the task falls due for this interval.
    due_date: datetime.date | None = None
    due_at_aircraft_hours: Decimal | None = None
    due_at_aircraft_cycles: Decimal | None = None


def evaluate_interval(
    interval_type: str, value: Decimal, used: Decimal, *, warning_threshold_percent: Decimal
) -> IntervalStatus:
    """Classify usage since the last sign-off; ``remaining <= 0`` is overdue."""
    life = fleet_services.evaluate_limit(
        interval_type, value, used, warning_threshold_percent=warning_threshold_percent
    )
    return IntervalStatus(
        interval_type=interval_type,
        interval=value,
        used=life.used,
        remaining=life.remaining,
        percent_used=life.percent_used,
        state=_FROM_LIFE_STATE[life.state],
    )


@dataclass(frozen=True)
class Usage:
    flight_seconds: int = 0
    cycles: int = 0


@dataclass(frozen=True)
class Baseline:
    """Where an interval count starts: the last valid sign-off, or the aircraft when new."""

    usage_since: Usage
    start_date: datetime.date | None


def interval_status(
    interval: InspectionInterval, baseline: Baseline, aircraft: Aircraft, *, today: datetime.date
) -> IntervalStatus:
    kwargs = {"warning_threshold_percent": interval.warning_threshold_percent}
    if interval.interval_type == IntervalType.FLIGHT_HOURS:
        used = fleet_services.seconds_to_hours(baseline.usage_since.flight_seconds)
        status = evaluate_interval(interval.interval_type, interval.value, used, **kwargs)
        due_at = fleet_services.seconds_to_hours(aircraft.flight_seconds) + status.remaining
        return _with(status, due_at_aircraft_hours=due_at)
    if interval.interval_type == IntervalType.CYCLES:
        used = Decimal(baseline.usage_since.cycles)
        status = evaluate_interval(interval.interval_type, interval.value, used, **kwargs)
        return _with(status, due_at_aircraft_cycles=Decimal(aircraft.cycles) + status.remaining)
    if interval.interval_type == IntervalType.CALENDAR_DAYS:
        if baseline.start_date is None:
            return IntervalStatus(
                interval_type=interval.interval_type,
                interval=interval.value,
                used=None,
                remaining=None,
                percent_used=None,
                state=DueState.NOT_STARTED,
            )
        used = Decimal((today - baseline.start_date).days)
        status = evaluate_interval(interval.interval_type, interval.value, used, **kwargs)
        due_date = baseline.start_date + datetime.timedelta(days=int(interval.value))
        return _with(status, due_date=due_date)
    raise ValueError(f"Unknown interval type: {interval.interval_type}")


def _with(status: IntervalStatus, **due) -> IntervalStatus:
    return IntervalStatus(**{**status.__dict__, **due})


# --- Status queries --------------------------------------------------------------------------


@dataclass(frozen=True)
class TaskStatus:
    task: MaintenanceTask
    state: DueState
    last_completion: TaskCompletion | None
    intervals: list[IntervalStatus]


@dataclass(frozen=True)
class MaintenanceReport:
    aircraft: Aircraft
    state: DueState
    tasks: list[TaskStatus]


def get_usage_since(aircraft: Aircraft, since: datetime.datetime | None) -> Usage:
    """Usage accrued after ``since``; the aircraft's totals when it has never been signed off."""
    if since is None:
        return Usage(flight_seconds=aircraft.flight_seconds, cycles=aircraft.cycles)
    flights = Flight.objects.filter(aircraft=aircraft, departure_at__gte=since).values_list(
        "departure_at", "arrival_at", "cycles"
    )
    return _sum_flights(flights, since)


def _sum_flights(flights, since: datetime.datetime) -> Usage:
    seconds = cycles = 0
    for departure_at, arrival_at, flight_cycles in flights:
        if departure_at >= since:
            seconds += round((arrival_at - departure_at).total_seconds())
            cycles += flight_cycles
    return Usage(flight_seconds=seconds, cycles=cycles)


def _baseline(aircraft: Aircraft, completion: TaskCompletion | None, flights) -> Baseline:
    if completion is None:
        return Baseline(
            usage_since=Usage(flight_seconds=aircraft.flight_seconds, cycles=aircraft.cycles),
            start_date=aircraft.in_service_date,
        )
    return Baseline(
        usage_since=_sum_flights(flights, completion.performed_at),
        start_date=timezone.localtime(completion.performed_at).date(),
    )


def _task_status(task, completion, aircraft, flights, today) -> TaskStatus:
    baseline = _baseline(aircraft, completion, flights)
    intervals = [
        interval_status(interval, baseline, aircraft, today=today)
        for interval in task.intervals.all()
    ]
    return TaskStatus(
        task=task,
        state=worst_state(s.state for s in intervals),
        last_completion=completion,
        intervals=intervals,
    )


def latest_completions(aircraft: Aircraft, tasks: Sequence[MaintenanceTask]):
    """Latest non-voided sign-off per task, in one query (PostgreSQL DISTINCT ON)."""
    completions = (
        TaskCompletion.objects.filter(aircraft=aircraft, task__in=tasks, voided_at__isnull=True)
        .order_by("task_id", "-performed_at", "-id")
        .distinct("task_id")
    )
    return {c.task_id: c for c in completions}


def get_aircraft_maintenance_status(
    aircraft: Aircraft, *, today: datetime.date
) -> MaintenanceReport:
    """Status of every active task in the aircraft's program, in a fixed number of queries."""
    program = MaintenanceProgram.objects.filter(aircraft_model_id=aircraft.model_id).first()
    if program is None:
        return MaintenanceReport(aircraft=aircraft, state=DueState.UNTRACKED, tasks=[])

    tasks = list(program.tasks.filter(is_active=True).prefetch_related("intervals"))
    completions = latest_completions(aircraft, tasks)
    flights = []
    if completions:
        earliest = min(c.performed_at for c in completions.values())
        flights = list(
            Flight.objects.filter(aircraft=aircraft, departure_at__gte=earliest).values_list(
                "departure_at", "arrival_at", "cycles"
            )
        )
    statuses = [
        _task_status(task, completions.get(task.pk), aircraft, flights, today) for task in tasks
    ]
    return MaintenanceReport(
        aircraft=aircraft, state=worst_state(s.state for s in statuses), tasks=statuses
    )


def get_task_status(
    aircraft: Aircraft, task: MaintenanceTask, *, today: datetime.date
) -> TaskStatus:
    completion = latest_completions(aircraft, [task]).get(task.pk)
    flights = []
    if completion is not None:
        flights = Flight.objects.filter(
            aircraft=aircraft, departure_at__gte=completion.performed_at
        ).values_list("departure_at", "arrival_at", "cycles")
    return _task_status(task, completion, aircraft, flights, today)


@dataclass(frozen=True)
class DueItem:
    aircraft: Aircraft
    status: TaskStatus


DEFAULT_DUE_STATES = frozenset({DueState.DUE_SOON, DueState.OVERDUE})


def get_fleet_due_list(
    *,
    today: datetime.date,
    states: Iterable[DueState] = DEFAULT_DUE_STATES,
    aircraft_ids: Iterable[int] | None = None,
) -> list[DueItem]:
    """Tasks in the given states across non-retired aircraft, most severe first."""
    wanted = set(states)
    fleet = Aircraft.objects.exclude(status=Aircraft.Status.RETIRED).order_by("serial_number")
    if aircraft_ids is not None:
        fleet = fleet.filter(pk__in=list(aircraft_ids))
    items = [
        DueItem(aircraft=aircraft, status=status)
        for aircraft in fleet
        for status in get_aircraft_maintenance_status(aircraft, today=today).tasks
        if status.state in wanted
    ]
    return sorted(items, key=lambda i: -_SEVERITY[i.status.state])


# --- Commands --------------------------------------------------------------------------------


def _ensure_in_program(aircraft: Aircraft, task: MaintenanceTask) -> None:
    if task.program.aircraft_model_id != aircraft.model_id:
        raise TaskNotInProgram(f"Task {task.code} is not in the program for {aircraft}.")


def _ensure_not_future(value: datetime.datetime, label: str) -> None:
    if value > timezone.now():
        raise InvalidTimestamp(f"{label} cannot be in the future.")


@transaction.atomic
def create_work_order(
    aircraft: Aircraft,
    tasks: Sequence[MaintenanceTask],
    *,
    title: str,
    notes: str = "",
    opened_at: datetime.datetime,
) -> WorkOrder:
    aircraft = Aircraft.objects.select_for_update().get(pk=aircraft.pk)
    if aircraft.status == Aircraft.Status.RETIRED:
        raise AircraftRetired(f"Aircraft {aircraft} is retired.")
    if not tasks:
        raise EmptyWorkOrder("A work order needs at least one task.")
    if len({t.pk for t in tasks}) != len(tasks):
        raise EmptyWorkOrder("A task can appear only once in a work order.")
    _ensure_not_future(opened_at, "opened_at")
    for task in tasks:
        _ensure_in_program(aircraft, task)
        if not task.is_active:
            raise TaskNotInProgram(f"Task {task.code} is inactive.")

    pending = (
        WorkOrderItem.objects.filter(
            work_order__aircraft=aircraft,
            work_order__status=WorkOrder.Status.OPEN,
            status=WorkOrderItem.Status.PENDING,
            task__in=tasks,
        )
        .select_related("task", "work_order")
        .first()
    )
    if pending is not None:
        raise DuplicateOpenTask(
            f"Task {pending.task.code} is already pending on work order {pending.work_order_id}."
        )

    work_order = WorkOrder.objects.create(
        aircraft=aircraft, title=title, notes=notes, opened_at=opened_at
    )
    WorkOrderItem.objects.bulk_create(WorkOrderItem(work_order=work_order, task=t) for t in tasks)
    return work_order


@transaction.atomic
def sign_off_item(
    item: WorkOrderItem,
    *,
    performed_at: datetime.datetime,
    performed_by: str,
    notes: str = "",
) -> TaskCompletion:
    """Record the work, which restarts every interval of the task from ``performed_at``."""
    work_order = WorkOrder.objects.select_for_update().get(pk=item.work_order_id)
    item = WorkOrderItem.objects.select_for_update().get(pk=item.pk)
    if work_order.status != WorkOrder.Status.OPEN:
        raise WorkOrderNotOpen(f"Work order {work_order.pk} is {work_order.status}.")
    if item.status != WorkOrderItem.Status.PENDING:
        raise ItemNotPending(f"Item {item.pk} is {item.status}.")
    if not performed_by.strip():
        raise MissingPerformer("performed_by is required.")
    _ensure_not_future(performed_at, "performed_at")
    if performed_at < work_order.opened_at:
        raise InvalidTimestamp("performed_at cannot precede the work order's opening.")

    completion = TaskCompletion.objects.create(
        aircraft_id=work_order.aircraft_id,
        task_id=item.task_id,
        work_order_item=item,
        kind=TaskCompletion.Kind.WORK_ORDER,
        performed_at=performed_at,
        performed_by=performed_by.strip(),
        notes=notes,
    )
    item.status = WorkOrderItem.Status.SIGNED_OFF
    item.save(update_fields=["status"])

    if not work_order.items.filter(status=WorkOrderItem.Status.PENDING).exists():
        last = (
            TaskCompletion.objects.filter(work_order_item__work_order=work_order)
            .order_by("-performed_at")
            .values_list("performed_at", flat=True)
            .first()
        )
        work_order.status = WorkOrder.Status.COMPLETED
        work_order.closed_at = last
        work_order.save(update_fields=["status", "closed_at"])
    return completion


@transaction.atomic
def cancel_work_order(work_order: WorkOrder, *, reason: str) -> WorkOrder:
    work_order = WorkOrder.objects.select_for_update().get(pk=work_order.pk)
    if work_order.status != WorkOrder.Status.OPEN:
        raise WorkOrderNotOpen(f"Work order {work_order.pk} is {work_order.status}.")
    if not reason.strip():
        raise MissingReason("A cancellation reason is required.")
    work_order.items.filter(status=WorkOrderItem.Status.PENDING).update(
        status=WorkOrderItem.Status.CANCELLED
    )
    work_order.status = WorkOrder.Status.CANCELLED
    work_order.closed_at = max(timezone.now(), work_order.opened_at)
    work_order.cancel_reason = reason.strip()
    work_order.save(update_fields=["status", "closed_at", "cancel_reason"])
    return work_order


@transaction.atomic
def record_historical_completion(
    aircraft: Aircraft,
    task: MaintenanceTask,
    *,
    performed_at: datetime.datetime,
    performed_by: str,
    notes: str = "",
) -> TaskCompletion:
    """Record maintenance done before the aircraft was tracked (e.g. when onboarding it)."""
    _ensure_in_program(aircraft, task)
    _ensure_not_future(performed_at, "performed_at")
    if not performed_by.strip():
        raise MissingPerformer("performed_by is required.")
    return TaskCompletion.objects.create(
        aircraft=aircraft,
        task=task,
        kind=TaskCompletion.Kind.HISTORICAL,
        performed_at=performed_at,
        performed_by=performed_by.strip(),
        notes=notes,
    )


@transaction.atomic
def void_completion(completion: TaskCompletion, *, reason: str) -> TaskCompletion:
    """Invalidate a sign-off. It stays in the history; due status reverts to the previous one."""
    completion = TaskCompletion.objects.select_for_update().get(pk=completion.pk)
    if completion.voided_at is not None:
        raise CompletionAlreadyVoided(f"Completion {completion.pk} is already voided.")
    if not reason.strip():
        raise MissingReason("A void reason is required.")
    completion.voided_at = timezone.now()
    completion.void_reason = reason.strip()
    completion.save(update_fields=["voided_at", "void_reason"])
    return completion
