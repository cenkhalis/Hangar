import datetime
from decimal import Decimal

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.fleet import services
from apps.fleet.models import Aircraft, Component
from apps.fleet.tests.factories import (
    AircraftFactory,
    AircraftModelFactory,
    ComponentFactory,
    ComponentLifeLimitFactory,
    ComponentTypeFactory,
)

pytestmark = pytest.mark.django_db

BASE = "/api/fleet"


@pytest.fixture
def api():
    return APIClient()


def installed_at(days_ago=10):
    return timezone.now() - datetime.timedelta(days=days_ago)


class TestAircraftModels:
    def test_create_and_list(self, api):
        response = api.post(
            f"{BASE}/aircraft-models/",
            {"manufacturer": "Acme", "name": "Hawk", "category": "fixed_wing"},
            format="json",
        )
        assert response.status_code == 201

        response = api.get(f"{BASE}/aircraft-models/")
        assert response.status_code == 200
        assert response.json()["count"] == 1
        assert response.json()["results"][0]["name"] == "Hawk"

    def test_duplicate_name_is_rejected(self, api):
        AircraftModelFactory(manufacturer="Acme", name="Hawk")

        response = api.post(
            f"{BASE}/aircraft-models/",
            {"manufacturer": "Acme", "name": "Hawk", "category": "fixed_wing"},
            format="json",
        )

        assert response.status_code == 400

    def test_filter_by_category(self, api):
        AircraftModelFactory(category="vtol")
        AircraftModelFactory(category="multirotor")

        response = api.get(f"{BASE}/aircraft-models/", {"category": "vtol"})

        assert [m["category"] for m in response.json()["results"]] == ["vtol"]

    def test_delete_unused_model(self, api):
        model = AircraftModelFactory()

        assert api.delete(f"{BASE}/aircraft-models/{model.pk}/").status_code == 204

    def test_delete_model_in_use_returns_409(self, api):
        aircraft = AircraftFactory()

        response = api.delete(f"{BASE}/aircraft-models/{aircraft.model_id}/")

        assert response.status_code == 409


class TestAircraft:
    def test_create_with_initial_usage(self, api):
        model = AircraftModelFactory()

        response = api.post(
            f"{BASE}/aircraft/",
            {"model": model.pk, "serial_number": "AC-1", "flight_hours": "12.5", "cycles": 30},
            format="json",
        )

        assert response.status_code == 201, response.json()
        body = response.json()
        assert body["flight_hours"] == "12.50"
        assert body["cycles"] == 30
        assert body["status"] == "active"
        assert Aircraft.objects.get(pk=body["id"]).flight_seconds == 45000

    def test_usage_counters_are_read_only_after_creation(self, api):
        aircraft = AircraftFactory()

        response = api.patch(
            f"{BASE}/aircraft/{aircraft.pk}/", {"flight_hours": "99"}, format="json"
        )

        assert response.status_code == 400
        aircraft.refresh_from_db()
        assert aircraft.flight_seconds == 0

    def test_update_status(self, api):
        aircraft = AircraftFactory()

        response = api.patch(
            f"{BASE}/aircraft/{aircraft.pk}/", {"status": "grounded"}, format="json"
        )

        assert response.status_code == 200
        assert response.json()["status"] == "grounded"

    def test_delete_is_not_allowed(self, api):
        aircraft = AircraftFactory()

        assert api.delete(f"{BASE}/aircraft/{aircraft.pk}/").status_code == 405

    def test_unknown_aircraft_returns_404(self, api):
        assert api.get(f"{BASE}/aircraft/999999/").status_code == 404

    def test_filter_by_status(self, api):
        AircraftFactory(status="active")
        AircraftFactory(status="retired")

        response = api.get(f"{BASE}/aircraft/", {"status": "retired"})

        assert [a["status"] for a in response.json()["results"]] == ["retired"]

    def test_airworthiness(self, api):
        aircraft = AircraftFactory()
        component_type = ComponentTypeFactory()
        ComponentLifeLimitFactory(component_type=component_type, value=Decimal("100"))
        component = ComponentFactory(component_type=component_type)
        services.install_component(component, aircraft, at=installed_at(), position="motor-1")
        services.record_aircraft_usage(aircraft, flight_seconds=100 * 3600, cycles=1)

        response = api.get(f"{BASE}/aircraft/{aircraft.pk}/airworthiness/")

        assert response.status_code == 200
        body = response.json()
        assert body["airworthy"] is False
        assert body["state"] == "expired"
        assert body["components"][0]["serial_number"] == component.serial_number
        assert body["components"][0]["position"] == "motor-1"
        assert body["components"][0]["life_status"]["limits"][0]["remaining"] == "0.00"


