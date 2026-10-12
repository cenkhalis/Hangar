"""Interval evaluation: pure state classification and due points."""

import datetime
from decimal import Decimal

import pytest

from apps.fleet.models import Aircraft
from apps.maintenance.models import InspectionInterval
from apps.maintenance.services import (
    Baseline,
    DueState,
    Usage,
    evaluate_interval,
    interval_status,
    worst_state,
)

from .conftest import CYCLES, DAYS, HOURS

TEN = Decimal("10")
TODAY = datetime.date(2026, 6, 1)


@pytest.mark.parametrize(
    ("interval", "used", "expected"),
    [
        ("50", "0", DueState.OK),
        ("50", "44.99", DueState.OK),
        ("50", "45", DueState.DUE_SOON),  # exactly 10% remaining
        ("50", "49.99", DueState.DUE_SOON),
        ("50", "50", DueState.OVERDUE),  # remaining == 0 is overdue
        ("50", "75", DueState.OVERDUE),
        ("2.5", "2.25", DueState.DUE_SOON),  # fractional hours
        ("2.5", "2.24", DueState.OK),
    ],
)
def test_evaluate_interval_states(interval, used, expected):
    status = evaluate_interval(
        HOURS, Decimal(interval), Decimal(used), warning_threshold_percent=TEN
    )

    assert status.state == expected


@pytest.mark.parametrize("interval_type", [HOURS, CYCLES, DAYS])
def test_every_interval_type_is_evaluated(interval_type):
    status = evaluate_interval(
        interval_type, Decimal("100"), Decimal("100"), warning_threshold_percent=TEN
    )

    assert status.state == DueState.OVERDUE
    assert status.remaining == Decimal("0")


def test_custom_threshold():
    kwargs = {"warning_threshold_percent": Decimal("30")}

    assert evaluate_interval(HOURS, Decimal("100"), Decimal("71"), **kwargs).state == "due_soon"
    assert evaluate_interval(HOURS, Decimal("100"), Decimal("69"), **kwargs).state == "ok"


@pytest.mark.parametrize(
    ("states", "expected"),
    [
        ([], DueState.UNTRACKED),
        ([DueState.OK, DueState.DUE_SOON], DueState.DUE_SOON),
        ([DueState.OVERDUE, DueState.OK], DueState.OVERDUE),
        ([DueState.NOT_STARTED, DueState.OK], DueState.OK),
    ],
)
def test_worst_state(states, expected):
    assert worst_state(states) == expected


def make_interval(interval_type, value):
    return InspectionInterval(
        interval_type=interval_type, value=Decimal(value), warning_threshold_percent=TEN
    )


AIRCRAFT = Aircraft(flight_seconds=120 * 3600, cycles=300)


def test_hours_due_point_is_current_reading_plus_remaining():
    baseline = Baseline(usage_since=Usage(flight_seconds=20 * 3600), start_date=None)

    status = interval_status(make_interval(HOURS, "50"), baseline, AIRCRAFT, today=TODAY)

    assert status.used == Decimal("20")
    assert status.remaining == Decimal("30")
    assert status.due_at_aircraft_hours == Decimal("150")
    assert status.due_date is None


def test_overdue_hours_due_point_is_in_the_past():
    baseline = Baseline(usage_since=Usage(flight_seconds=60 * 3600), start_date=None)

    status = interval_status(make_interval(HOURS, "50"), baseline, AIRCRAFT, today=TODAY)

    assert status.state == DueState.OVERDUE
    assert status.due_at_aircraft_hours == Decimal("110")


def test_cycles_due_point():
    baseline = Baseline(usage_since=Usage(cycles=40), start_date=None)

    status = interval_status(make_interval(CYCLES, "100"), baseline, AIRCRAFT, today=TODAY)

    assert status.due_at_aircraft_cycles == Decimal("360")


def test_calendar_due_date_and_usage():
    baseline = Baseline(usage_since=Usage(), start_date=datetime.date(2026, 4, 1))

    status = interval_status(make_interval(DAYS, "90"), baseline, AIRCRAFT, today=TODAY)

    assert status.used == Decimal("61")
    assert status.due_date == datetime.date(2026, 6, 30)
    assert status.state == DueState.OK


def test_calendar_interval_without_start_date_is_not_started():
    baseline = Baseline(usage_since=Usage(), start_date=None)

    status = interval_status(make_interval(DAYS, "90"), baseline, AIRCRAFT, today=TODAY)

    assert status.state == DueState.NOT_STARTED
    assert status.used is None
