from django.contrib import admin

from .models import (
    Aircraft,
    AircraftModel,
    Component,
    ComponentInstallation,
    ComponentLifeLimit,
    ComponentType,
)


@admin.register(AircraftModel)
class AircraftModelAdmin(admin.ModelAdmin):
    list_display = ["manufacturer", "name", "category"]
    list_filter = ["category"]


@admin.register(Aircraft)
class AircraftAdmin(admin.ModelAdmin):
    list_display = ["serial_number", "registration", "model", "status", "flight_seconds", "cycles"]
    list_filter = ["status", "model"]
    search_fields = ["serial_number", "registration"]
    readonly_fields = ["flight_seconds", "cycles"]


class ComponentLifeLimitInline(admin.TabularInline):
    model = ComponentLifeLimit
    extra = 0


@admin.register(ComponentType)
class ComponentTypeAdmin(admin.ModelAdmin):
    list_display = ["part_number", "name", "category"]
    list_filter = ["category"]
    search_fields = ["part_number", "name"]
    inlines = [ComponentLifeLimitInline]


class ComponentInstallationInline(admin.TabularInline):
    model = ComponentInstallation
    extra = 0
    can_delete = False
    readonly_fields = [
        "aircraft",
        "position",
        "installed_at",
        "removed_at",
        "removal_reason",
    ]

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Component)
class ComponentAdmin(admin.ModelAdmin):
    list_display = ["serial_number", "component_type", "status", "flight_seconds", "cycles"]
    list_filter = ["status", "component_type__category"]
    search_fields = ["serial_number", "component_type__part_number"]
    readonly_fields = ["status", "flight_seconds", "cycles"]
    inlines = [ComponentInstallationInline]
