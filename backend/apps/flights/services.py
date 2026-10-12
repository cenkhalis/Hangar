"""Flight log processing: idempotent creation of flights and usage recording."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.fleet import services as fleet_services
from apps.fleet.exceptions import AircraftRetired
from apps.fleet.models import Aircraft

from .exceptions import FlightLogNotRejected
from .messages import SCHEMA_VERSION, FlightLogMessage, parse_payload
from .models import Flight, FlightLog

RejectionCode = FlightLog.RejectionCode


class Outcome(StrEnum):
    PROCESSED = "processed"
    DUPLICATE = "duplicate"
    REJECTED = "rejected"


@dataclass(frozen=True)
class ProcessResult:
    outcome: Outcome
    log: FlightLog
    flight: Flight | None = None


class _Rejected(Exception):
    def __init__(self, code: str, detail: str):
        super().__init__(detail)
        self.code = code
        self.detail = detail


def process_flight_log(message: FlightLogMessage, *, stream_message_id: str = "") -> ProcessResult:
    """Record a flight log exactly once, keyed on ``log_id``.

    A log seen before is reported as a duplicate and has no further effect. A new log is stored
    even when rejected, so the rejection is visible and the log can be reprocessed later.
    """
    with transaction.atomic():
        now = timezone.now()
        log, created = FlightLog.objects.select_for_update().get_or_create(
            log_id=message.log_id,
            defaults={
                "status": FlightLog.Status.PROCESSED,
                "payload": message.raw,
                "schema_version": SCHEMA_VERSION,
                "source_filename": message.source.filename,
                "source_format": message.source.format,
                "stream_message_id": stream_message_id,
                "received_at": now,
                "last_seen_at": now,
            },
        )
        if not created:
            FlightLog.objects.filter(pk=log.pk).update(
                duplicate_count=F("duplicate_count") + 1, last_seen_at=now
            )
            log.refresh_from_db()
            return ProcessResult(Outcome.DUPLICATE, log)
        return _apply(log, message)


def reprocess_flight_log(log: FlightLog) -> ProcessResult:
    """Retry a rejected log from its stored payload (e.g. after registering the aircraft)."""
    with transaction.atomic():
        log = FlightLog.objects.select_for_update().get(pk=log.pk)
        if log.status != FlightLog.Status.REJECTED:
            raise FlightLogNotRejected("Only rejected flight logs can be reprocessed.")
        return _apply(log, parse_payload(log.payload))


def _apply(log: FlightLog, message: FlightLogMessage) -> ProcessResult:
    """Create the flight and record usage inside a savepoint; record the outcome on ``log``."""
    try:
        with transaction.atomic():
            flight = _create_flight(log, message)
    except _Rejected as rejection:
        log.status = FlightLog.Status.REJECTED
        log.rejection_code = rejection.code
        log.rejection_detail = rejection.detail[:500]
        log.processed_at = timezone.now()
        log.save(update_fields=["status", "rejection_code", "rejection_detail", "processed_at"])
        return ProcessResult(Outcome.REJECTED, log)

    log.status = FlightLog.Status.PROCESSED
    log.rejection_code = ""
    log.rejection_detail = ""
    log.processed_at = timezone.now()
    log.save(update_fields=["status", "rejection_code", "rejection_detail", "processed_at"])
    return ProcessResult(Outcome.PROCESSED, log, flight)


def _create_flight(log: FlightLog, message: FlightLogMessage) -> Flight:
    # Locking the aircraft serialises concurrent logs for it, making the overlap check race-free.
    # The exclusion constraint on Flight remains the database-level backstop.
    aircraft = (
        Aircraft.objects.select_for_update().filter(serial_number=message.aircraft_serial).first()
    )
    if aircraft is None:
        raise _Rejected(
            RejectionCode.UNKNOWN_AIRCRAFT, f"No aircraft with serial {message.aircraft_serial!r}."
        )

    overlapping = Flight.objects.filter(
        aircraft=aircraft,
        departure_at__lt=message.arrival_at,
        arrival_at__gt=message.departure_at,
    ).first()
    if overlapping is not None:
        raise _Rejected(
            RejectionCode.OVERLAPPING_FLIGHT,
            f"Overlaps flight {overlapping.pk} "
            f"({overlapping.departure_at.isoformat()} - {overlapping.arrival_at.isoformat()}).",
        )

    telemetry = message.telemetry
    flight = Flight.objects.create(
        aircraft=aircraft,
        log=log,
        departure_at=message.departure_at,
        arrival_at=message.arrival_at,
        cycles=message.cycles,
        sample_count=telemetry.sample_count,
        max_altitude_m=telemetry.max_altitude_m,
        max_speed_mps=telemetry.max_speed_mps,
        distance_m=telemetry.distance_m,
        battery_start_pct=telemetry.battery_start_pct,
        battery_end_pct=telemetry.battery_end_pct,
        start_lat=telemetry.start.lat,
        start_lon=telemetry.start.lon,
        end_lat=telemetry.end.lat,
        end_lon=telemetry.end.lon,
    )
    try:
        fleet_services.record_aircraft_usage(
            aircraft,
            flight_seconds=message.flight_seconds,
            cycles=message.cycles,
            flown_at=message.departure_at,
        )
    except AircraftRetired as exc:
        raise _Rejected(RejectionCode.AIRCRAFT_RETIRED, str(exc)) from exc
    return flight
