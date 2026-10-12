"""Domain error base class and the DRF exception handler that maps it to HTTP responses."""

from django.db.models import ProtectedError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler


class DomainError(Exception):
    """A business rule violation raised by a service. Rendered as HTTP 400."""

    code = "domain_error"


def exception_handler(exc, context):
    if isinstance(exc, DomainError):
        return Response({"detail": str(exc), "code": exc.code}, status=status.HTTP_400_BAD_REQUEST)
    if isinstance(exc, ProtectedError):
        return Response(
            {"detail": "This object is referenced by other records and cannot be deleted."},
            status=status.HTTP_409_CONFLICT,
        )
    return drf_exception_handler(exc, context)
