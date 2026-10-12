"""Flight log message contract v1 (see contracts/flight-log/v1/README.md)."""

from __future__ import annotations

import datetime
import json
from dataclasses import dataclass
from typing import Any

from rest_framework import serializers

SCHEMA_VERSION = "1"


class InvalidMessage(Exception):
    """The message can never be processed; it belongs in the dead-letter stream."""


@dataclass(frozen=True)
class Position:
    lat: float
    lon: float


@dataclass(frozen=True)
class Telemetry:
    sample_count: int
    max_altitude_m: float
    max_speed_mps: float
    distance_m: float
    battery_start_pct: float
    battery_end_pct: float
    start: Position
    end: Position


@dataclass(frozen=True)
class Source:
    filename: str
    format: str
    ingested_at: datetime.datetime


@dataclass(frozen=True)
class FlightLogMessage:
    log_id: str
    aircraft_serial: str
    departure_at: datetime.datetime
    arrival_at: datetime.datetime
    cycles: int
    telemetry: Telemetry
    source: Source
    raw: dict[str, Any]

    @property
    def flight_seconds(self) -> int:
        return round((self.arrival_at - self.departure_at).total_seconds())


class _PositionSerializer(serializers.Serializer):
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)


class _TelemetrySerializer(serializers.Serializer):
    sample_count = serializers.IntegerField(min_value=1)
    max_altitude_m = serializers.FloatField()
    max_speed_mps = serializers.FloatField(min_value=0)
    distance_m = serializers.FloatField(min_value=0)
    battery_start_pct = serializers.FloatField(min_value=0, max_value=100)
    battery_end_pct = serializers.FloatField(min_value=0, max_value=100)
    start = _PositionSerializer()
    end = _PositionSerializer()


class _SourceSerializer(serializers.Serializer):
    filename = serializers.CharField(max_length=255)
    format = serializers.ChoiceField(choices=["csv", "json"])
    ingested_at = serializers.DateTimeField()


class FlightLogMessageSerializer(serializers.Serializer):
    log_id = serializers.RegexField(r"^[0-9a-f]{64}$")
    aircraft_serial = serializers.CharField(max_length=100)
    departure_at = serializers.DateTimeField()
    arrival_at = serializers.DateTimeField()
    cycles = serializers.IntegerField(min_value=1)
    telemetry = _TelemetrySerializer()
    source = _SourceSerializer()

    def validate(self, attrs):
        if attrs["arrival_at"] <= attrs["departure_at"]:
            raise serializers.ValidationError({"arrival_at": "Must be after departure_at."})
        return attrs


def _reject_constant(name: str):
    raise ValueError(f"Invalid JSON number: {name}")


def parse_payload(payload: dict[str, Any]) -> FlightLogMessage:
    serializer = FlightLogMessageSerializer(data=payload)
    if not serializer.is_valid():
        raise InvalidMessage(json.dumps(serializer.errors))
    data = serializer.validated_data
    telemetry = data["telemetry"]
    return FlightLogMessage(
        log_id=data["log_id"],
        aircraft_serial=data["aircraft_serial"],
        departure_at=data["departure_at"],
        arrival_at=data["arrival_at"],
        cycles=data["cycles"],
        telemetry=Telemetry(
            **{k: v for k, v in telemetry.items() if k not in ("start", "end")},
            start=Position(**telemetry["start"]),
            end=Position(**telemetry["end"]),
        ),
        source=Source(**data["source"]),
        raw=payload,
    )


def decode_entry(fields: dict[str, str]) -> FlightLogMessage:
    """Decode a raw stream entry (``schema_version`` + JSON ``payload``)."""
    version = fields.get("schema_version")
    if version != SCHEMA_VERSION:
        raise InvalidMessage(f"Unsupported schema_version: {version!r}")
    try:
        payload = json.loads(fields["payload"], parse_constant=_reject_constant)
    except KeyError as exc:
        raise InvalidMessage("Missing payload field") from exc
    except ValueError as exc:
        raise InvalidMessage(f"Payload is not valid JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise InvalidMessage("Payload must be a JSON object")
    return parse_payload(payload)
