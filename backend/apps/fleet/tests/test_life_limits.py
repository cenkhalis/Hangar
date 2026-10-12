"""Life-limit evaluation: pure helpers and per-component status."""

import datetime
from decimal import Decimal

import pytest

from apps.fleet.models import ComponentLifeLimit
from apps.fleet.services import (
    LifeState,
    evaluate_limit,
    get_component_life_status,
    hours_to_seconds,
    seconds_to_hours,
    worst_state,
)
from apps.fleet.tests.factories import (
    ComponentFactory,
    ComponentLifeLimitFactory,
    ComponentTypeFactory,
)

HOURS = ComponentLifeLimit.LimitType.FLIGHT_HOURS
CYCLES = ComponentLifeLimit.LimitType.CYCLES
DAYS = ComponentLifeLimit.LimitType.CALENDAR_DAYS
TEN = Decimal("10")


@pytest.mark.parametrize(
    ("limit", "used", "expected"),
    [
        (Decimal("100"), Decimal("0"), LifeState.OK),
        (Decimal("100"), Decimal("89.99"), LifeState.OK),
        (Decimal("100"), Decimal("90"), LifeState.DUE_SOON),  # remaining exactly 10%
        (Decimal("100"), Decimal("99.99"), LifeState.DUE_SOON),
        (Decimal("100"), Decimal("100"), LifeState.EXPIRED),  # used == limit
        (Decimal("100"), Decimal("150"), LifeState.EXPIRED),
        (Decimal("2.5"), Decimal("2.25"), LifeState.DUE_SOON),  # fractional hours
        (Decimal("2.5"), Decimal("2.24"), LifeState.OK),
    ],
)
def test_evaluate_limit_states(limit, used, expected):
    assert evaluate_limit(HOURS, limit, used, warning_threshold_percent=TEN).state == expected


@pytest.mark.parametrize("limit_type", [HOURS, CYCLES, DAYS])
def test_evaluate_limit_works_for_every_limit_type(limit_type):
    status = evaluate_limit(
        limit_type, Decimal("300"), Decimal("299"), warning_threshold_percent=TEN
    )

    assert status.limit_type == limit_type
    assert status.state == LifeState.DUE_SOON


def test_evaluate_limit_reports_remaining_and_percent():
    status = evaluate_limit(HOURS, Decimal("200"), Decimal("50"), warning_threshold_percent=TEN)

    assert status.remaining == Decimal("150")
    assert status.percent_used == Decimal("25")


def test_evaluate_limit_over_limit_has_negative_remaining():
    status = evaluate_limit(CYCLES, Decimal("300"), Decimal("330"), warning_threshold_percent=TEN)

    assert status.remaining == Decimal("-30")
    assert status.percent_used == Decimal("110")


def test_evaluate_limit_honours_custom_warning_threshold():
    used = Decimal("75")
    limit = Decimal("100")

    assert evaluate_limit(HOURS, limit, used, warning_threshold_percent=TEN).state == LifeState.OK
    assert (
        evaluate_limit(HOURS, limit, used, warning_threshold_percent=Decimal("25")).state
        == LifeState.DUE_SOON
    )


def test_evaluate_limit_rejects_non_positive_limit():
    with pytest.raises(ValueError):
        evaluate_limit(HOURS, Decimal("0"), Decimal("1"), warning_threshold_percent=TEN)


@pytest.mark.parametrize(
    ("states", "expected"),
    [
        ([], LifeState.UNTRACKED),
        ([LifeState.OK, LifeState.OK], LifeState.OK),
        ([LifeState.OK, LifeState.DUE_SOON], LifeState.DUE_SOON),
        ([LifeState.DUE_SOON, LifeState.EXPIRED, LifeState.OK], LifeState.EXPIRED),
        ([LifeState.NOT_STARTED, LifeState.OK], LifeState.OK),
        ([LifeState.NOT_STARTED], LifeState.NOT_STARTED),
    ],
)
def test_worst_state(states, expected):
    assert worst_state(states) == expected


def test_hours_seconds_round_trip():
    assert hours_to_seconds(Decimal("2.5")) == 9000
    assert seconds_to_hours(9000) == Decimal("2.5")
    assert hours_to_seconds(Decimal("0.0001")) == 0


# --- get_component_life_status --------------------------------------------------------------

TODAY = datetime.date(2026, 6, 1)


def make_component(limits, **kwargs):
    component_type = ComponentTypeFactory()
    for limit_type, value, threshold in limits:
        ComponentLifeLimitFactory(
            component_type=component_type,
            limit_type=limit_type,
            value=Decimal(value),
            warning_threshold_percent=Decimal(threshold),
        )
    return ComponentFactory(component_type=component_type, **kwargs)


@pytest.mark.django_db
class TestComponentLifeStatus:
    def test_no_limits_is_untracked(self):
        status = get_component_life_status(make_component([]), today=TODAY)

        assert status.state == LifeState.UNTRACKED
        assert status.limits == []

    def test_hours_are_derived_from_seconds(self):
        component = make_component([(HOURS, "2.5", "10")], flight_seconds=8100)  # 2.25 h

        status = get_component_life_status(component, today=TODAY)

        assert status.limits[0].used == Decimal("2.25")
        assert status.state == LifeState.DUE_SOON

    def test_worst_limit_wins(self):
        component = make_component(
            [(HOURS, "500", "10"), (DAYS, "365", "10")],
            flight_seconds=hours_to_seconds(Decimal("10")),
            in_service_date=TODAY - datetime.timedelta(days=400),
        )

        status = get_component_life_status(component, today=TODAY)

        states = {s.limit_type: s.state for s in status.limits}
        assert states == {HOURS: LifeState.OK, DAYS: LifeState.EXPIRED}
        assert status.state == LifeState.EXPIRED

    def test_calendar_limit_counts_days_since_in_service(self):
        component = make_component(
            [(DAYS, "100", "10")], in_service_date=TODAY - datetime.timedelta(days=95)
        )

        status = get_component_life_status(component, today=TODAY)

        assert status.limits[0].used == Decimal("95")
        assert status.state == LifeState.DUE_SOON

    def test_calendar_limit_not_started_without_in_service_date(self):
        component = make_component([(DAYS, "365", "10"), (CYCLES, "300", "10")], cycles=10)

        status = get_component_life_status(component, today=TODAY)

        states = {s.limit_type: s for s in status.limits}
        assert states[DAYS].state == LifeState.NOT_STARTED
        assert states[DAYS].used is None
        assert status.state == LifeState.OK

    def test_per_limit_threshold_override(self):
        component = make_component([(CYCLES, "300", "30")], cycles=220)

        status = get_component_life_status(component, today=TODAY)

        assert status.state == LifeState.DUE_SOON
