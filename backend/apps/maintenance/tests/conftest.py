import datetime
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.fleet.tests.factories import AircraftFactory
from apps.flights.tests.factories import FlightFactory
from apps.maintenance.models import InspectionInterval

from .factories import InspectionIntervalFactory, MaintenanceProgramFactory, MaintenanceTaskFactory

HOURS = InspectionInterval.IntervalType.FLIGHT_HOURS
CYCLES = InspectionInterval.IntervalType.CYCLES
DAYS = InspectionInterval.IntervalType.CALENDAR_DAYS


def at(year, month, day, hour=12) -> datetime.datetime:
    return timezone.make_aware(datetime.datetime(year, month, day, hour))


def add_task(program, *intervals, code=None, **kwargs):
    """Create a task with intervals given as (type, value[, threshold]) tuples."""
    task = MaintenanceTaskFactory(program=program, **({"code": code} if code else {}), **kwargs)
    for interval in intervals:
        interval_type, value, *threshold = interval
        InspectionIntervalFactory(
            task=task,
            interval_type=interval_type,
            value=Decimal(str(value)),
            **({"warning_threshold_percent": Decimal(str(threshold[0]))} if threshold else {}),
        )
    return task


def fly(aircraft, departure, minutes, cycles=1):
    """Record a flight row (does not touch aircraft counters)."""
    return FlightFactory(
        aircraft=aircraft,
        departure_at=departure,
        arrival_at=departure + datetime.timedelta(minutes=minutes),
        cycles=cycles,
    )


@pytest.fixture
def program(db):
    return MaintenanceProgramFactory()


@pytest.fixture
def aircraft(program):
    return AircraftFactory(model=program.aircraft_model, in_service_date=datetime.date(2026, 1, 1))
