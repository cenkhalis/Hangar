import django_filters

from .models import Flight


class FlightFilter(django_filters.FilterSet):
    departure_after = django_filters.IsoDateTimeFilter(field_name="departure_at", lookup_expr="gte")
    departure_before = django_filters.IsoDateTimeFilter(field_name="departure_at", lookup_expr="lt")

    class Meta:
        model = Flight
        fields = ["aircraft"]
