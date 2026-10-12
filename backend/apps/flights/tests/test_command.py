import fakeredis
import pytest
from django.core.management import call_command

from apps.flights import consumer as consumer_module
from apps.flights.models import Flight

from .conftest import make_payload, stream_fields


# transaction=True: the command closes stale DB connections, which ends a wrapping test transaction.
@pytest.mark.django_db(transaction=True)
def test_once_drains_available_entries(monkeypatch, aircraft, capsys):
    client = fakeredis.FakeRedis(decode_responses=True)
    client_kwargs = {}

    def from_url(url, **kwargs):
        client_kwargs.update(kwargs)
        return client

    monkeypatch.setattr(
        "apps.flights.management.commands.consume_flight_logs.redis.Redis.from_url", from_url
    )
    client.xadd(consumer_module.STREAM, stream_fields(make_payload()))

    call_command("consume_flight_logs", "--once", "--consumer-name", "test")

    assert Flight.objects.count() == 1
    assert "Handled 1 entries." in capsys.readouterr().out
    # Blocking reads must outlast the server-side BLOCK time, or idle streams time out.
    assert client_kwargs["socket_timeout"] > consumer_module.ConsumerConfig().block_ms / 1000
