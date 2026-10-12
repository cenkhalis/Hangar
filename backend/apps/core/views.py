from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services


class HealthView(APIView):
    authentication_classes: list = []
    permission_classes: list = []

    @extend_schema(
        responses=inline_serializer(
            "Health",
            {
                "status": serializers.ChoiceField(choices=["ok", "unavailable"]),
                "checks": inline_serializer(
                    "HealthChecks",
                    {"database": serializers.ChoiceField(choices=["ok", "unavailable"])},
                ),
            },
        )
    )
    def get(self, request: Request) -> Response:
        health = services.get_health_status()
        return Response(
            {
                "status": "ok" if health.healthy else "unavailable",
                "checks": {"database": "ok" if health.database else "unavailable"},
            },
            status=status.HTTP_200_OK if health.healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
        )
