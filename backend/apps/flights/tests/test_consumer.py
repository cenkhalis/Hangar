import threading

import fakeredis
import pytest
import redis

from apps.flights.consumer import (
    ConsumerConfig,
    PermanentMessageError,
    StreamConsumer,
    handle_flight_log_entry,
)
from apps.flights.models import Flight, FlightLog

from .conftest import make_payload, stream_fields

STREAM = "test:flight-logs"
DLQ = "test:flight-logs:dlq"
GROUP = "test-group"


@pytest.fixture
def client():
    return fakeredis.FakeRedis(decode_responses=True)


def make_consumer(client, handler, **overrides):
    config = ConsumerConfig(
        stream=STREAM,
        group=GROUP,
        dlq_stream=DLQ,
        consumer="c1",
        block_ms=1,
        claim_idle_ms=0,
        max_deliveries=3,
        **overrides,
    )
    consumer = StreamConsumer(client, handler, config)
    consumer.ensure_group()
    return consumer


def pending_count(client):
    return client.xpending(STREAM, GROUP)["pending"]


class Recorder:
    def __init__(self, fail_times=0, exc=None):
        self.calls = []
        self.fail_times = fail_times
        self.exc = exc or RuntimeError("transient")

    def __call__(self, message_id, fields):
        self.calls.append(message_id)
        if len(self.calls) <= self.fail_times:
            raise self.exc


def test_ensure_group_is_idempotent(client):
    consumer = make_consumer(client, Recorder())

    consumer.ensure_group()


def test_entries_added_before_group_creation_are_consumed(client):
    client.xadd(STREAM, {"k": "v"})
    handler = Recorder()
    consumer = make_consumer(client, handler)

    consumer.poll_once()

    assert len(handler.calls) == 1


def test_successful_entries_are_acknowledged(client):
    handler = Recorder()
    consumer = make_consumer(client, handler)
    ids = [client.xadd(STREAM, {"n": str(i)}) for i in range(3)]

    assert consumer.poll_once() == 3

    assert handler.calls == ids
    assert pending_count(client) == 0
    assert client.xlen(DLQ) == 0


def test_failed_entry_stays_pending_and_is_retried(client):
    handler = Recorder(fail_times=1)
    consumer = make_consumer(client, handler)
    message_id = client.xadd(STREAM, {"n": "1"})

    consumer.poll_once()
    assert pending_count(client) == 1

    consumer.poll_once()  # reclaimed (claim_idle_ms=0) and succeeds

    assert handler.calls == [message_id, message_id]
    assert pending_count(client) == 0


def test_entry_is_dead_lettered_after_max_deliveries(client):
    handler = Recorder(fail_times=99)
    consumer = make_consumer(client, handler)
    message_id = client.xadd(STREAM, {"n": "1"})

    for _ in range(5):
        consumer.poll_once()

    assert len(handler.calls) == 3
    assert pending_count(client) == 0
    [(_, dead)] = client.xrange(DLQ)
    assert dead["original_id"] == message_id
    assert dead["reason"] == "max_deliveries_exceeded"
    assert dead["n"] == "1"


def test_permanent_error_is_dead_lettered_immediately(client):
    handler = Recorder(fail_times=1, exc=PermanentMessageError("bad schema"))
    consumer = make_consumer(client, handler)
    client.xadd(STREAM, {"n": "1"})

    consumer.poll_once()

    assert len(handler.calls) == 1
    assert pending_count(client) == 0
    [(_, dead)] = client.xrange(DLQ)
    assert dead["reason"] == "invalid_message"
    assert dead["detail"] == "bad schema"


def test_stale_entries_from_crashed_consumer_are_claimed(client):
    client.xgroup_create(STREAM, GROUP, id="0", mkstream=True)
    message_id = client.xadd(STREAM, {"n": "1"})
    client.xreadgroup(GROUP, "crashed", {STREAM: ">"}, count=1)  # delivered, never acked
    handler = Recorder()
    consumer = make_consumer(client, handler)

    consumer.poll_once()

    assert handler.calls == [message_id]
    assert pending_count(client) == 0


