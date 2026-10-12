from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from . import services
from .filters import FlightFilter
from .models import Flight, FlightLog
from .serializers import FlightLogSerializer, FlightSerializer


class FlightViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Flight.objects.select_related("aircraft")
    serializer_class = FlightSerializer
    filterset_class = FlightFilter


class FlightLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = FlightLog.objects.select_related("flight")
    serializer_class = FlightLogSerializer
    filterset_fields = ["status", "rejection_code"]

    @extend_schema(request=None, responses=FlightLogSerializer)
    @action(detail=True, methods=["post"])
    def reprocess(self, request, pk=None):
        result = services.reprocess_flight_log(self.get_object())
        return Response(FlightLogSerializer(self.get_queryset().get(pk=result.log.pk)).data)
