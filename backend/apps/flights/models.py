from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateTimeRangeField, RangeBoundary, RangeOperators
from django.db import models
from django.db.models import F, Func, Q
from django.utils import timezone

from apps.fleet.models import Aircraft


class TsTzRange(Func):
    function = "TSTZRANGE"
    output_field = DateTimeRangeField()


class FlightLog(models.Model):
    """One row per unique raw log received; ``log_id`` is the idempotency key."""

    class Status(models.TextChoices):
        PROCESSED = "processed", "Processed"
        REJECTED = "rejected", "Rejected"

    class RejectionCode(models.TextChoices):
        UNKNOWN_AIRCRAFT = "unknown_aircraft", "Unknown aircraft"
        AIRCRAFT_RETIRED = "aircraft_retired", "Aircraft retired"
        OVERLAPPING_FLIGHT = "overlapping_flight", "Overlapping flight"

    log_id = models.CharField(max_length=64, unique=True)
    status = models.CharField(max_length=20, choices=Status.choices)
    rejection_code = models.CharField(max_length=30, choices=RejectionCode.choices, blank=True)
    rejection_detail = models.CharField(max_length=500, blank=True)
    payload = models.JSONField()
    schema_version = models.CharField(max_length=10)
    source_filename = models.CharField(max_length=255)
    source_format = models.CharField(max_length=10)
    stream_message_id = models.CharField(max_length=50, blank=True)
    received_at = models.DateTimeField(default=timezone.now)
    processed_at = models.DateTimeField(null=True, blank=True)
    duplicate_count = models.PositiveIntegerField(default=0)
    last_seen_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-received_at"]
        constraints = [
            models.CheckConstraint(
                condition=Q(log_id__regex=r"^[0-9a-f]{64}$"), name="flights_log_id_sha256_hex"
            ),
            models.CheckConstraint(
                condition=(Q(status="rejected") & ~Q(rejection_code=""))
                | (Q(status="processed") & Q(rejection_code="")),
                name="flights_log_rejection_code_matches_status",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.source_filename} ({self.status})"


class Flight(models.Model):
    """A completed sortie derived from a processed flight log. Immutable once created."""

    aircraft = models.ForeignKey(Aircraft, on_delete=models.PROTECT, related_name="flights")
    log = models.OneToOneField(FlightLog, on_delete=models.PROTECT, related_name="flight")
    departure_at = models.DateTimeField()
    arrival_at = models.DateTimeField()
    cycles = models.PositiveSmallIntegerField(default=1)
    # Telemetry summary
    sample_count = models.PositiveIntegerField()
    max_altitude_m = models.FloatField()
    max_speed_mps = models.FloatField()
    distance_m = models.FloatField()
    battery_start_pct = models.FloatField()
    battery_end_pct = models.FloatField()
    start_lat = models.FloatField()
    start_lon = models.FloatField()
    end_lat = models.FloatField()
    end_lon = models.FloatField()

    class Meta:
        ordering = ["-departure_at"]
        constraints = [
            models.CheckConstraint(
                condition=Q(arrival_at__gt=F("departure_at")),
                name="flights_flight_arrival_after_departure",
            ),
            models.CheckConstraint(condition=Q(cycles__gte=1), name="flights_flight_cycles_min_1"),
            models.CheckConstraint(
                condition=Q(max_speed_mps__gte=0) & Q(distance_m__gte=0),
                name="flights_flight_non_negative_telemetry",
            ),
            models.CheckConstraint(
                condition=Q(battery_start_pct__range=(0, 100)) & Q(battery_end_pct__range=(0, 100)),
                name="flights_flight_battery_pct_range",
            ),
            ExclusionConstraint(
                name="flights_flight_no_overlap_per_aircraft",
                expressions=[
                    (
                        TsTzRange("departure_at", "arrival_at", RangeBoundary()),
                        RangeOperators.OVERLAPS,
                    ),
                    ("aircraft", RangeOperators.EQUAL),
                ],
            ),
        ]

    def __str__(self) -> str:
        return f"{self.aircraft} {self.departure_at:%Y-%m-%d %H:%M}"

    @property
    def duration_seconds(self) -> int:
        return round((self.arrival_at - self.departure_at).total_seconds())
