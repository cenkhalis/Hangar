"""Redis Streams consumer with consumer-group acknowledgement and a dead-letter stream."""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass

import redis
from django.utils import timezone

from . import services
from .messages import InvalidMessage, decode_entry

logger = logging.getLogger(__name__)

STREAM = "hangar:flight-logs:v1"
GROUP = "django-flights"
DLQ_STREAM = "hangar:flight-logs:v1:dlq"


class PermanentMessageError(Exception):
    """Raised by a handler for a message that can never succeed; it is dead-lettered at once."""


Handler = Callable[[str, dict[str, str]], object]


@dataclass(frozen=True)
class ConsumerConfig:
    stream: str = STREAM
    group: str = GROUP
    dlq_stream: str = DLQ_STREAM
    consumer: str = "consumer-1"
    batch_size: int = 10
    block_ms: int = 5000
    claim_idle_ms: int = 60_000
    max_deliveries: int = 5
    reconnect_delay_s: float = 2.0


class StreamConsumer:
    """At-least-once consumer: entries are acknowledged only after the handler returns.

    Handler exceptions leave the entry pending; it is reclaimed after ``claim_idle_ms`` and
    dead-lettered once delivered ``max_deliveries`` times. ``PermanentMessageError`` skips retries.
    """

    def __init__(self, client: redis.Redis, handler: Handler, config: ConsumerConfig):
        self.client = client
        self.handler = handler
        self.config = config

    def ensure_group(self) -> None:
        try:
            self.client.xgroup_create(self.config.stream, self.config.group, id="0", mkstream=True)
        except redis.ResponseError as exc:
            if "BUSYGROUP" not in str(exc):
                raise

    def run(self, stop: threading.Event) -> None:
        self.ensure_group()
        while not stop.is_set():
            try:
                self.poll_once()
            except (redis.ConnectionError, redis.TimeoutError):
                logger.exception("Redis unavailable; retrying")
                stop.wait(self.config.reconnect_delay_s)

    def poll_once(self, *, block_ms: int | None = None) -> int:
        """Process reclaimed stale entries, then new ones. Returns the number of entries seen."""
        handled = 0
        for message_id, fields in self._claim_stale():
            deliveries = self._delivery_count(message_id)
            if deliveries > self.config.max_deliveries:
                self._dead_letter(message_id, fields, "max_deliveries_exceeded", "")
            else:
                self._handle(message_id, fields, deliveries)
            handled += 1
        for message_id, fields in self._read_new(block_ms):
            self._handle(message_id, fields, 1)
            handled += 1
        return handled

    def _read_new(self, block_ms: int | None):
        response = self.client.xreadgroup(
            self.config.group,
            self.config.consumer,
            {self.config.stream: ">"},
            count=self.config.batch_size,
            block=self.config.block_ms if block_ms is None else block_ms,
        )
        return response[0][1] if response else []

    def _claim_stale(self):
        _, entries, *_ = self.client.xautoclaim(
            self.config.stream,
            self.config.group,
            self.config.consumer,
            min_idle_time=self.config.claim_idle_ms,
            start_id="0-0",
            count=self.config.batch_size,
        )
        # Entries deleted from the stream while pending come back as None.
        return [(mid, fields) for mid, fields in entries if fields is not None]

    def _delivery_count(self, message_id: str) -> int:
        pending = self.client.xpending_range(
            self.config.stream, self.config.group, min=message_id, max=message_id, count=1
        )
        return pending[0]["times_delivered"] if pending else 1

    def _handle(self, message_id: str, fields: dict[str, str], deliveries: int) -> None:
        try:
            self.handler(message_id, fields)
        except PermanentMessageError as exc:
            self._dead_letter(message_id, fields, "invalid_message", str(exc))
            return
        except Exception as exc:
            logger.exception("Handler failed for %s (delivery %d)", message_id, deliveries)
            if deliveries >= self.config.max_deliveries:
                self._dead_letter(message_id, fields, "max_deliveries_exceeded", repr(exc))
            return
        self.client.xack(self.config.stream, self.config.group, message_id)

    def _dead_letter(self, message_id: str, fields: dict[str, str], reason: str, detail: str):
        logger.error("Dead-lettering %s: %s %s", message_id, reason, detail)
        pipe = self.client.pipeline()
        pipe.xadd(
            self.config.dlq_stream,
            {
                **fields,
                "original_id": message_id,
                "reason": reason,
                "detail": detail[:2000],
                "failed_at": timezone.now().isoformat(),
            },
        )
        pipe.xack(self.config.stream, self.config.group, message_id)
        pipe.execute()


def handle_flight_log_entry(message_id: str, fields: dict[str, str]) -> services.ProcessResult:
    """Stream handler: decode the entry and process it through the flights service."""
    try:
        message = decode_entry(fields)
    except InvalidMessage as exc:
        raise PermanentMessageError(str(exc)) from exc
    result = services.process_flight_log(message, stream_message_id=message_id)
    logger.info(
        "Flight log %s from %s: %s", message.log_id[:12], message.source.filename, result.outcome
    )
    return result
