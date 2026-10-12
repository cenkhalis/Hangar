import datetime
from decimal import Decimal

import pytest

from apps.fleet import services
from apps.fleet.models import Aircraft
from apps.fleet.services import LifeState
from apps.fleet.tests.factories import (
    AircraftFactory,
    ComponentFactory,
    ComponentLifeLimitFactory,
    ComponentTypeFactory,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def motor_type():
    component_type = ComponentTypeFactory()
    ComponentLifeLimitFactory(component_type=component_type, value=Decimal("100"))
    return component_type


def install_with_hours(aircraft, component_type, hours, at, position=""):
    component = ComponentFactory(component_type=component_type)
    services.install_component(component, aircraft, at=at, position=position)
    if hours:
        component.flight_seconds = hours * 3600
        component.save(update_fields=["flight_seconds"])
    return component


def test_aircraft_without_components_is_airworthy(t0):
    report = services.get_aircraft_airworthiness(AircraftFactory(), today=t0.date())

    assert report.airworthy is True
    assert report.state == LifeState.UNTRACKED
    assert report.components == []


def test_all_ok_is_airworthy(t0, motor_type):
    aircraft = AircraftFactory()
    install_with_hours(aircraft, motor_type, 10, t0, "motor-1")
    install_with_hours(aircraft, motor_type, 20, t0, "motor-2")

    report = services.get_aircraft_airworthiness(aircraft, today=t0.date())

    assert report.airworthy is True
    assert report.state == LifeState.OK
    assert len(report.components) == 2


def test_due_soon_component_is_airworthy_with_warning(t0, motor_type):
    aircraft = AircraftFactory()
    install_with_hours(aircraft, motor_type, 95, t0)

    report = services.get_aircraft_airworthiness(aircraft, today=t0.date())

    assert report.airworthy is True
    assert report.state == LifeState.DUE_SOON


def test_expired_installed_component_makes_aircraft_unairworthy(t0, motor_type):
    aircraft = AircraftFactory()
    install_with_hours(aircraft, motor_type, 10, t0, "motor-1")
    expired = install_with_hours(aircraft, motor_type, 100, t0, "motor-2")

    report = services.get_aircraft_airworthiness(aircraft, today=t0.date())

    assert report.airworthy is False
    assert report.state == LifeState.EXPIRED
    states = {c.installation.component_id: c.life_status.state for c in report.components}
    assert states[expired.pk] == LifeState.EXPIRED


def test_removed_expired_component_is_ignored(t0, motor_type):
    aircraft = AircraftFactory()
    expired = install_with_hours(aircraft, motor_type, 100, t0)
    services.remove_component(expired, at=t0 + datetime.timedelta(hours=1))

    report = services.get_aircraft_airworthiness(aircraft, today=t0.date())

    assert report.airworthy is True


def test_airworthiness_does_not_change_aircraft_status(t0, motor_type):
    aircraft = AircraftFactory()
    install_with_hours(aircraft, motor_type, 100, t0)

    services.get_aircraft_airworthiness(aircraft, today=t0.date())

    aircraft.refresh_from_db()
    assert aircraft.status == Aircraft.Status.ACTIVE
