from django.contrib import admin

from .models import (
    InspectionInterval,
    MaintenanceProgram,
    MaintenanceTask,
    TaskCompletion,
    WorkOrder,
    WorkOrderItem,
)


class InspectionIntervalInline(admin.TabularInline):
    model = InspectionInterval
    extra = 0


@admin.register(MaintenanceProgram)
class MaintenanceProgramAdmin(admin.ModelAdmin):
    list_display = ["name", "aircraft_model"]


@admin.register(MaintenanceTask)
class MaintenanceTaskAdmin(admin.ModelAdmin):
    list_display = ["code", "title", "program", "is_active"]
    list_filter = ["program", "is_active"]
    search_fields = ["code", "title"]
    inlines = [InspectionIntervalInline]


class WorkOrderItemInline(admin.TabularInline):
    model = WorkOrderItem
    extra = 0
    readonly_fields = ["task", "status"]
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(WorkOrder)
class WorkOrderAdmin(admin.ModelAdmin):
    list_display = ["id", "title", "aircraft", "status", "opened_at", "closed_at"]
    list_filter = ["status"]
    readonly_fields = ["aircraft", "status", "opened_at", "closed_at", "cancel_reason"]
    inlines = [WorkOrderItemInline]


@admin.register(TaskCompletion)
class TaskCompletionAdmin(admin.ModelAdmin):
    """Sign-offs are created and voided through the API so domain rules apply."""

    list_display = ["task", "aircraft", "kind", "performed_at", "performed_by", "voided_at"]
    list_filter = ["kind", "task__program"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
