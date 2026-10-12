from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import F, Q
from django.db.models.functions import Floor

DEFAULT_WARNING_THRESHOLD_PERCENT = Decimal("10.00")


class AircraftModel(models.Model):
    class Category(models.TextChoices):
        FIXED_WING = "fixed_wing", "Fixed wing"
        MULTIROTOR = "multirotor", "Multirotor"
        VTOL = "vtol", "VTOL"

    manufacturer = models.CharField(max_length=100)
    name = models.CharField(max_length=100)
    category = models.CharField(max_length=20, choices=Category.choices)

    class Meta:
        ordering = ["manufacturer", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["manufacturer", "name"], name="fleet_aircraftmodel_unique_name"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.manufacturer} {self.name}"


class Aircraft(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        GROUNDED = "grounded", "Grounded"
        RETIRED = "retired", "Retired"

    model = models.ForeignKey(AircraftModel, on_delete=models.PROTECT, related_name="aircraft")
    serial_number = models.CharField(max_length=100, unique=True)
    registration = models.CharField(max_length=50, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    in_service_date = models.DateField(null=True, blank=True)
    # Usage since new. Modified only through fleet services.
    flight_seconds = models.PositiveBigIntegerField(default=0)
    cycles = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["serial_number"]
        verbose_name_plural = "aircraft"
        constraints = [
            models.UniqueConstraint(
                fields=["registration"],
                condition=~Q(registration=""),
                name="fleet_aircraft_unique_registration",
            ),
        ]

    def __str__(self) -> str:
        return self.registration or self.serial_number


class ComponentType(models.Model):
    class Category(models.TextChoices):
        MOTOR = "motor", "Motor"
        PROPELLER = "propeller", "Propeller"
        BATTERY = "battery", "Battery"
        ESC = "esc", "ESC"
        FLIGHT_CONTROLLER = "flight_controller", "Flight controller"
        PAYLOAD = "payload", "Payload"
        AIRFRAME = "airframe", "Airframe"
        OTHER = "other", "Other"

    part_number = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=200)
    category = models.CharField(max_length=30, choices=Category.choices)

    class Meta:
        ordering = ["part_number"]

    def __str__(self) -> str:
        return f"{self.part_number} ({self.name})"


class ComponentLifeLimit(models.Model):
    class LimitType(models.TextChoices):
        FLIGHT_HOURS = "flight_hours", "Flight hours"
        CYCLES = "cycles", "Cycles"
        CALENDAR_DAYS = "calendar_days", "Calendar days"

    component_type = models.ForeignKey(
        ComponentType, on_delete=models.CASCADE, related_name="life_limits"
    )
    limit_type = models.CharField(max_length=20, choices=LimitType.choices)
    value = models.DecimalField(max_digits=10, decimal_places=2)
    warning_threshold_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=DEFAULT_WARNING_THRESHOLD_PERCENT,
        validators=[MinValueValidator(Decimal("0.01")), MaxValueValidator(Decimal("99.99"))],
        help_text="Remaining life (as % of the limit) at which the limit becomes due soon.",
    )

    class Meta:
        ordering = ["component_type", "limit_type"]
        constraints = [
            models.UniqueConstraint(
                fields=["component_type", "limit_type"], name="fleet_lifelimit_unique_type"
            ),
            models.CheckConstraint(condition=Q(value__gt=0), name="fleet_lifelimit_value_positive"),
            models.CheckConstraint(
                condition=Q(limit_type="flight_hours") | Q(value=Floor("value")),
                name="fleet_lifelimit_whole_cycles_and_days",
            ),
            models.CheckConstraint(
                condition=Q(warning_threshold_percent__gt=0, warning_threshold_percent__lt=100),
                name="fleet_lifelimit_threshold_range",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.component_type.part_number}: {self.value} {self.get_limit_type_display()}"


class Component(models.Model):
    class Status(models.TextChoices):
        IN_STOCK = "in_stock", "In stock"
        INSTALLED = "installed", "Installed"
        RETIRED = "retired", "Retired"

    component_type = models.ForeignKey(
        ComponentType, on_delete=models.PROTECT, related_name="components"
    )
    serial_number = models.CharField(max_length=100)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.IN_STOCK)
    in_service_date = models.DateField(null=True, blank=True)
    # Usage since new, carried across aircraft. Modified only through fleet services.
    flight_seconds = models.PositiveBigIntegerField(default=0)
    cycles = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["component_type", "serial_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["component_type", "serial_number"], name="fleet_component_unique_serial"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.component_type.part_number} S/N {self.serial_number}"


class ComponentInstallation(models.Model):
    component = models.ForeignKey(Component, on_delete=models.PROTECT, related_name="installations")
    aircraft = models.ForeignKey(Aircraft, on_delete=models.PROTECT, related_name="installations")
    position = models.CharField(max_length=50, blank=True)
    installed_at = models.DateTimeField()
    removed_at = models.DateTimeField(null=True, blank=True)
    removal_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-installed_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["component"],
                condition=Q(removed_at__isnull=True),
                name="fleet_installation_one_open_per_component",
            ),
            models.UniqueConstraint(
                fields=["aircraft", "position"],
                condition=Q(removed_at__isnull=True) & ~Q(position=""),
                name="fleet_installation_one_open_per_position",
            ),
            models.CheckConstraint(
                condition=Q(removed_at__isnull=True) | Q(removed_at__gte=F("installed_at")),
                name="fleet_installation_removed_after_installed",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.component} on {self.aircraft}"