def test_run_exits_when_stop_is_set(client):
    stop = threading.Event()

    def handler(message_id, fields):
        stop.set()

    consumer = make_consumer(client, handler)
    client.xadd(STREAM, {"n": "1"})
    thread = threading.Thread(target=consumer.run, args=(stop,))
    thread.start()
    thread.join(timeout=5)

    assert not thread.is_alive()


@pytest.mark.parametrize("error", [redis.TimeoutError, redis.ConnectionError])
def test_run_survives_redis_outages(client, error):
    stop = threading.Event()
    handler = Recorder()
    consumer = make_consumer(client, handler, reconnect_delay_s=0)
    client.xadd(STREAM, {"n": "1"})
    real_xreadgroup = client.xreadgroup
    calls = []

    def flaky_xreadgroup(*args, **kwargs):
        calls.append(1)
        if len(calls) == 1:
            raise error("socket timed out")
        if handler.calls:
            stop.set()
        return real_xreadgroup(*args, **kwargs)

    client.xreadgroup = flaky_xreadgroup
    thread = threading.Thread(target=consumer.run, args=(stop,))
    thread.start()
    thread.join(timeout=5)

    assert not thread.is_alive()
    assert len(handler.calls) == 1


# --- Flight log handler, end to end through the consumer ------------------------------------


@pytest.mark.django_db
class TestFlightLogHandler:
    def test_valid_entry_creates_flight(self, client, aircraft):
        consumer = make_consumer(client, handle_flight_log_entry)
        client.xadd(STREAM, stream_fields(make_payload()))

        consumer.poll_once()

        assert Flight.objects.count() == 1
        assert pending_count(client) == 0

    @pytest.mark.parametrize(
        "fields",
        [
            {"schema_version": "9", "payload": "{}"},
            {"schema_version": "1", "payload": "{broken"},
            {"schema_version": "1", "payload": '{"log_id": "x"}'},
        ],
    )
    def test_invalid_entry_goes_to_dlq(self, client, fields):
        consumer = make_consumer(client, handle_flight_log_entry)
        client.xadd(STREAM, fields)

        consumer.poll_once()

        assert client.xlen(DLQ) == 1
        assert pending_count(client) == 0
        assert not FlightLog.objects.exists()

    def test_rejected_log_is_acknowledged_not_dead_lettered(self, client):
        consumer = make_consumer(client, handle_flight_log_entry)
        client.xadd(STREAM, stream_fields(make_payload(aircraft_serial="UNKNOWN")))

        consumer.poll_once()

        assert FlightLog.objects.get().status == FlightLog.Status.REJECTED
        assert pending_count(client) == 0
        assert client.xlen(DLQ) == 0

    def test_redelivery_after_crash_before_ack_records_usage_once(self, client, aircraft):
        payload = make_payload()
        client.xgroup_create(STREAM, GROUP, id="0", mkstream=True)
        message_id = client.xadd(STREAM, stream_fields(payload))
        # A consumer processes the entry, commits, then crashes before XACK.
        [[_, [(_, fields)]]] = client.xreadgroup(GROUP, "crashed", {STREAM: ">"}, count=1)
        handle_flight_log_entry(message_id, fields)
        consumer = make_consumer(client, handle_flight_log_entry)

        consumer.poll_once()

        aircraft.refresh_from_db()
        assert aircraft.cycles == 1
        assert Flight.objects.count() == 1
        assert FlightLog.objects.get().duplicate_count == 1
        assert pending_count(client) == 0

    def test_same_file_published_twice_creates_one_flight(self, client, aircraft):
        consumer = make_consumer(client, handle_flight_log_entry)
        fields = stream_fields(make_payload())
        client.xadd(STREAM, fields)
        client.xadd(STREAM, fields)

        consumer.poll_once()

        assert Flight.objects.count() == 1
        aircraft.refresh_from_db()
        assert aircraft.cycles == 1
