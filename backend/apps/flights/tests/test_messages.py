import datetime
import json

import pytest

from apps.flights.messages import InvalidMessage, decode_entry, parse_payload

from .conftest import golden_payload, make_payload, stream_fields


def test_golden_contract_message_is_accepted():
    message = parse_payload(golden_payload())

    assert message.aircraft_serial == "AC-00042"
    assert message.departure_at == datetime.datetime(2026, 10, 12, 8, 14, 3, tzinfo=datetime.UTC)
    assert message.flight_seconds == 27 * 60 + 54
    assert message.cycles == 1
    assert message.telemetry.start.lat == pytest.approx(41.0151)
    assert message.telemetry.battery_end_pct == pytest.approx(31.5)
    assert message.source.format == "csv"
    assert message.raw == golden_payload()


def test_decode_entry_round_trip():
    payload = make_payload()

    message = decode_entry(stream_fields(payload))

    assert message.log_id == payload["log_id"]


@pytest.mark.parametrize(
    "mutate",
    [
        lambda p: p.pop("log_id"),
        lambda p: p.pop("aircraft_serial"),
        lambda p: p.pop("telemetry"),
        lambda p: p["telemetry"].pop("start"),
        lambda p: p["source"].pop("filename"),
        lambda p: p.update(log_id="NOT-A-SHA"),
        lambda p: p.update(log_id="A" * 64),  # uppercase hex is not canonical
        lambda p: p.update(arrival_at=p["departure_at"]),
        lambda p: p.update(arrival_at="2026-10-12T08:00:00Z"),
        lambda p: p.update(cycles=0),
        lambda p: p.update(departure_at="yesterday"),
        lambda p: p["telemetry"].update(sample_count=0),
        lambda p: p["telemetry"].update(max_speed_mps=-1),
        lambda p: p["telemetry"].update(distance_m=-0.1),
        lambda p: p["telemetry"].update(battery_end_pct=101),
        lambda p: p["telemetry"]["start"].update(lat=91),
        lambda p: p["source"].update(format="xml"),
    ],
)
def test_invalid_payloads_are_rejected(mutate):
    payload = make_payload()
    mutate(payload)

    with pytest.raises(InvalidMessage):
        parse_payload(payload)


@pytest.mark.parametrize(
    "fields",
    [
        {"schema_version": "2", "payload": "{}"},
        {"payload": "{}"},
        {"schema_version": "1"},
        {"schema_version": "1", "payload": "{not json"},
        {"schema_version": "1", "payload": "[1, 2]"},
        {"schema_version": "1", "payload": '{"x": NaN}'},
    ],
)
def test_invalid_entries_are_rejected(fields):
    with pytest.raises(InvalidMessage):
        decode_entry(fields)


def test_nan_in_telemetry_is_rejected():
    payload = make_payload()
    raw = json.dumps(payload).replace('"max_altitude_m": 118.4', '"max_altitude_m": NaN')

    with pytest.raises(InvalidMessage):
        decode_entry({"schema_version": "1", "payload": raw})
