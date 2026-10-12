import datetime

import pytest
from django.utils import timezone

from apps.maintenance import services
from apps.maintenance.exceptions import (
    CompletionAlreadyVoided,
    InvalidTimestamp,
    MissingPerformer,
    MissingReason,
    TaskNotInProgram,
)
from apps.maintenance.models import TaskCompletion

from .conftest import HOURS, add_task, at
from .factories import MaintenanceProgramFactory

pytestmark = pytest.mark.django_db


def test_historical_completion(aircraft, program):
    task = add_task(program, (HOURS, 50))

    completion = services.record_historical_completion(
        aircraft, task, performed_at=at(2025, 12, 1), performed_by="Previous operator"
    )

    assert completion.kind == TaskCompletion.Kind.HISTORICAL
    assert completion.work_order_item is None


@pytest.mark.parametrize(
    ("scenario", "error"),
    [
        ("other program", TaskNotInProgram),
        ("future", InvalidTimestamp),
        ("no performer", MissingPerformer),
    ],
)
def test_historical_completion_rejections(aircraft, program, scenario, error):
    task = add_task(program, (HOURS, 50))
    performed_at, performer = at(2025, 12, 1), "Tech"
    if scenario == "other program":
        task = add_task(MaintenanceProgramFactory(), (HOURS, 50))
    elif scenario == "future":
        performed_at = timezone.now() + datetime.timedelta(days=1)
    elif scenario == "no performer":
        performer = ""

    with pytest.raises(error):
        services.record_historical_completion(
            aircraft, task, performed_at=performed_at, performed_by=performer
        )

    assert not TaskCompletion.objects.exists()


def test_historical_completion_for_inactive_task_is_allowed(aircraft, program):
    task = add_task(program, (HOURS, 50), is_active=False)

    services.record_historical_completion(
        aircraft, task, performed_at=at(2025, 12, 1), performed_by="Tech"
    )


def test_void_keeps_record_in_history(aircraft, program):
    task = add_task(program, (HOURS, 50))
    completion = services.record_historical_completion(
        aircraft, task, performed_at=at(2025, 12, 1), performed_by="Tech"
    )

    services.void_completion(completion, reason=" Entered against wrong task ")

    completion.refresh_from_db()
    assert completion.voided_at is not None
    assert completion.void_reason == "Entered against wrong task"
    assert TaskCompletion.objects.count() == 1


def test_void_requires_reason(aircraft, program):
    completion = services.record_historical_completion(
        aircraft, add_task(program), performed_at=at(2025, 12, 1), performed_by="Tech"
    )

    with pytest.raises(MissingReason):
        services.void_completion(completion, reason="")

    completion.refresh_from_db()
    assert completion.voided_at is None


def test_void_twice_is_rejected(aircraft, program):
    completion = services.record_historical_completion(
        aircraft, add_task(program), performed_at=at(2025, 12, 1), performed_by="Tech"
    )
    services.void_completion(completion, reason="Mistake")

    with pytest.raises(CompletionAlreadyVoided):
        services.void_completion(completion, reason="Again")
