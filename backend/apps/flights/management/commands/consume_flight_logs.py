import signal
import socket
import threading

import redis
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import close_old_connections

from apps.flights.consumer import ConsumerConfig, StreamConsumer, handle_flight_log_entry


def _handler(message_id, fields):
    # Long-running process: drop broken or expired DB connections before each message,
    # as Django does at the start of every request.
    close_old_connections()
    return handle_flight_log_entry(message_id, fields)


class Command(BaseCommand):
    help = "Consume flight log messages from the Redis stream published by the ingest service."

    def add_arguments(self, parser):
        parser.add_argument("--consumer-name", default=socket.gethostname())
        parser.add_argument(
            "--once", action="store_true", help="Process available entries once and exit."
        )

    def handle(self, *args, **options):
        client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
        consumer = StreamConsumer(
            client, _handler, ConsumerConfig(consumer=options["consumer_name"])
        )

        if options["once"]:
            consumer.ensure_group()
            handled = consumer.poll_once(block_ms=1)
            self.stdout.write(f"Handled {handled} entries.")
            return

        stop = threading.Event()
        for sig in (signal.SIGINT, signal.SIGTERM):
            signal.signal(sig, lambda *_: stop.set())
        self.stdout.write(f"Consuming {consumer.config.stream} as {options['consumer_name']}")
        consumer.run(stop)
        self.stdout.write("Stopped.")
