from django.contrib import admin

from .models import Flight, FlightLog


class ReadOnlyAdmin(admin.ModelAdmin):
    """Flights and logs are created only by the ingest pipeline."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(FlightLog)
class FlightLogAdmin(ReadOnlyAdmin):
    list_display = ["source_filename", "status", "rejection_code", "received_at", "duplicate_count"]
    list_filter = ["status", "rejection_code"]
    search_fields = ["log_id", "source_filename"]


@admin.register(Flight)
class FlightAdmin(ReadOnlyAdmin):
    list_display = ["aircraft", "departure_at", "arrival_at", "distance_m", "max_altitude_m"]
    list_filter = ["aircraft"]
    date_hierarchy = "departure_at"
