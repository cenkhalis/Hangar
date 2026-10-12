from decimal import Decimal

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.fleet.models import Aircraft

from .models import (
    InspectionInterval,
    MaintenanceProgram,
    MaintenanceTask,
    TaskCompletion,
    WorkOrder,
    WorkOrderItem,
)
from .services import DueState

DECIMAL = {"max_digits": 12, "decimal_places": 2}
DUE_STATES = [state.value for state in DueState]


class InspectionIntervalSerializer(serializers.ModelSerializer):
    class Meta:
        model = InspectionInterval
        fields = ["id", "task", "interval_type", "value", "warning_threshold_percent"]
        extra_kwargs = {"value": {"min_value": Decimal("0.01")}}

    def validate(self, attrs):
        interval_type = attrs.get("interval_type", getattr(self.instance, "interval_type", None))
        value = attrs.get("value", getattr(self.instance, "value", None))
        if (
            interval_type != InspectionInterval.IntervalType.FLIGHT_HOURS
            and value is not None
            and value != value.to_integral_value()
        ):
            raise serializers.ValidationError({"value": "Cycles and days must be whole numbers."})
        return attrs


class NestedIntervalSerializer(serializers.ModelSerializer):
    class Meta:
        model = InspectionInterval
        fields = ["id", "interval_type", "value", "warning_threshold_percent"]


class MaintenanceTaskSerializer(serializers.ModelSerializer):
    intervals = NestedIntervalSerializer(many=True, read_only=True)

    class Meta:
        model = MaintenanceTask
        fields = ["id", "program", "code", "title", "instructions", "is_active", "intervals"]


class NestedTaskSerializer(serializers.ModelSerializer):
    intervals = NestedIntervalSerializer(many=True, read_only=True)

    class Meta:
        model = MaintenanceTask
        fields = ["id", "code", "title", "is_active", "intervals"]


class MaintenanceProgramSerializer(serializers.ModelSerializer):
    tasks = NestedTaskSerializer(many=True, read_only=True)

    class Meta:
        model = MaintenanceProgram
        fields = ["id", "aircraft_model", "name", "notes", "tasks"]


# --- Work orders -----------------------------------------------------------------------------


class WorkOrderItemSerializer(serializers.ModelSerializer):
    task_code = serializers.CharField(source="task.code", read_only=True)
    task_title = serializers.CharField(source="task.title", read_only=True)
    completion = serializers.SerializerMethodField()

    class Meta:
        model = WorkOrderItem
        fields = ["id", "work_order", "task", "task_code", "task_title", "status", "completion"]

    @extend_schema_field(serializers.IntegerField(allow_null=True))
    def get_completion(self, obj):
        completion = getattr(obj, "completion", None)
        return completion.pk if completion else None


class WorkOrderSerializer(serializers.ModelSerializer):
    aircraft_serial = serializers.CharField(source="aircraft.serial_number", read_only=True)
    items = WorkOrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = WorkOrder
        fields = [
            "id",
            "aircraft",
            "aircraft_serial",
            "title",
            "notes",
            "status",
            "opened_at",
            "closed_at",
            "cancel_reason",
            "items",
        ]
        read_only_fields = ["aircraft", "status", "opened_at", "closed_at", "cancel_reason"]


class WorkOrderCreateSerializer(serializers.Serializer):
    aircraft = serializers.PrimaryKeyRelatedField(queryset=Aircraft.objects.all())
    tasks = serializers.PrimaryKeyRelatedField(
        queryset=MaintenanceTask.objects.select_related("program"), many=True, allow_empty=False
    )
    title = serializers.CharField(max_length=200)
    notes = serializers.CharField(required=False, default="", allow_blank=True)
    opened_at = serializers.DateTimeField(required=False)


class ReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500)


class SignOffSerializer(serializers.Serializer):
    performed_by = serializers.CharField(max_length=200)
    performed_at = serializers.DateTimeField(required=False)
    notes = serializers.CharField(required=False, default="", allow_blank=True)


# --- Completions -----------------------------------------------------------------------------


class TaskCompletionSerializer(serializers.ModelSerializer):
    aircraft_serial = serializers.CharField(source="aircraft.serial_number", read_only=True)
    task_code = serializers.CharField(source="task.code", read_only=True)
    task_title = serializers.CharField(source="task.title", read_only=True)
    voided = serializers.SerializerMethodField()
    work_order = serializers.IntegerField(
        source="work_order_item.work_order_id", read_only=True, default=None
    )

    class Meta:
        model = TaskCompletion
        fields = [
            "id",
            "aircraft",
            "aircraft_serial",
            "task",
            "task_code",
            "task_title",
            "kind",
            "work_order_item",
            "work_order",
            "performed_at",
            "performed_by",
            "notes",
            "voided",
            "voided_at",
            "void_reason",
            "created_at",
        ]
        read_only_fields = fields

    def get_voided(self, obj) -> bool:
        return obj.voided_at is not None


class HistoricalCompletionSerializer(serializers.Serializer):
    aircraft = serializers.PrimaryKeyRelatedField(queryset=Aircraft.objects.all())
    task = serializers.PrimaryKeyRelatedField(
        queryset=MaintenanceTask.objects.select_related("program")
    )
    performed_at = serializers.DateTimeField()
    performed_by = serializers.CharField(max_length=200)
    notes = serializers.CharField(required=False, default="", allow_blank=True)


# --- Status ----------------------------------------------------------------------------------


class IntervalStatusSerializer(serializers.Serializer):
    interval_type = serializers.CharField()
    interval = serializers.DecimalField(**DECIMAL)
    used = serializers.DecimalField(**DECIMAL, allow_null=True)
    remaining = serializers.DecimalField(**DECIMAL, allow_null=True)
    percent_used = serializers.DecimalField(max_digits=7, decimal_places=2, allow_null=True)
    state = serializers.ChoiceField(choices=DUE_STATES)
    due_date = serializers.DateField(allow_null=True)
    due_at_aircraft_hours = serializers.DecimalField(**DECIMAL, allow_null=True)
    due_at_aircraft_cycles = serializers.DecimalField(**DECIMAL, allow_null=True)


class LastCompletionSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskCompletion
        fields = ["id", "kind", "performed_at", "performed_by"]


class TaskStatusSerializer(serializers.Serializer):
    task = serializers.IntegerField(source="task.id")
    code = serializers.CharField(source="task.code")
    title = serializers.CharField(source="task.title")
    state = serializers.ChoiceField(choices=DUE_STATES)
    last_completion = LastCompletionSerializer(allow_null=True)
    intervals = IntervalStatusSerializer(many=True)


class MaintenanceReportSerializer(serializers.Serializer):
    aircraft = serializers.IntegerField(source="aircraft.id")
    state = serializers.ChoiceField(choices=DUE_STATES)
    tasks = TaskStatusSerializer(many=True)


class DueItemSerializer(serializers.Serializer):
    aircraft = serializers.IntegerField(source="aircraft.id")
    aircraft_serial = serializers.CharField(source="aircraft.serial_number")
    task = serializers.IntegerField(source="status.task.id")
    code = serializers.CharField(source="status.task.code")
    title = serializers.CharField(source="status.task.title")
    state = serializers.ChoiceField(choices=DUE_STATES, source="status.state")
    intervals = IntervalStatusSerializer(source="status.intervals", many=True)
