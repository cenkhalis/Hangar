import copy
import hashlib
import itertools
import json
from pathlib import Path

import pytest
from django.conf import settings

from apps.flights.messages import parse_payload

GOLDEN_PATH = settings.BASE_DIR.parent / "contracts" / "flight-log" / "v1" / "message.json"
_counter = itertools.count()


def golden_payload() -> dict:
    return json.loads(Path(GOLDEN_PATH).read_text())


def make_payload(**overrides) -> dict:
    """Golden payload with a fresh log_id; top-level keys and ``telemetry`` may be overridden."""
    payload = copy.deepcopy(golden_payload())
    payload["log_id"] = hashlib.sha256(f"log-{next(_counter)}".encode()).hexdigest()
    telemetry = overrides.pop("telemetry", {})
    payload.update(overrides)
    payload["telemetry"].update(telemetry)
    return payload


def make_message(**overrides):
    return parse_payload(make_payload(**overrides))


def stream_fields(payload: dict, schema_version: str = "1") -> dict[str, str]:
    return {"schema_version": schema_version, "payload": json.dumps(payload)}


@pytest.fixture
def aircraft(db):
    from apps.fleet.tests.factories import AircraftFactory

    return AircraftFactory(serial_number="AC-00042")
