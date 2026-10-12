from django.db.models import Prefetch
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.fleet.models import Aircraft

from . import services
from .filters import TaskCompletionFilter
from .models import (
    InspectionInterval,
    MaintenanceProgram,
    MaintenanceTask,
    TaskCompletion,
    WorkOrder,
    WorkOrderItem,
)
from .serializers import (
    DueItemSerializer,
    HistoricalCompletionSerializer,
    InspectionIntervalSerializer,
    MaintenanceProgramSerializer,
    MaintenanceReportSerializer,
    MaintenanceTaskSerializer,
    ReasonSerializer,
    SignOffSerializer,
    TaskCompletionSerializer,
    WorkOrderCreateSerializer,
    WorkOrderItemSerializer,
    WorkOrderSerializer,
)


def _validated(serializer_class, data):
    serializer = serializer_class(data=data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


class MaintenanceProgramViewSet(viewsets.ModelViewSet):
    queryset = MaintenanceProgram.objects.prefetch_related("tasks__intervals")
    serializer_class = MaintenanceProgramSerializer
    filterset_fields = ["aircraft_model"]


class MaintenanceTaskViewSet(viewsets.ModelViewSet):
    queryset = MaintenanceTask.objects.prefetch_related("intervals")
    serializer_class = MaintenanceTaskSerializer
    filterset_fields = ["program", "is_active"]


class InspectionIntervalViewSet(viewsets.ModelViewSet):
    queryset = InspectionInterval.objects.all()
    serializer_class = InspectionIntervalSerializer
    filterset_fields = ["task", "interval_type"]


class WorkOrderViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    queryset = WorkOrder.objects.prefetch_related(
        Prefetch("items", queryset=WorkOrderItem.objects.select_related("task", "completion"))
    )
    serializer_class = WorkOrderSerializer
    filterset_fields = ["aircraft", "status"]

    @extend_schema(request=WorkOrderCreateSerializer, responses={201: WorkOrderSerializer})
    def create(self, request, *args, **kwargs):
        data = _validated(WorkOrderCreateSerializer, request.data)
        work_order = services.create_work_order(
            data["aircraft"],
            data["tasks"],
            title=data["title"],
            notes=data["notes"],
            opened_at=data.get("opened_at") or timezone.now(),
        )
        body = self.get_serializer(self.get_queryset().get(pk=work_order.pk)).data
        return Response(body, status=status.HTTP_201_CREATED)

    @extend_schema(request=ReasonSerializer, responses=WorkOrderSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        data = _validated(ReasonSerializer, request.data)
        work_order = services.cancel_work_order(self.get_object(), reason=data["reason"])
        return Response(self.get_serializer(self.get_queryset().get(pk=work_order.pk)).data)


class WorkOrderItemViewSet(mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = WorkOrderItem.objects.select_related("task", "completion")
    serializer_class = WorkOrderItemSerializer

    @extend_schema(request=SignOffSerializer, responses=TaskCompletionSerializer)
    @action(detail=True, methods=["post"], url_path="sign-off")
    def sign_off(self, request, pk=None):
        data = _validated(SignOffSerializer, request.data)
        completion = services.sign_off_item(
            self.get_object(),
            performed_at=data.get("performed_at") or timezone.now(),
            performed_by=data["performed_by"],
            notes=data["notes"],
        )
        return Response(TaskCompletionSerializer(completion).data)


class TaskCompletionViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """Sign-off history. POST records a historical completion; others come from work orders."""

    queryset = TaskCompletion.objects.select_related("work_order_item")
    serializer_class = TaskCompletionSerializer
    filterset_class = TaskCompletionFilter

    @extend_schema(
        request=HistoricalCompletionSerializer, responses={201: TaskCompletionSerializer}
    )
    def create(self, request, *args, **kwargs):
        data = _validated(HistoricalCompletionSerializer, request.data)
        completion = services.record_historical_completion(
            data["aircraft"],
            data["task"],
            performed_at=data["performed_at"],
            performed_by=data["performed_by"],
            notes=data["notes"],
        )
        return Response(self.get_serializer(completion).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=ReasonSerializer, responses=TaskCompletionSerializer)
    @action(detail=True, methods=["post"])
    def void(self, request, pk=None):
        data = _validated(ReasonSerializer, request.data)
        completion = services.void_completion(self.get_object(), reason=data["reason"])
        return Response(self.get_serializer(completion).data)


class AircraftMaintenanceViewSet(viewsets.GenericViewSet):
    queryset = Aircraft.objects.all()
    serializer_class = MaintenanceReportSerializer

    @action(detail=True, methods=["get"])
    def status(self, request, pk=None):
        report = services.get_aircraft_maintenance_status(
            self.get_object(), today=timezone.localdate()
        )
        return Response(MaintenanceReportSerializer(report).data)


class DueListView(APIView):
    """Tasks due soon or overdue across the fleet. ``?state=overdue&aircraft=1``."""

    @extend_schema(
        parameters=[
            OpenApiParameter(
                "state",
                str,
                many=True,
                enum=[s.value for s in services.DueState],
                description="Defaults to due_soon and overdue.",
            ),
            OpenApiParameter("aircraft", int, many=True),
        ],
        responses=DueItemSerializer(many=True),
    )
    def get(self, request):
        states = request.query_params.getlist("state") or list(services.DEFAULT_DUE_STATES)
        try:
            states = [services.DueState(s) for s in states]
        except ValueError as exc:
            raise ValidationError({"state": str(exc)}) from exc
        aircraft = request.query_params.getlist("aircraft")
        if not all(a.isdigit() for a in aircraft):
            raise ValidationError({"aircraft": "Aircraft ids must be integers."})
        items = services.get_fleet_due_list(
            today=timezone.localdate(),
            states=states,
            aircraft_ids=[int(a) for a in aircraft] or None,
        )
        return Response(DueItemSerializer(items, many=True).data)
