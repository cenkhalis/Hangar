import django_filters

from .models import TaskCompletion


class TaskCompletionFilter(django_filters.FilterSet):
    voided = django_filters.BooleanFilter(method="filter_voided")

    class Meta:
        model = TaskCompletion
        fields = ["aircraft", "task", "kind"]

    def filter_voided(self, queryset, name, value):
        return queryset.filter(voided_at__isnull=not value)
