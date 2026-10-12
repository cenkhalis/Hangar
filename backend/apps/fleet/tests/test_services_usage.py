import datetime

import pytest

from apps.fleet import services
from apps.fleet.exceptions import AircraftRetired, InvalidUsage
from apps.fleet.models import Aircraft, Component
from apps.fleet.tests.factories import AircraftFactory, ComponentFactory

pytestmark = pytest.mark.django_db

HOUR = datetime.timedelta(hours=1)
DAY = datetime.timedelta(days=1)


def usage_of(obj):
    obj.refresh_from_db()
    return obj.flight_seconds, obj.cycles


def test_usage_increments_aircraft_and_installed_components_only(t0):
    aircraft = AircraftFactory()
    other_aircraft = AircraftFactory()
    installed = ComponentFactory()
    on_other = ComponentFactory()
    removed = ComponentFactory()
    in_stock = ComponentFactory()
    services.install_component(installed, aircraft, at=t0)
    services.install_component(on_other, other_aircraft, at=t0)
    services.install_component(removed, aircraft, at=t0)
    services.remove_component(removed, at=t0)

    services.record_aircraft_usage(aircraft, flight_seconds=3600, cycles=2, flown_at=t0 + HOUR)

    assert usage_of(aircraft) == (3600, 2)
    assert usage_of(installed) == (3600, 2)
    for untouched in [other_aircraft, on_other, removed, in_stock]:
        assert usage_of(untouched) == (0, 0), untouched


def test_usage_accumulates_across_calls(t0):
    aircraft = AircraftFactory(flight_seconds=100, cycles=1)

    services.record_aircraft_usage(aircraft, flight_seconds=50, cycles=1, flown_at=t0)
    services.record_aircraft_usage(aircraft, flight_seconds=25, cycles=0, flown_at=t0)

    assert (aircraft.flight_seconds, aircraft.cycles) == (175, 2)


def test_usage_returns_refreshed_aircraft(t0):
    aircraft = AircraftFactory()

    result = services.record_aircraft_usage(aircraft, flight_seconds=60, cycles=1, flown_at=t0)

    assert result.flight_seconds == 60


@pytest.mark.parametrize(
    ("seconds", "cycles"),
    [(-1, 0), (0, -1), (0, 0)],
)
def test_invalid_usage_is_rejected(t0, seconds, cycles):
    aircraft = AircraftFactory()

    with pytest.raises(InvalidUsage):
        services.record_aircraft_usage(aircraft, flight_seconds=seconds, cycles=cycles, flown_at=t0)

    assert usage_of(aircraft) == (0, 0)


def test_usage_on_retired_aircraft_is_rejected(t0):
    aircraft = AircraftFactory(status=Aircraft.Status.RETIRED)

    with pytest.raises(AircraftRetired):
        services.record_aircraft_usage(aircraft, flight_seconds=60, cycles=1, flown_at=t0)


def test_usage_on_grounded_aircraft_is_allowed(t0):
    aircraft = AircraftFactory(status=Aircraft.Status.GROUNDED)

    services.record_aircraft_usage(aircraft, flight_seconds=60, cycles=1, flown_at=t0)

    assert aircraft.flight_seconds == 60


def test_component_usage_follows_component_between_aircraft(t0):
    aircraft_a = AircraftFactory()
    aircraft_b = AircraftFactory()
    component = ComponentFactory()

    services.install_component(component, aircraft_a, at=t0)
    services.record_aircraft_usage(
        aircraft_a, flight_seconds=10 * 3600, cycles=10, flown_at=t0 + HOUR
    )
    services.remove_component(component, at=t0 + DAY)
    services.install_component(component, aircraft_b, at=t0 + 2 * DAY)
    services.record_aircraft_usage(
        aircraft_b, flight_seconds=5 * 3600, cycles=4, flown_at=t0 + 2 * DAY + HOUR
    )

    assert usage_of(component) == (15 * 3600, 14)
    component.refresh_from_db()
    assert component.status == Component.Status.INSTALLED
    assert (aircraft_a.flight_seconds, aircraft_b.flight_seconds) == (10 * 3600, 5 * 3600)


class TestAttributionByFlightTime:
    """Usage goes to components installed when the flight happened, not when it is recorded."""

    def test_component_installed_after_flight_gets_no_usage(self, t0):
        aircraft = AircraftFactory()
        component = ComponentFactory()
        services.install_component(component, aircraft, at=t0 + DAY)

        services.record_aircraft_usage(aircraft, flight_seconds=60, cycles=1, flown_at=t0)

        assert usage_of(component) == (0, 0)
        assert usage_of(aircraft) == (60, 1)

    def test_component_removed_before_flight_gets_no_usage(self, t0):
        aircraft = AircraftFactory()
        component = ComponentFactory()
        services.install_component(component, aircraft, at=t0)
        services.remove_component(component, at=t0 + HOUR)

        services.record_aircraft_usage(aircraft, flight_seconds=60, cycles=1, flown_at=t0 + DAY)

        assert usage_of(component) == (0, 0)

    def test_late_log_credits_component_removed_after_flight(self, t0):
        aircraft = AircraftFactory()
        old_motor = ComponentFactory()
        new_motor = ComponentFactory()
        services.install_component(old_motor, aircraft, at=t0, position="motor-1")
        services.remove_component(old_motor, at=t0 + DAY)
        services.install_component(new_motor, aircraft, at=t0 + DAY, position="motor-1")

        # Log for a flight that happened before the swap arrives afterwards.
        services.record_aircraft_usage(
            aircraft, flight_seconds=1800, cycles=1, flown_at=t0 + 2 * HOUR
        )

        assert usage_of(old_motor) == (1800, 1)
        assert usage_of(new_motor) == (0, 0)

    def test_flight_at_installation_instant_counts(self, t0):
        aircraft = AircraftFactory()
        component = ComponentFactory()
        services.install_component(component, aircraft, at=t0)

        services.record_aircraft_usage(aircraft, flight_seconds=60, cycles=1, flown_at=t0)

        assert usage_of(component) == (60, 1)

    def test_flight_at_removal_instant_does_not_count(self, t0):
        aircraft = AircraftFactory()
        component = ComponentFactory()
        services.install_component(component, aircraft, at=t0)
        services.remove_component(component, at=t0 + HOUR)

        services.record_aircraft_usage(aircraft, flight_seconds=60, cycles=1, flown_at=t0 + HOUR)

        assert usage_of(component) == (0, 0)
