from django.db.models import ProtectedError
from rest_framework.exceptions import NotFound

from apps.core.exceptions import DomainError, exception_handler


class SampleError(DomainError):
    code = "sample"


def test_domain_error_maps_to_400_with_code():
    response = exception_handler(SampleError("Rule broken."), {})

    assert response.status_code == 400
    assert response.data == {"detail": "Rule broken.", "code": "sample"}


def test_protected_error_maps_to_409():
    response = exception_handler(ProtectedError("in use", set()), {})

    assert response.status_code == 409


def test_other_exceptions_fall_back_to_drf_handler():
    response = exception_handler(NotFound(), {})

    assert response.status_code == 404


def test_unknown_exceptions_are_not_handled():
    assert exception_handler(ValueError("boom"), {}) is None
