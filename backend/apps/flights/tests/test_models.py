"""Database-level constraints, exercised by bypassing the service layer."""

import datetime

import pytest
from django.db import IntegrityError

from apps.flights.models import FlightLog

from .factories import FlightFactory, FlightLogFactory

pytestmark = pytest.mark.django_db

MIN = datetime.timedelta(minutes=1)


def test_log_id_unique():
    log = FlightLogFactory()

    with pytest.raises(IntegrityError):
        FlightLogFactory(log_id=log.log_id)


@pytest.mark.parametrize("log_id", ["abc", "G" * 64, "A" * 64])
def test_log_id_must_be_lowercase_sha256_hex(log_id):
    with pytest.raises(IntegrityError):
        FlightLogFactory(log_id=log_id)


def test_rejected_log_requires_code():
    with pytest.raises(IntegrityError):
        FlightLogFactory(status=FlightLog.Status.REJECTED, rejection_code="")


def test_processed_log_cannot_have_code():
    with pytest.raises(IntegrityError):
        FlightLogFactory(
            status=FlightLog.Status.PROCESSED,
            rejection_code=FlightLog.RejectionCode.UNKNOWN_AIRCRAFT,
        )


def test_arrival_must_follow_departure():
    flight = FlightFactory.build()

    with pytest.raises(IntegrityError):
        FlightFactory(arrival_at=flight.departure_at)


def test_overlapping_flights_for_same_aircraft_are_rejected():
    flight = FlightFactory()

    with pytest.raises(IntegrityError):
        FlightFactory(
            aircraft=flight.aircraft,
            departure_at=flight.departure_at + MIN,
            arrival_at=flight.arrival_at + MIN,
        )


def test_back_to_back_flights_are_allowed():
    flight = FlightFactory()

    FlightFactory(
        aircraft=flight.aircraft,
        departure_at=flight.arrival_at,
        arrival_at=flight.arrival_at + 10 * MIN,
    )


def test_overlap_on_different_aircraft_is_allowed():
    flight = FlightFactory()

    FlightFactory(departure_at=flight.departure_at, arrival_at=flight.arrival_at)


def test_one_flight_per_log():
    flight = FlightFactory()

    with pytest.raises(IntegrityError):
        FlightFactory(
            log=flight.log,
            departure_at=flight.departure_at + datetime.timedelta(days=1),
            arrival_at=flight.arrival_at + datetime.timedelta(days=1),
        )


@pytest.mark.parametrize(
    "overrides",
    [
        {"cycles": 0},
        {"max_speed_mps": -1},
        {"distance_m": -1},
        {"battery_start_pct": 101},
        {"battery_end_pct": -1},
    ],
)
def test_telemetry_checks(overrides):
    with pytest.raises(IntegrityError):
        FlightFactory(**overrides)
