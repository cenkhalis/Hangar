import datetime
import hashlib

import factory
from django.utils import timezone

from apps.fleet.tests.factories import AircraftFactory
from apps.flights.models import Flight, FlightLog


class FlightLogFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = FlightLog

    log_id = factory.Sequence(lambda n: hashlib.sha256(f"factory-{n}".encode()).hexdigest())
    status = FlightLog.Status.PROCESSED
    payload = factory.LazyFunction(dict)
    schema_version = "1"
    source_filename = factory.Sequence(lambda n: f"log-{n}.csv")
    source_format = "csv"


class FlightFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Flight

    aircraft = factory.SubFactory(AircraftFactory)
    log = factory.SubFactory(FlightLogFactory)
    departure_at = factory.LazyFunction(
        lambda: timezone.make_aware(datetime.datetime(2026, 10, 1, 8, 0))
    )
    arrival_at = factory.LazyAttribute(lambda o: o.departure_at + datetime.timedelta(minutes=30))
    sample_count = 1800
    max_altitude_m = 100.0
    max_speed_mps = 15.0
    distance_m = 5000.0
    battery_start_pct = 100.0
    battery_end_pct = 40.0
    start_lat = 41.0
    start_lon = 29.0
    end_lat = 41.0
    end_lon = 29.0
