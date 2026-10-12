import datetime

import pytest
from django.utils import timezone


def at(year: int, month: int, day: int, hour: int = 12) -> datetime.datetime:
    return timezone.make_aware(datetime.datetime(year, month, day, hour))


@pytest.fixture
def t0() -> datetime.datetime:
    return at(2026, 3, 1)
