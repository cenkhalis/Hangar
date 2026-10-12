import datetime

import pytest
from rest_framework.test import APIClient

from apps.fleet.tests.factories import AircraftFactory
from apps.flights import services
from apps.flights.models import FlightLog

from .conftest import make_message
from .factories import FlightFactory

pytestmark = pytest.mark.django_db

BASE = "/api/flights"


@pytest.fixture
def api():
    return APIClient()


def test_list_flights(api, aircraft):
    services.process_flight_log(make_message())

    body = api.get(f"{BASE}/flights/").json()

    assert body["count"] == 1
    flight = body["results"][0]
    assert flight["aircraft_serial"] == "AC-00042"
    assert flight["duration_seconds"] == 27 * 60 + 54
    assert flight["max_altitude_m"] == pytest.approx(118.4)


def test_flight_detail(api):
    flight = FlightFactory()

    response = api.get(f"{BASE}/flights/{flight.pk}/")

    assert response.status_code == 200
    assert response.json()["id"] == flight.pk


def test_flights_are_newest_first(api):
    older = FlightFactory()
    newer = FlightFactory(
        departure_at=older.departure_at + datetime.timedelta(days=1),
        arrival_at=older.arrival_at + datetime.timedelta(days=1),
    )

    ids = [f["id"] for f in api.get(f"{BASE}/flights/").json()["results"]]

    assert ids == [newer.pk, older.pk]


def test_filter_by_aircraft_and_departure_window(api):
    flight = FlightFactory()
    FlightFactory()  # another aircraft
    later = FlightFactory(
        aircraft=flight.aircraft,
        departure_at=flight.departure_at + datetime.timedelta(days=2),
        arrival_at=flight.arrival_at + datetime.timedelta(days=2),
    )

    def ids(**params):
        return [f["id"] for f in api.get(f"{BASE}/flights/", params).json()["results"]]

    assert ids(aircraft=flight.aircraft_id) == [later.pk, flight.pk]
    assert ids(
        aircraft=flight.aircraft_id,
        departure_after=(flight.departure_at + datetime.timedelta(days=1)).isoformat(),
    ) == [later.pk]
    assert ids(departure_before=flight.arrival_at.isoformat(), aircraft=flight.aircraft_id) == [
        flight.pk
    ]


@pytest.mark.parametrize("method", ["post", "put", "patch", "delete"])
def test_flights_are_read_only(api, method):
    flight = FlightFactory()
    url = f"{BASE}/flights/" if method == "post" else f"{BASE}/flights/{flight.pk}/"

    assert getattr(api, method)(url, {}, format="json").status_code == 405


def test_logs_list_and_filter(api, aircraft):
    services.process_flight_log(make_message())
    services.process_flight_log(make_message(aircraft_serial="NOPE"))

    rejected = api.get(f"{BASE}/logs/", {"status": "rejected"}).json()["results"]
    by_code = api.get(f"{BASE}/logs/", {"rejection_code": "unknown_aircraft"}).json()["results"]

    assert len(rejected) == 1
    assert rejected[0]["rejection_code"] == "unknown_aircraft"
    assert rejected[0]["flight"] is None
    assert by_code == rejected


def test_reprocess_rejected_log(api):
    result = services.process_flight_log(make_message())
    AircraftFactory(serial_number="AC-00042")

    response = api.post(f"{BASE}/logs/{result.log.pk}/reprocess/")

    assert response.status_code == 200
    assert response.json()["status"] == "processed"
    assert response.json()["flight"] is not None


def test_reprocess_processed_log_returns_400(api, aircraft):
    result = services.process_flight_log(make_message())

    response = api.post(f"{BASE}/logs/{result.log.pk}/reprocess/")

    assert response.status_code == 400
    assert response.json()["code"] == "flight_log_not_rejected"
    assert FlightLog.objects.get().status == "processed"


def test_flight_list_query_count(api, django_assert_max_num_queries):
    for day in range(10):
        FlightFactory(
            departure_at=datetime.datetime(2026, 1, 1 + day, 8, tzinfo=datetime.UTC),
            arrival_at=datetime.datetime(2026, 1, 1 + day, 9, tzinfo=datetime.UTC),
        )

    with django_assert_max_num_queries(2):
        response = api.get(f"{BASE}/flights/")

    assert len(response.json()["results"]) == 10


def test_log_list_query_count(api, django_assert_max_num_queries):
    for day in range(10):
        FlightFactory(
            departure_at=datetime.datetime(2026, 1, 1 + day, 8, tzinfo=datetime.UTC),
            arrival_at=datetime.datetime(2026, 1, 1 + day, 9, tzinfo=datetime.UTC),
        )

    with django_assert_max_num_queries(2):
        response = api.get(f"{BASE}/logs/")

    assert len(response.json()["results"]) == 10
