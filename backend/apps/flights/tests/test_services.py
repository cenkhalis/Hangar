import datetime

import pytest

from apps.fleet import services as fleet_services
from apps.fleet.models import Aircraft
from apps.fleet.tests.factories import AircraftFactory, ComponentFactory
from apps.flights import services
from apps.flights.exceptions import FlightLogNotRejected
from apps.flights.models import Flight, FlightLog
from apps.flights.services import Outcome

from .conftest import make_message

pytestmark = pytest.mark.django_db

FLIGHT_SECONDS = 27 * 60 + 54  # golden departure/arrival


def usage_of(obj):
    obj.refresh_from_db()
    return obj.flight_seconds, obj.cycles


def test_new_log_creates_flight_and_records_usage(aircraft):
    motor = ComponentFactory()
    fleet_services.install_component(
        motor, aircraft, at=datetime.datetime(2026, 1, 1, tzinfo=datetime.UTC)
    )
    message = make_message()

    result = services.process_flight_log(message, stream_message_id="1-0")

    assert result.outcome == Outcome.PROCESSED
    log = FlightLog.objects.get()
    assert log.status == FlightLog.Status.PROCESSED
    assert log.stream_message_id == "1-0"
    assert log.payload == message.raw
    assert log.processed_at is not None
    flight = Flight.objects.get()
    assert result.flight == flight
    assert flight.aircraft == aircraft
    assert flight.log == log
    assert flight.duration_seconds == FLIGHT_SECONDS
    assert flight.max_altitude_m == pytest.approx(118.4)
    assert flight.end_lon == pytest.approx(28.9801)
    assert usage_of(aircraft) == (FLIGHT_SECONDS, 1)
    assert usage_of(motor) == (FLIGHT_SECONDS, 1)


def test_usage_is_attributed_at_departure_time(aircraft):
    message = make_message()
    swapped_in = ComponentFactory()
    fleet_services.install_component(
        swapped_in, aircraft, at=message.departure_at + datetime.timedelta(days=1)
    )

    services.process_flight_log(message)

    assert usage_of(swapped_in) == (0, 0)


def test_duplicate_log_is_recorded_once(aircraft):
    message = make_message()
    services.process_flight_log(message)

    first = services.process_flight_log(message)
    second = services.process_flight_log(message)

    assert (first.outcome, second.outcome) == (Outcome.DUPLICATE, Outcome.DUPLICATE)
    assert Flight.objects.count() == 1
    assert FlightLog.objects.get().duplicate_count == 2
    assert usage_of(aircraft) == (FLIGHT_SECONDS, 1)


def test_unknown_aircraft_is_rejected_but_log_is_kept():
    result = services.process_flight_log(make_message(aircraft_serial="NOPE"))

    assert result.outcome == Outcome.REJECTED
    log = FlightLog.objects.get()
    assert log.status == FlightLog.Status.REJECTED
    assert log.rejection_code == FlightLog.RejectionCode.UNKNOWN_AIRCRAFT
    assert "NOPE" in log.rejection_detail
    assert not Flight.objects.exists()


def test_retired_aircraft_is_rejected_and_flight_rolled_back():
    aircraft = AircraftFactory(serial_number="AC-00042", status=Aircraft.Status.RETIRED)

    result = services.process_flight_log(make_message())

    assert result.outcome == Outcome.REJECTED
    assert result.log.rejection_code == FlightLog.RejectionCode.AIRCRAFT_RETIRED
    assert not Flight.objects.exists()
    assert usage_of(aircraft) == (0, 0)


def test_overlapping_flight_is_rejected(aircraft):
    first = make_message()
    services.process_flight_log(first)
    overlapping = make_message(
        departure_at=(first.departure_at + datetime.timedelta(minutes=10)).isoformat(),
        arrival_at=(first.arrival_at + datetime.timedelta(minutes=10)).isoformat(),
    )

    result = services.process_flight_log(overlapping)

    assert result.outcome == Outcome.REJECTED
    assert result.log.rejection_code == FlightLog.RejectionCode.OVERLAPPING_FLIGHT
    assert Flight.objects.count() == 1
    assert usage_of(aircraft) == (FLIGHT_SECONDS, 1)


def test_back_to_back_flights_are_accepted(aircraft):
    first = make_message()
    services.process_flight_log(first)
    second = make_message(
        departure_at=first.arrival_at.isoformat(),
        arrival_at=(first.arrival_at + datetime.timedelta(minutes=5)).isoformat(),
    )

    result = services.process_flight_log(second)

    assert result.outcome == Outcome.PROCESSED
    assert Flight.objects.count() == 2


def test_same_window_on_different_aircraft_is_accepted(aircraft):
    AircraftFactory(serial_number="AC-00043")
    services.process_flight_log(make_message())

    result = services.process_flight_log(make_message(aircraft_serial="AC-00043"))

    assert result.outcome == Outcome.PROCESSED


def test_reprocess_rejected_log_after_registering_aircraft():
    result = services.process_flight_log(make_message())
    assert result.outcome == Outcome.REJECTED
    aircraft = AircraftFactory(serial_number="AC-00042")

    retried = services.reprocess_flight_log(result.log)

    assert retried.outcome == Outcome.PROCESSED
    log = FlightLog.objects.get()
    assert log.status == FlightLog.Status.PROCESSED
    assert log.rejection_code == ""
    assert log.rejection_detail == ""
    assert Flight.objects.get().aircraft == aircraft
    assert usage_of(aircraft) == (FLIGHT_SECONDS, 1)


def test_reprocess_still_failing_stays_rejected():
    result = services.process_flight_log(make_message())

    retried = services.reprocess_flight_log(result.log)

    assert retried.outcome == Outcome.REJECTED
    assert not Flight.objects.exists()


def test_reprocess_processed_log_is_refused(aircraft):
    result = services.process_flight_log(make_message())

    with pytest.raises(FlightLogNotRejected):
        services.reprocess_flight_log(result.log)

    assert usage_of(aircraft) == (FLIGHT_SECONDS, 1)


def test_unexpected_error_rolls_back_everything(aircraft, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("database hiccup")

    monkeypatch.setattr(services.fleet_services, "record_aircraft_usage", boom)

    with pytest.raises(RuntimeError):
        services.process_flight_log(make_message())

    # Nothing persisted, so a redelivery processes the log from scratch.
    assert not FlightLog.objects.exists()
    assert not Flight.objects.exists()
