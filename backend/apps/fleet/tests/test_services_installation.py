import datetime
from decimal import Decimal

import pytest

from apps.fleet import services
from apps.fleet.exceptions import (
    AircraftRetired,
    ComponentInstalled,
    ComponentNotInstallable,
    ComponentNotInstalled,
    InvalidTimestamp,
    PositionOccupied,
)
from apps.fleet.models import Aircraft, Component, ComponentInstallation, ComponentLifeLimit
from apps.fleet.tests.factories import (
    AircraftFactory,
    ComponentFactory,
    ComponentLifeLimitFactory,
)

pytestmark = pytest.mark.django_db

DAY = datetime.timedelta(days=1)


def assert_nothing_installed(component):
    component.refresh_from_db()
    assert component.status != Component.Status.INSTALLED
    assert not ComponentInstallation.objects.filter(component=component).exists()


class TestInstall:
    def test_install_creates_open_installation(self, t0):
        aircraft = AircraftFactory()
        component = ComponentFactory()

        installation = services.install_component(component, aircraft, at=t0, position="motor-1")

        component.refresh_from_db()
        assert installation.aircraft == aircraft
        assert installation.position == "motor-1"
        assert installation.installed_at == t0
        assert installation.removed_at is None
        assert component.status == Component.Status.INSTALLED

    def test_first_install_sets_in_service_date(self, t0):
        component = ComponentFactory(in_service_date=None)

        services.install_component(component, AircraftFactory(), at=t0)

        component.refresh_from_db()
        assert component.in_service_date == t0.date()

    def test_existing_in_service_date_is_kept(self, t0):
        original = datetime.date(2025, 1, 1)
        component = ComponentFactory(in_service_date=original)

        services.install_component(component, AircraftFactory(), at=t0)

        component.refresh_from_db()
        assert component.in_service_date == original

    def test_already_installed_component_is_rejected(self, t0):
        component = ComponentFactory()
        services.install_component(component, AircraftFactory(), at=t0)

        with pytest.raises(ComponentNotInstallable):
            services.install_component(component, AircraftFactory(), at=t0)

        assert ComponentInstallation.objects.filter(component=component).count() == 1

    def test_retired_component_is_rejected(self, t0):
        component = ComponentFactory(status=Component.Status.RETIRED)

        with pytest.raises(ComponentNotInstallable):
            services.install_component(component, AircraftFactory(), at=t0)

        assert_nothing_installed(component)

    def test_expired_component_is_rejected(self, t0):
        component = ComponentFactory(flight_seconds=100 * 3600)
        ComponentLifeLimitFactory(component_type=component.component_type, value=Decimal("100"))

        with pytest.raises(ComponentNotInstallable, match="life limit"):
            services.install_component(component, AircraftFactory(), at=t0)

        assert_nothing_installed(component)
        assert component.in_service_date is None

    def test_calendar_expiry_is_evaluated_at_install_time(self, t0):
        component = ComponentFactory(in_service_date=t0.date() - 30 * DAY)
        ComponentLifeLimitFactory(
            component_type=component.component_type,
            limit_type=ComponentLifeLimit.LimitType.CALENDAR_DAYS,
            value=Decimal("30"),
        )

        with pytest.raises(ComponentNotInstallable):
            services.install_component(component, AircraftFactory(), at=t0)

    def test_due_soon_component_can_be_installed(self, t0):
        component = ComponentFactory(flight_seconds=95 * 3600)
        ComponentLifeLimitFactory(component_type=component.component_type, value=Decimal("100"))

        services.install_component(component, AircraftFactory(), at=t0)

        component.refresh_from_db()
        assert component.status == Component.Status.INSTALLED

    def test_retired_aircraft_is_rejected(self, t0):
        component = ComponentFactory()

        with pytest.raises(AircraftRetired):
            services.install_component(
                component, AircraftFactory(status=Aircraft.Status.RETIRED), at=t0
            )

        assert_nothing_installed(component)

    def test_occupied_position_is_rejected(self, t0):
        aircraft = AircraftFactory()
        services.install_component(ComponentFactory(), aircraft, at=t0, position="motor-1")
        component = ComponentFactory()

        with pytest.raises(PositionOccupied):
            services.install_component(component, aircraft, at=t0, position="motor-1")

        assert_nothing_installed(component)

    def test_same_position_on_another_aircraft_is_allowed(self, t0):
        services.install_component(ComponentFactory(), AircraftFactory(), at=t0, position="motor-1")

        services.install_component(ComponentFactory(), AircraftFactory(), at=t0, position="motor-1")

    def test_blank_positions_do_not_conflict(self, t0):
        aircraft = AircraftFactory()

        services.install_component(ComponentFactory(), aircraft, at=t0)
        services.install_component(ComponentFactory(), aircraft, at=t0)

        assert aircraft.installations.filter(removed_at__isnull=True).count() == 2

    def test_position_is_free_after_removal(self, t0):
        aircraft = AircraftFactory()
        first = ComponentFactory()
        services.install_component(first, aircraft, at=t0, position="motor-1")
        services.remove_component(first, at=t0 + DAY)

        services.install_component(ComponentFactory(), aircraft, at=t0 + DAY, position="motor-1")

    def test_install_before_last_removal_is_rejected(self, t0):
        component = ComponentFactory()
        services.install_component(component, AircraftFactory(), at=t0)
        services.remove_component(component, at=t0 + 2 * DAY)

        with pytest.raises(InvalidTimestamp):
            services.install_component(component, AircraftFactory(), at=t0 + DAY)


class TestRemove:
    def test_remove_closes_installation(self, t0):
        component = ComponentFactory()
        services.install_component(component, AircraftFactory(), at=t0)

        installation = services.remove_component(component, at=t0 + DAY, reason="vibration")

        component.refresh_from_db()
        assert installation.removed_at == t0 + DAY
        assert installation.removal_reason == "vibration"
        assert component.status == Component.Status.IN_STOCK

    def test_remove_uninstalled_component_is_rejected(self, t0):
        with pytest.raises(ComponentNotInstalled):
            services.remove_component(ComponentFactory(), at=t0)

    def test_remove_before_installation_is_rejected(self, t0):
        component = ComponentFactory()
        services.install_component(component, AircraftFactory(), at=t0)

        with pytest.raises(InvalidTimestamp):
            services.remove_component(component, at=t0 - DAY)

        component.refresh_from_db()
        assert component.status == Component.Status.INSTALLED

    def test_removed_component_can_be_reinstalled_elsewhere(self, t0):
        component = ComponentFactory()
        services.install_component(component, AircraftFactory(), at=t0)
        services.remove_component(component, at=t0 + DAY)
        aircraft_b = AircraftFactory()

        services.install_component(component, aircraft_b, at=t0 + DAY)

        assert component.installations.count() == 2
        assert component.installations.get(removed_at__isnull=True).aircraft == aircraft_b


class TestRetire:
    def test_retire_stock_component(self):
        component = ComponentFactory()

        services.retire_component(component)

        component.refresh_from_db()
        assert component.status == Component.Status.RETIRED

    def test_retire_installed_component_is_rejected(self, t0):
        component = ComponentFactory()
        services.install_component(component, AircraftFactory(), at=t0)

        with pytest.raises(ComponentInstalled):
            services.retire_component(component)

        component.refresh_from_db()
        assert component.status == Component.Status.INSTALLED
