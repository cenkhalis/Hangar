from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("programs", views.MaintenanceProgramViewSet)
router.register("tasks", views.MaintenanceTaskViewSet)
router.register("intervals", views.InspectionIntervalViewSet)
router.register("work-orders", views.WorkOrderViewSet)
router.register("work-order-items", views.WorkOrderItemViewSet)
router.register("completions", views.TaskCompletionViewSet)
router.register("aircraft", views.AircraftMaintenanceViewSet, basename="maintenance-aircraft")

urlpatterns = [path("due/", views.DueListView.as_view(), name="maintenance-due"), *router.urls]
