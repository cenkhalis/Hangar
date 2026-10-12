import datetime

import pytest

from apps.fleet import services
from apps.fleet.exceptions import AircraftRetired, InvalidUsage
from apps.fleet.models import Aircraft, Component
from apps.fleet.tests.factories import AircraftFactory, ComponentFactory

pytestmark = pytest.mark.django_db


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

    services.record_aircraft_usage(aircraft, flight_seconds=3600, cycles=2)

    for obj, seconds, cycles in [
        (aircraft, 3600, 2),
        (installed, 3600, 2),
        (other_aircraft, 0, 0),
        (on_other, 0, 0),
        (removed, 0, 0),
        (in_stock, 0, 0),
    ]:
        obj.refresh_from_db()
        assert (obj.flight_seconds, obj.cycles) == (seconds, cycles), obj


def test_usage_accumulates_across_calls():
    aircraft = AircraftFactory(flight_seconds=100, cycles=1)

    services.record_aircraft_usage(aircraft, flight_seconds=50, cycles=1)
    services.record_aircraft_usage(aircraft, flight_seconds=25, cycles=0)

    assert (aircraft.flight_seconds, aircraft.cycles) == (175, 2)


def test_usage_returns_refreshed_aircraft():
    aircraft = AircraftFactory()

    result = services.record_aircraft_usage(aircraft, flight_seconds=60, cycles=1)

    assert result.flight_seconds == 60


@pytest.mark.parametrize(
    ("seconds", "cycles"),
    [(-1, 0), (0, -1), (0, 0)],
)
def test_invalid_usage_is_rejected(seconds, cycles):
    aircraft = AircraftFactory()

    with pytest.raises(InvalidUsage):
        services.record_aircraft_usage(aircraft, flight_seconds=seconds, cycles=cycles)

    aircraft.refresh_from_db()
    assert (aircraft.flight_seconds, aircraft.cycles) == (0, 0)


def test_usage_on_retired_aircraft_is_rejected():
    aircraft = AircraftFactory(status=Aircraft.Status.RETIRED)

    with pytest.raises(AircraftRetired):
        services.record_aircraft_usage(aircraft, flight_seconds=60, cycles=1)


def test_usage_on_grounded_aircraft_is_allowed():
    aircraft = AircraftFactory(status=Aircraft.Status.GROUNDED)

    services.record_aircraft_usage(aircraft, flight_seconds=60, cycles=1)

    assert aircraft.flight_seconds == 60


def test_component_usage_follows_component_between_aircraft(t0):
    aircraft_a = AircraftFactory()
    aircraft_b = AircraftFactory()
    component = ComponentFactory()

    services.install_component(component, aircraft_a, at=t0)
    services.record_aircraft_usage(aircraft_a, flight_seconds=10 * 3600, cycles=10)
    services.remove_component(component, at=t0 + datetime.timedelta(days=1))
    services.install_component(component, aircraft_b, at=t0 + datetime.timedelta(days=2))
    services.record_aircraft_usage(aircraft_b, flight_seconds=5 * 3600, cycles=4)

    component.refresh_from_db()
    assert (component.flight_seconds, component.cycles) == (15 * 3600, 14)
    assert component.status == Component.Status.INSTALLED
    assert (aircraft_a.flight_seconds, aircraft_b.flight_seconds) == (10 * 3600, 5 * 3600)
