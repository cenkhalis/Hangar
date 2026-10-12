from decimal import Decimal

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from . import services
from .models import (
    Aircraft,
    AircraftModel,
    Component,
    ComponentInstallation,
    ComponentLifeLimit,
    ComponentType,
)

LIFE_STATES = [state.value for state in services.LifeState]


class HoursField(serializers.DecimalField):
    """Decimal hours in the API, integer seconds in the model."""

    def __init__(self, **kwargs):
        super().__init__(max_digits=12, decimal_places=2, min_value=Decimal("0"), **kwargs)

    def to_representation(self, value):
        return super().to_representation(services.seconds_to_hours(value))

    def to_internal_value(self, data):
        return services.hours_to_seconds(super().to_internal_value(data))


class UsageCountersMixin(serializers.Serializer):
    """Initial usage may be set on create; afterwards counters change only through services."""

    flight_hours = HoursField(source="flight_seconds", required=False)
    cycles = serializers.IntegerField(required=False, min_value=0)

    def validate(self, attrs):
        if self.instance is not None and ({"flight_seconds", "cycles"} & attrs.keys()):
            raise serializers.ValidationError(
                "Usage counters are read-only after creation; "
                "they change only through usage records."
            )
        return super().validate(attrs)


class AircraftModelSerializer(serializers.ModelSerializer):
    class Meta:
        model = AircraftModel
        fields = ["id", "manufacturer", "name", "category"]


class AircraftSerializer(UsageCountersMixin, serializers.ModelSerializer):
    class Meta:
        model = Aircraft
        fields = [
            "id",
            "model",
            "serial_number",
            "registration",
            "status",
            "in_service_date",
            "flight_hours",
            "cycles",
        ]


class ComponentLifeLimitSerializer(serializers.ModelSerializer):
    class Meta:
        model = ComponentLifeLimit
        fields = ["id", "component_type", "limit_type", "value", "warning_threshold_percent"]
        extra_kwargs = {"value": {"min_value": Decimal("0.01")}}

    def validate(self, attrs):
        limit_type = attrs.get("limit_type", getattr(self.instance, "limit_type", None))
        value = attrs.get("value", getattr(self.instance, "value", None))
        if (
            limit_type != ComponentLifeLimit.LimitType.FLIGHT_HOURS
            and value is not None
            and value != value.to_integral_value()
        ):
            raise serializers.ValidationError({"value": "Cycles and days must be whole numbers."})
        return attrs


class NestedLifeLimitSerializer(serializers.ModelSerializer):
    class Meta:
        model = ComponentLifeLimit
        fields = ["id", "limit_type", "value", "warning_threshold_percent"]


class ComponentTypeSerializer(serializers.ModelSerializer):
    life_limits = NestedLifeLimitSerializer(many=True, read_only=True)

    class Meta:
        model = ComponentType
        fields = ["id", "part_number", "name", "category", "life_limits"]


# --- Life status ----------------------------------------------------------------------------


class LimitStatusSerializer(serializers.Serializer):
    limit_type = serializers.CharField()
    limit = serializers.DecimalField(max_digits=12, decimal_places=2)
    used = serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True)
    remaining = serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True)
    percent_used = serializers.DecimalField(max_digits=7, decimal_places=2, allow_null=True)
    state = serializers.ChoiceField(choices=LIFE_STATES)


class LifeStatusSerializer(serializers.Serializer):
    state = serializers.ChoiceField(choices=LIFE_STATES)
    limits = LimitStatusSerializer(many=True)


class CurrentInstallationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ComponentInstallation
        fields = ["id", "aircraft", "position", "installed_at"]


class ComponentSerializer(UsageCountersMixin, serializers.ModelSerializer):
    life_status = serializers.SerializerMethodField()
    current_installation = serializers.SerializerMethodField()

    class Meta:
        model = Component
        fields = [
            "id",
            "component_type",
            "serial_number",
            "status",
            "in_service_date",
            "flight_hours",
            "cycles",
            "life_status",
            "current_installation",
        ]
        read_only_fields = ["status"]

    @extend_schema_field(LifeStatusSerializer)
    def get_life_status(self, obj):
        status = services.get_component_life_status(obj, today=self.context["today"])
        return LifeStatusSerializer(status).data

    @extend_schema_field(CurrentInstallationSerializer(allow_null=True))
    def get_current_installation(self, obj):
        # Uses the `open_installations` prefetch from the viewset when available.
        if hasattr(obj, "open_installations"):
            installation = obj.open_installations[0] if obj.open_installations else None
        else:
            installation = obj.installations.filter(removed_at__isnull=True).first()
        return CurrentInstallationSerializer(installation).data if installation else None


class ComponentInstallationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ComponentInstallation
        fields = [
            "id",
            "component",
            "aircraft",
            "position",
            "installed_at",
            "removed_at",
            "removal_reason",
        ]


# --- Action inputs ---------------------------------------------------------------------------


class InstallComponentInputSerializer(serializers.Serializer):
    aircraft = serializers.PrimaryKeyRelatedField(queryset=Aircraft.objects.all())
    position = serializers.CharField(max_length=50, required=False, default="", allow_blank=True)
    installed_at = serializers.DateTimeField(required=False)


class RemoveComponentInputSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255, required=False, default="", allow_blank=True)
    removed_at = serializers.DateTimeField(required=False)


# --- Airworthiness ---------------------------------------------------------------------------


class InstalledComponentStatusSerializer(serializers.Serializer):
    installation_id = serializers.IntegerField(source="installation.id")
    component = serializers.IntegerField(source="installation.component_id")
    component_type = serializers.IntegerField(source="installation.component.component_type_id")
    serial_number = serializers.CharField(source="installation.component.serial_number")
    position = serializers.CharField(source="installation.position")
    life_status = LifeStatusSerializer()


class AirworthinessSerializer(serializers.Serializer):
    airworthy = serializers.BooleanField()
    state = serializers.ChoiceField(choices=LIFE_STATES)
    components = InstalledComponentStatusSerializer(many=True)
