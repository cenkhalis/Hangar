from rest_framework import serializers

from .models import Flight, FlightLog


class FlightSerializer(serializers.ModelSerializer):
    aircraft_serial = serializers.CharField(source="aircraft.serial_number", read_only=True)
    duration_seconds = serializers.IntegerField(read_only=True)

    class Meta:
        model = Flight
        fields = [
            "id",
            "aircraft",
            "aircraft_serial",
            "log",
            "departure_at",
            "arrival_at",
            "duration_seconds",
            "cycles",
            "sample_count",
            "max_altitude_m",
            "max_speed_mps",
            "distance_m",
            "battery_start_pct",
            "battery_end_pct",
            "start_lat",
            "start_lon",
            "end_lat",
            "end_lon",
        ]
        read_only_fields = fields


class FlightLogSerializer(serializers.ModelSerializer):
    # Declared explicitly: DRF drops allow_blank/allow_null from read_only_fields, which would
    # leave the schema claiming processed logs have a rejection code and rejected logs a flight.
    rejection_code = serializers.ChoiceField(
        choices=FlightLog.RejectionCode.choices, allow_blank=True, read_only=True
    )
    flight = serializers.PrimaryKeyRelatedField(read_only=True, allow_null=True)

    class Meta:
        model = FlightLog
        fields = [
            "id",
            "log_id",
            "status",
            "rejection_code",
            "rejection_detail",
            "source_filename",
            "source_format",
            "schema_version",
            "stream_message_id",
            "received_at",
            "processed_at",
            "duplicate_count",
            "last_seen_at",
            "flight",
            "payload",
        ]
        read_only_fields = fields
