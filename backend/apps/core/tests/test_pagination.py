import pytest
from rest_framework.test import APIClient

from apps.core.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from apps.fleet.models import Aircraft
from apps.fleet.tests.factories import AircraftFactory

pytestmark = pytest.mark.django_db

URL = "/api/fleet/aircraft/"


@pytest.fixture
def api():
    return APIClient()


def test_default_page_size_is_unchanged(api):
    AircraftFactory.create_batch(DEFAULT_PAGE_SIZE + 1)

    body = api.get(URL).json()

    assert len(body["results"]) == DEFAULT_PAGE_SIZE
    assert body["count"] == DEFAULT_PAGE_SIZE + 1


def test_page_size_one_returns_the_count_with_a_single_row(api):
    AircraftFactory.create_batch(3, status=Aircraft.Status.GROUNDED)
    AircraftFactory.create_batch(2)

    body = api.get(URL, {"status": "grounded", "page_size": 1}).json()

    assert body["count"] == 3
    assert len(body["results"]) == 1


def test_page_size_is_capped(api):
    AircraftFactory.create_batch(MAX_PAGE_SIZE + 1)

    body = api.get(URL, {"page_size": MAX_PAGE_SIZE + 50}).json()

    assert len(body["results"]) == MAX_PAGE_SIZE
