from django.db.models import Prefetch
from django.utils import timezone
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from . import services
from .filters import ComponentFilter
from .models import (
    Aircraft,
    AircraftModel,
    Component,
    ComponentInstallation,
    ComponentLifeLimit,
    ComponentType,
)
from .serializers import (
    AircraftModelSerializer,
    AircraftSerializer,
    AirworthinessSerializer,
    ComponentInstallationSerializer,
    ComponentLifeLimitSerializer,
    ComponentSerializer,
    ComponentTypeSerializer,
    InstallComponentInputSerializer,
    RemoveComponentInputSerializer,
)


class NoDestroyModelViewSet(
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.ListModelMixin,
    viewsets.GenericViewSet,
):
    """Records with history are retired rather than deleted."""


class AircraftModelViewSet(viewsets.ModelViewSet):
    queryset = AircraftModel.objects.all()
    serializer_class = AircraftModelSerializer
    filterset_fields = ["category"]


class AircraftViewSet(NoDestroyModelViewSet):
    queryset = Aircraft.objects.all()
    serializer_class = AircraftSerializer
    filterset_fields = ["status", "model"]

    @action(detail=True, methods=["get"])
    def airworthiness(self, request, pk=None):
        report = services.get_aircraft_airworthiness(self.get_object(), today=timezone.localdate())
        return Response(AirworthinessSerializer(report).data)


class ComponentTypeViewSet(viewsets.ModelViewSet):
    queryset = ComponentType.objects.prefetch_related("life_limits")
    serializer_class = ComponentTypeSerializer
    filterset_fields = ["category"]


class ComponentLifeLimitViewSet(viewsets.ModelViewSet):
    queryset = ComponentLifeLimit.objects.all()
    serializer_class = ComponentLifeLimitSerializer
    filterset_fields = ["component_type", "limit_type"]


class ComponentViewSet(NoDestroyModelViewSet):
    queryset = Component.objects.select_related("component_type").prefetch_related(
        "component_type__life_limits",
        Prefetch(
            "installations",
            queryset=ComponentInstallation.objects.filter(removed_at__isnull=True),
            to_attr="open_installations",
        ),
    )
    serializer_class = ComponentSerializer
    filterset_class = ComponentFilter

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "today": timezone.localdate()}

    def _component_response(self, pk):
        component = self.get_queryset().get(pk=pk)
        return Response(self.get_serializer(component).data)

    @action(detail=True, methods=["post"])
    def install(self, request, pk=None):
        component = self.get_object()
        params = InstallComponentInputSerializer(data=request.data)
        params.is_valid(raise_exception=True)
        services.install_component(
            component,
            params.validated_data["aircraft"],
            at=params.validated_data.get("installed_at") or timezone.now(),
            position=params.validated_data["position"],
        )
        return self._component_response(component.pk)

    @action(detail=True, methods=["post"])
    def remove(self, request, pk=None):
        component = self.get_object()
        params = RemoveComponentInputSerializer(data=request.data)
        params.is_valid(raise_exception=True)
        services.remove_component(
            component,
            at=params.validated_data.get("removed_at") or timezone.now(),
            reason=params.validated_data["reason"],
        )
        return self._component_response(component.pk)

    @action(detail=True, methods=["post"])
    def retire(self, request, pk=None):
        component = self.get_object()
        services.retire_component(component)
        return self._component_response(component.pk)

    @action(detail=True, methods=["get"])
    def installations(self, request, pk=None):
        component = self.get_object()
        page = self.paginate_queryset(component.installations.all())
        return self.get_paginated_response(ComponentInstallationSerializer(page, many=True).data)
