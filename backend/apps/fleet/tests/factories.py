import datetime
from decimal import Decimal

import factory
from django.utils import timezone

from apps.fleet.models import (
    Aircraft,
    AircraftModel,
    Component,
    ComponentInstallation,
    ComponentLifeLimit,
    ComponentType,
)


class AircraftModelFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = AircraftModel

    manufacturer = "Acme UAS"
    name = factory.Sequence(lambda n: f"Falcon-{n}")
    category = AircraftModel.Category.MULTIROTOR


class AircraftFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Aircraft

    model = factory.SubFactory(AircraftModelFactory)
    serial_number = factory.Sequence(lambda n: f"AC-{n:05d}")


class ComponentTypeFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ComponentType

    part_number = factory.Sequence(lambda n: f"PN-{n:05d}")
    name = "Brushless motor"
    category = ComponentType.Category.MOTOR


class ComponentLifeLimitFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ComponentLifeLimit

    component_type = factory.SubFactory(ComponentTypeFactory)
    limit_type = ComponentLifeLimit.LimitType.FLIGHT_HOURS
    value = Decimal("100.00")


class ComponentFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Component

    component_type = factory.SubFactory(ComponentTypeFactory)
    serial_number = factory.Sequence(lambda n: f"SN-{n:05d}")


class ComponentInstallationFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = ComponentInstallation

    component = factory.SubFactory(ComponentFactory, status=Component.Status.INSTALLED)
    aircraft = factory.SubFactory(AircraftFactory)
    installed_at = factory.LazyFunction(
        lambda: timezone.make_aware(datetime.datetime(2026, 1, 1, 12, 0))
    )
