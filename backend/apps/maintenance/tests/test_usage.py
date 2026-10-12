import datetime

import pytest

from apps.fleet.tests.factories import AircraftFactory
from apps.maintenance.services import Usage, get_usage_since

from .conftest import at, fly

pytestmark = pytest.mark.django_db


def test_counts_only_flights_departing_after_since():
    aircraft = AircraftFactory()
    since = at(2026, 3, 1)
    fly(aircraft, since - datetime.timedelta(days=1), 60)
    fly(aircraft, since, 30)  # departing exactly at sign-off counts
    fly(aircraft, since + datetime.timedelta(days=1), 45, cycles=2)

    assert get_usage_since(aircraft, since) == Usage(flight_seconds=75 * 60, cycles=3)


def test_other_aircraft_flights_are_ignored():
    aircraft = AircraftFactory()
    fly(AircraftFactory(), at(2026, 3, 2), 60)

    assert get_usage_since(aircraft, at(2026, 3, 1)) == Usage()


def test_never_signed_off_uses_aircraft_totals():
    aircraft = AircraftFactory(flight_seconds=7200, cycles=5)

    assert get_usage_since(aircraft, None) == Usage(flight_seconds=7200, cycles=5)


def test_late_log_for_flight_before_sign_off_does_not_count():
    aircraft = AircraftFactory()
    sign_off = at(2026, 3, 10)
    fly(aircraft, sign_off + datetime.timedelta(days=1), 30)
    assert get_usage_since(aircraft, sign_off).flight_seconds == 30 * 60

    # A log for a flight flown before the sign-off is ingested afterwards.
    fly(aircraft, sign_off - datetime.timedelta(days=2), 90)

    assert get_usage_since(aircraft, sign_off).flight_seconds == 30 * 60


def test_late_log_for_flight_after_sign_off_counts():
    aircraft = AircraftFactory()
    sign_off = at(2026, 3, 10)

    fly(aircraft, sign_off + datetime.timedelta(hours=5), 40)

    assert get_usage_since(aircraft, sign_off).flight_seconds == 40 * 60