class TestComponentTypesAndLimits:
    def test_component_type_includes_life_limits(self, api):
        component_type = ComponentTypeFactory()
        ComponentLifeLimitFactory(component_type=component_type, value=Decimal("2.5"))

        response = api.get(f"{BASE}/component-types/{component_type.pk}/")

        limits = response.json()["life_limits"]
        assert len(limits) == 1
        assert limits[0]["value"] == "2.50"
        assert limits[0]["warning_threshold_percent"] == "10.00"

    def test_create_limit_with_fractional_hours_and_custom_threshold(self, api):
        component_type = ComponentTypeFactory()

        response = api.post(
            f"{BASE}/life-limits/",
            {
                "component_type": component_type.pk,
                "limit_type": "flight_hours",
                "value": "2.5",
                "warning_threshold_percent": "25",
            },
            format="json",
        )

        assert response.status_code == 201, response.json()
        assert response.json()["warning_threshold_percent"] == "25.00"

    @pytest.mark.parametrize(
        ("limit_type", "value", "threshold"),
        [
            ("cycles", "2.5", "10"),
            ("calendar_days", "30.5", "10"),
            ("flight_hours", "0", "10"),
            ("flight_hours", "100", "0"),
            ("flight_hours", "100", "100"),
        ],
    )
    def test_invalid_limits_are_rejected(self, api, limit_type, value, threshold):
        response = api.post(
            f"{BASE}/life-limits/",
            {
                "component_type": ComponentTypeFactory().pk,
                "limit_type": limit_type,
                "value": value,
                "warning_threshold_percent": threshold,
            },
            format="json",
        )

        assert response.status_code == 400

    def test_duplicate_limit_type_is_rejected(self, api):
        limit = ComponentLifeLimitFactory()

        response = api.post(
            f"{BASE}/life-limits/",
            {"component_type": limit.component_type_id, "limit_type": "flight_hours", "value": "5"},
            format="json",
        )

        assert response.status_code == 400

    def test_delete_component_type_in_use_returns_409(self, api):
        component = ComponentFactory()

        response = api.delete(f"{BASE}/component-types/{component.component_type_id}/")

        assert response.status_code == 409


