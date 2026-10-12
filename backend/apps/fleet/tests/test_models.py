"""Database-level constraints, exercised by bypassing the service layer."""

import datetime
from decimal import Decimal

import pytest
from django.db import IntegrityError

from apps.fleet.models import ComponentLifeLimit
from apps.fleet.tests.factories import (
    AircraftFactory,
    AircraftModelFactory,
    ComponentFactory,
    ComponentInstallationFactory,
    ComponentLifeLimitFactory,
    ComponentTypeFactory,
)

pytestmark = pytest.mark.django_db

LimitType = ComponentLifeLimit.LimitType


def test_aircraft_model_name_unique_per_manufacturer():
    AircraftModelFactory(manufacturer="Acme", name="X1")
    AircraftModelFactory(manufacturer="Other", name="X1")

    with pytest.raises(IntegrityError):
        AircraftModelFactory(manufacturer="Acme", name="X1")


def test_aircraft_serial_number_unique():
    AircraftFactory(serial_number="AC-1")

    with pytest.raises(IntegrityError):
        AircraftFactory(serial_number="AC-1")


def test_aircraft_registration_unique_but_blank_allowed_many_times():
    AircraftFactory(registration="")
    AircraftFactory(registration="")
    AircraftFactory(registration="TC-UAV1")

    with pytest.raises(IntegrityError):
        AircraftFactory(registration="TC-UAV1")


def test_component_serial_unique_per_type():
    component_type = ComponentTypeFactory()
    ComponentFactory(component_type=component_type, serial_number="S1")
    ComponentFactory(serial_number="S1")

    with pytest.raises(IntegrityError):
        ComponentFactory(component_type=component_type, serial_number="S1")


def test_life_limit_type_unique_per_component_type():
    component_type = ComponentTypeFactory()
    ComponentLifeLimitFactory(component_type=component_type, limit_type=LimitType.CYCLES)

    with pytest.raises(IntegrityError):
        ComponentLifeLimitFactory(component_type=component_type, limit_type=LimitType.CYCLES)


@pytest.mark.parametrize("value", ["0", "-1"])
def test_life_limit_value_must_be_positive(value):
    with pytest.raises(IntegrityError):
        ComponentLifeLimitFactory(value=Decimal(value))


@pytest.mark.parametrize("limit_type", [LimitType.CYCLES, LimitType.CALENDAR_DAYS])
def test_cycles_and_days_must_be_whole_numbers(limit_type):
    with pytest.raises(IntegrityError):
        ComponentLifeLimitFactory(limit_type=limit_type, value=Decimal("2.5"))


def test_flight_hours_may_be_fractional():
    limit = ComponentLifeLimitFactory(limit_type=LimitType.FLIGHT_HOURS, value=Decimal("2.5"))

    assert limit.value == Decimal("2.5")


@pytest.mark.parametrize("threshold", ["0", "100", "-5"])
def test_warning_threshold_must_be_between_0_and_100(threshold):
    with pytest.raises(IntegrityError):
        ComponentLifeLimitFactory(warning_threshold_percent=Decimal(threshold))


def test_warning_threshold_defaults_to_10_percent():
    assert ComponentLifeLimitFactory().warning_threshold_percent == Decimal("10.00")


def test_only_one_open_installation_per_component():
    installation = ComponentInstallationFactory()

    with pytest.raises(IntegrityError):
        ComponentInstallationFactory(component=installation.component)


def test_only_one_open_installation_per_position():
    installation = ComponentInstallationFactory(position="motor-1")

    with pytest.raises(IntegrityError):
        ComponentInstallationFactory(aircraft=installation.aircraft, position="motor-1")


def test_removed_at_cannot_precede_installed_at():
    installation = ComponentInstallationFactory()
    installation.removed_at = installation.installed_at - datetime.timedelta(seconds=1)

    with pytest.raises(IntegrityError):
        installation.save()
