import pytest
from django.db import DatabaseError
from django.urls import reverse

from apps.core import services


@pytest.mark.django_db
def test_check_database_returns_true_when_connection_works():
    assert services.check_database() is True


def test_check_database_returns_false_on_database_error(monkeypatch):
    class FailingCursor:
        def __enter__(self):
            raise DatabaseError("connection refused")

        def __exit__(self, *args):
            return False

    class FailingConnection:
        def cursor(self):
            return FailingCursor()

    monkeypatch.setattr(services, "connections", {"default": FailingConnection()})

    assert services.check_database() is False


@pytest.mark.django_db
def test_health_endpoint_returns_ok(client):
    response = client.get(reverse("health"))

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "checks": {"database": "ok"}}


def test_health_endpoint_returns_503_when_database_is_down(client, monkeypatch):
    monkeypatch.setattr(services, "check_database", lambda alias="default": False)

    response = client.get(reverse("health"))

    assert response.status_code == 503
    assert response.json() == {"status": "unavailable", "checks": {"database": "unavailable"}}