class TestComponents:
    def test_create_component(self, api):
        component_type = ComponentTypeFactory()

        response = api.post(
            f"{BASE}/components/",
            {"component_type": component_type.pk, "serial_number": "M-1", "cycles": 5},
            format="json",
        )

        assert response.status_code == 201, response.json()
        body = response.json()
        assert body["status"] == "in_stock"
        assert body["life_status"] == {"state": "untracked", "limits": []}
        assert body["current_installation"] is None

    def test_status_cannot_be_set_directly(self, api):
        component = ComponentFactory()

        api.patch(f"{BASE}/components/{component.pk}/", {"status": "installed"}, format="json")

        component.refresh_from_db()
        assert component.status == Component.Status.IN_STOCK

    def test_life_status_in_payload(self, api):
        component_type = ComponentTypeFactory()
        ComponentLifeLimitFactory(component_type=component_type, value=Decimal("100"))
        component = ComponentFactory(component_type=component_type, flight_seconds=95 * 3600)

        response = api.get(f"{BASE}/components/{component.pk}/")

        status = response.json()["life_status"]
        assert status["state"] == "due_soon"
        assert status["limits"][0] == {
            "limit_type": "flight_hours",
            "limit": "100.00",
            "used": "95.00",
            "remaining": "5.00",
            "percent_used": "95.00",
            "state": "due_soon",
        }

    def test_install_remove_retire_flow(self, api):
        component = ComponentFactory()
        aircraft = AircraftFactory()

        response = api.post(
            f"{BASE}/components/{component.pk}/install/",
            {"aircraft": aircraft.pk, "position": "motor-2"},
            format="json",
        )
        assert response.status_code == 200, response.json()
        assert response.json()["status"] == "installed"
        assert response.json()["current_installation"]["aircraft"] == aircraft.pk
        assert response.json()["current_installation"]["position"] == "motor-2"

        response = api.post(
            f"{BASE}/components/{component.pk}/remove/", {"reason": "inspection"}, format="json"
        )
        assert response.status_code == 200
        assert response.json()["status"] == "in_stock"
        assert response.json()["current_installation"] is None

        response = api.post(f"{BASE}/components/{component.pk}/retire/")
        assert response.status_code == 200
        assert response.json()["status"] == "retired"

        response = api.get(f"{BASE}/components/{component.pk}/installations/")
        history = response.json()["results"]
        assert len(history) == 1
        assert history[0]["removal_reason"] == "inspection"

    def test_install_with_explicit_timestamp(self, api):
        component = ComponentFactory()
        when = "2026-01-15T08:30:00Z"

        response = api.post(
            f"{BASE}/components/{component.pk}/install/",
            {"aircraft": AircraftFactory().pk, "installed_at": when},
            format="json",
        )

        assert response.status_code == 200
        assert response.json()["in_service_date"] == "2026-01-15"

    def test_domain_error_returns_400_with_code(self, api):
        component = ComponentFactory()
        services.install_component(component, AircraftFactory(), at=installed_at())

        response = api.post(
            f"{BASE}/components/{component.pk}/install/",
            {"aircraft": AircraftFactory().pk},
            format="json",
        )

        assert response.status_code == 400
        assert response.json()["code"] == "component_not_installable"

    def test_install_requires_existing_aircraft(self, api):
        component = ComponentFactory()

        response = api.post(
            f"{BASE}/components/{component.pk}/install/", {"aircraft": 999999}, format="json"
        )

        assert response.status_code == 400
        assert "aircraft" in response.json()

    def test_remove_not_installed_returns_400(self, api):
        response = api.post(f"{BASE}/components/{ComponentFactory().pk}/remove/")

        assert response.status_code == 400
        assert response.json()["code"] == "component_not_installed"

    def test_retire_installed_returns_400(self, api):
        component = ComponentFactory()
        services.install_component(component, AircraftFactory(), at=installed_at())

        response = api.post(f"{BASE}/components/{component.pk}/retire/")

        assert response.status_code == 400
        assert response.json()["code"] == "component_installed"

    def test_delete_is_not_allowed(self, api):
        assert api.delete(f"{BASE}/components/{ComponentFactory().pk}/").status_code == 405

    def test_filter_by_current_aircraft(self, api):
        aircraft = AircraftFactory()
        on_aircraft = ComponentFactory()
        removed = ComponentFactory()
        ComponentFactory()
        services.install_component(on_aircraft, aircraft, at=installed_at(5))
        services.install_component(removed, aircraft, at=installed_at(5))
        services.remove_component(removed, at=installed_at(1))

        response = api.get(f"{BASE}/components/", {"aircraft": aircraft.pk})

        assert [c["id"] for c in response.json()["results"]] == [on_aircraft.pk]

    def test_filter_by_status(self, api):
        ComponentFactory(status=Component.Status.RETIRED)
        ComponentFactory()

        response = api.get(f"{BASE}/components/", {"status": "retired"})

        assert [c["status"] for c in response.json()["results"]] == ["retired"]

    def test_list_query_count_does_not_grow_with_rows(self, api, django_assert_max_num_queries):
        component_type = ComponentTypeFactory()
        ComponentLifeLimitFactory(component_type=component_type)
        aircraft = AircraftFactory()
        for i in range(10):
            component = ComponentFactory(component_type=component_type)
            services.install_component(component, aircraft, at=installed_at(), position=f"p{i}")

        # count + components + life limits + open installations
        with django_assert_max_num_queries(4):
            response = api.get(f"{BASE}/components/")

        assert len(response.json()["results"]) == 10

    def test_pagination(self, api):
        ComponentFactory.create_batch(55)

        body = api.get(f"{BASE}/components/").json()

        assert body["count"] == 55
        assert len(body["results"]) == 50
        assert body["next"] is not None
