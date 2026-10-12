from decimal import Decimal

import factory

from apps.fleet.tests.factories import AircraftFactory, AircraftModelFactory
from apps.maintenance.models import (
    InspectionInterval,
    MaintenanceProgram,
    MaintenanceTask,
    TaskCompletion,
    WorkOrder,
)


class MaintenanceProgramFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = MaintenanceProgram

    aircraft_model = factory.SubFactory(AircraftModelFactory)
    name = factory.Sequence(lambda n: f"Program {n}")


class MaintenanceTaskFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = MaintenanceTask

    program = factory.SubFactory(MaintenanceProgramFactory)
    code = factory.Sequence(lambda n: f"TASK-{n:03d}")
    title = "Airframe inspection"


class InspectionIntervalFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = InspectionInterval

    task = factory.SubFactory(MaintenanceTaskFactory)
    interval_type = InspectionInterval.IntervalType.FLIGHT_HOURS
    value = Decimal("50")


class WorkOrderFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = WorkOrder

    aircraft = factory.SubFactory(AircraftFactory)
    title = "Scheduled maintenance"


class TaskCompletionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = TaskCompletion

    aircraft = factory.SubFactory(AircraftFactory)
    task = factory.SubFactory(MaintenanceTaskFactory)
    kind = TaskCompletion.Kind.HISTORICAL
    performed_by = "A. Technician"
