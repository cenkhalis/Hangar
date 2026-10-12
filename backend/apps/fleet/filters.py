import django_filters

from .models import Component


class ComponentFilter(django_filters.FilterSet):
    aircraft = django_filters.NumberFilter(method="filter_aircraft")

    class Meta:
        model = Component
        fields = ["status", "component_type"]

    def filter_aircraft(self, queryset, name, value):
        return queryset.filter(
            installations__aircraft_id=value, installations__removed_at__isnull=True
        )
