from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import F, Q
from django.db.models.functions import Floor
from django.utils import timezone

from apps.fleet.models import Aircraft, AircraftModel

DEFAULT_WARNING_THRESHOLD_PERCENT = Decimal("10.00")


class MaintenanceProgram(models.Model):
    """The scheduled maintenance program followed by every aircraft of a model."""

    aircraft_model = models.OneToOneField(
        AircraftModel, on_delete=models.PROTECT, related_name="maintenance_program"
    )
    name = models.CharField(max_length=200)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class MaintenanceTask(models.Model):
    program = models.ForeignKey(MaintenanceProgram, on_delete=models.CASCADE, related_name="tasks")
    code = models.CharField(max_length=50)
    title = models.CharField(max_length=200)
    instructions = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["program", "code"]
        constraints = [
            models.UniqueConstraint(
                fields=["program", "code"], name="maintenance_task_unique_code"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.code} {self.title}"


class InspectionInterval(models.Model):
    """A resetting interval: the task falls due when this much usage accrues after a sign-off."""

    class IntervalType(models.TextChoices):
        FLIGHT_HOURS = "flight_hours", "Flight hours"
        CYCLES = "cycles", "Cycles"
        CALENDAR_DAYS = "calendar_days", "Calendar days"

    task = models.ForeignKey(MaintenanceTask, on_delete=models.CASCADE, related_name="intervals")
    interval_type = models.CharField(max_length=20, choices=IntervalType.choices)
    value = models.DecimalField(max_digits=10, decimal_places=2)
    warning_threshold_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=DEFAULT_WARNING_THRESHOLD_PERCENT,
        validators=[MinValueValidator(Decimal("0.01")), MaxValueValidator(Decimal("99.99"))],
        help_text="Remaining interval (as % of the interval) at which the task becomes due soon.",
    )

    class Meta:
        ordering = ["task", "interval_type"]
        constraints = [
            models.UniqueConstraint(
                fields=["task", "interval_type"], name="maintenance_interval_unique_type"
            ),
            models.CheckConstraint(
                condition=Q(value__gt=0), name="maintenance_interval_value_positive"
            ),
            models.CheckConstraint(
                condition=Q(interval_type="flight_hours") | Q(value=Floor("value")),
                name="maintenance_interval_whole_cycles_and_days",
            ),
            models.CheckConstraint(
                condition=Q(warning_threshold_percent__gt=0, warning_threshold_percent__lt=100),
                name="maintenance_interval_threshold_range",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.task.code}: every {self.value} {self.get_interval_type_display()}"


class WorkOrder(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    aircraft = models.ForeignKey(Aircraft, on_delete=models.PROTECT, related_name="work_orders")
    title = models.CharField(max_length=200)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    opened_at = models.DateTimeField(default=timezone.now)
    closed_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ["-opened_at"]
        constraints = [
            models.CheckConstraint(
                condition=(Q(status="open") & Q(closed_at__isnull=True))
                | (~Q(status="open") & Q(closed_at__isnull=False)),
                name="maintenance_workorder_closed_at_matches_status",
            ),
            models.CheckConstraint(
                condition=Q(closed_at__isnull=True) | Q(closed_at__gte=F("opened_at")),
                name="maintenance_workorder_closed_after_opened",
            ),
            models.CheckConstraint(
                condition=Q(status="cancelled") | Q(cancel_reason=""),
                name="maintenance_workorder_cancel_reason_only_when_cancelled",
            ),
        ]

    def __str__(self) -> str:
        return f"WO-{self.pk} {self.title}"


class WorkOrderItem(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SIGNED_OFF = "signed_off", "Signed off"
        CANCELLED = "cancelled", "Cancelled"

    work_order = models.ForeignKey(WorkOrder, on_delete=models.CASCADE, related_name="items")
    task = models.ForeignKey(
        MaintenanceTask, on_delete=models.PROTECT, related_name="work_order_items"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)

    class Meta:
        ordering = ["work_order", "task__code"]
        constraints = [
            models.UniqueConstraint(
                fields=["work_order", "task"], name="maintenance_item_unique_task_per_order"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.work_order} / {self.task.code}"


class TaskCompletion(models.Model):
    """Sign-off record. Immutable apart from voiding; a voided record stays in the history."""

    class Kind(models.TextChoices):
        WORK_ORDER = "work_order", "Work order"
        HISTORICAL = "historical", "Historical"

    aircraft = models.ForeignKey(
        Aircraft, on_delete=models.PROTECT, related_name="task_completions"
    )
    task = models.ForeignKey(MaintenanceTask, on_delete=models.PROTECT, related_name="completions")
    work_order_item = models.OneToOneField(
        WorkOrderItem,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="completion",
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    performed_at = models.DateTimeField()
    performed_by = models.CharField(max_length=200)
    notes = models.TextField(blank=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-performed_at", "-id"]
        indexes = [
            models.Index(
                fields=["aircraft", "task", "-performed_at"], name="maint_completion_latest_idx"
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(Q(kind="work_order") & Q(work_order_item__isnull=False))
                | (Q(kind="historical") & Q(work_order_item__isnull=True)),
                name="maintenance_completion_kind_matches_item",
            ),
            models.CheckConstraint(
                condition=(Q(voided_at__isnull=True) & Q(void_reason=""))
                | (Q(voided_at__isnull=False) & ~Q(void_reason="")),
                name="maintenance_completion_void_reason_with_voided_at",
            ),
            models.CheckConstraint(
                condition=~Q(performed_by=""), name="maintenance_completion_performed_by_required"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.task.code} on {self.aircraft} at {self.performed_at:%Y-%m-%d}"
