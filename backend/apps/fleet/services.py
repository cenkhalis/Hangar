"""Fleet domain logic: usage tracking, component installation, and life-limit evaluation."""

from __future__ import annotations

import datetime
from collections.abc import Iterable
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum

from django.db import transaction
from django.db.models import F

from .exceptions import (
    AircraftRetired,
    ComponentInstalled,
    ComponentNotInstallable,
    ComponentNotInstalled,
    InvalidTimestamp,
    InvalidUsage,
    PositionOccupied,
)
from .models import Aircraft, Component, ComponentInstallation, ComponentLifeLimit

SECONDS_PER_HOUR = Decimal(3600)

LimitType = ComponentLifeLimit.LimitType


# --- Unit conversion -------------------------------------------------------------------------


def seconds_to_hours(seconds: int) -> Decimal:
    return Decimal(seconds) / SECONDS_PER_HOUR


def hours_to_seconds(hours: Decimal) -> int:
    return int((hours * SECONDS_PER_HOUR).to_integral_value(rounding=ROUND_HALF_UP))


# --- Life-limit evaluation (pure) ------------------------------------------------------------


class LifeState(StrEnum):
    OK = "ok"
    DUE_SOON = "due_soon"
    EXPIRED = "expired"
    NOT_STARTED = "not_started"
    UNTRACKED = "untracked"


# Higher rank means more severe; used to pick the overall state across limits.
_SEVERITY = {
    LifeState.UNTRACKED: 0,
    LifeState.NOT_STARTED: 1,
    LifeState.OK: 2,
    LifeState.DUE_SOON: 3,
    LifeState.EXPIRED: 4,
}


@dataclass(frozen=True)
class LimitStatus:
    limit_type: str
    limit: Decimal
    used: Decimal | None
    remaining: Decimal | None
    percent_used: Decimal | None
    state: LifeState


def evaluate_limit(
    limit_type: str, limit: Decimal, used: Decimal, *, warning_threshold_percent: Decimal
) -> LimitStatus:
    """Classify usage against a single limit expressed in the same unit as ``used``."""
    if limit <= 0:
        raise ValueError("limit must be positive")
    remaining = limit - used
    if used >= limit:
        state = LifeState.EXPIRED
    elif remaining <= limit * warning_threshold_percent / 100:
        state = LifeState.DUE_SOON
    else:
        state = LifeState.OK
    return LimitStatus(
        limit_type=limit_type,
        limit=limit,
        used=used,
        remaining=remaining,
        percent_used=used / limit * 100,
        state=state,
    )


def worst_state(states: Iterable[LifeState]) -> LifeState:
    return max(states, key=_SEVERITY.__getitem__, default=LifeState.UNTRACKED)


# --- Life status queries ---------------------------------------------------------------------


@dataclass(frozen=True)
class ComponentLifeStatus:
    state: LifeState
    limits: list[LimitStatus]


def _usage_for(component: Component, limit_type: str, today: datetime.date) -> Decimal | None:
    if limit_type == LimitType.FLIGHT_HOURS:
        return seconds_to_hours(component.flight_seconds)
    if limit_type == LimitType.CYCLES:
        return Decimal(component.cycles)
    if limit_type == LimitType.CALENDAR_DAYS:
        if component.in_service_date is None:
            return None
        return Decimal((today - component.in_service_date).days)
    raise ValueError(f"Unknown limit type: {limit_type}")


def get_component_life_status(component: Component, *, today: datetime.date) -> ComponentLifeStatus:
    """Evaluate every life limit of the component's type; the most severe state wins."""
    statuses = []
    for limit in component.component_type.life_limits.all():
        used = _usage_for(component, limit.limit_type, today)
        if used is None:
            statuses.append(
                LimitStatus(
                    limit_type=limit.limit_type,
                    limit=limit.value,
                    used=None,
                    remaining=None,
                    percent_used=None,
                    state=LifeState.NOT_STARTED,
                )
            )
        else:
            statuses.append(
                evaluate_limit(
                    limit.limit_type,
                    limit.value,
                    used,
                    warning_threshold_percent=limit.warning_threshold_percent,
                )
            )
    return ComponentLifeStatus(state=worst_state(s.state for s in statuses), limits=statuses)


@dataclass(frozen=True)
class InstalledComponentStatus:
    installation: ComponentInstallation
    life_status: ComponentLifeStatus


@dataclass(frozen=True)
class AirworthinessReport:
    airworthy: bool
    state: LifeState
    components: list[InstalledComponentStatus]


def installed_components_queryset(aircraft: Aircraft):
    return (
        ComponentInstallation.objects.filter(aircraft=aircraft, removed_at__isnull=True)
        .select_related("component__component_type")
        .prefetch_related("component__component_type__life_limits")
        .order_by("position", "component__serial_number")
    )


def get_aircraft_airworthiness(aircraft: Aircraft, *, today: datetime.date) -> AirworthinessReport:
    """Report the life status of every installed component. Never modifies aircraft status."""
    components = [
        InstalledComponentStatus(
            installation=installation,
            life_status=get_component_life_status(installation.component, today=today),
        )
        for installation in installed_components_queryset(aircraft)
    ]
    state = worst_state(c.life_status.state for c in components)
    return AirworthinessReport(
        airworthy=state != LifeState.EXPIRED, state=state, components=components
    )


# --- Commands --------------------------------------------------------------------------------


@transaction.atomic
def record_aircraft_usage(aircraft: Aircraft, *, flight_seconds: int, cycles: int) -> Aircraft:
    """Add usage to the aircraft and to every component currently installed on it."""
    if flight_seconds < 0 or cycles < 0:
        raise InvalidUsage("Usage values cannot be negative.")
    if flight_seconds == 0 and cycles == 0:
        raise InvalidUsage("Usage must include flight time or cycles.")

    locked = Aircraft.objects.select_for_update().get(pk=aircraft.pk)
    if locked.status == Aircraft.Status.RETIRED:
        raise AircraftRetired(f"Aircraft {locked} is retired.")

    increments = {
        "flight_seconds": F("flight_seconds") + flight_seconds,
        "cycles": F("cycles") + cycles,
    }
    Aircraft.objects.filter(pk=locked.pk).update(**increments)
    installed_ids = ComponentInstallation.objects.filter(
        aircraft=locked, removed_at__isnull=True
    ).values("component_id")
    Component.objects.filter(pk__in=installed_ids).update(**increments)

    aircraft.refresh_from_db(fields=["flight_seconds", "cycles"])
    return aircraft


@transaction.atomic
def install_component(
    component: Component, aircraft: Aircraft, *, at: datetime.datetime, position: str = ""
) -> ComponentInstallation:
    component = (
        Component.objects.select_for_update().select_related("component_type").get(pk=component.pk)
    )
    aircraft = Aircraft.objects.select_for_update().get(pk=aircraft.pk)

    if aircraft.status == Aircraft.Status.RETIRED:
        raise AircraftRetired(f"Aircraft {aircraft} is retired.")
    if component.status == Component.Status.RETIRED:
        raise ComponentNotInstallable(f"Component {component} is retired.")
    if component.status == Component.Status.INSTALLED:
        raise ComponentNotInstallable(f"Component {component} is already installed.")

    last_removal = (
        component.installations.filter(removed_at__isnull=False)
        .order_by("-removed_at")
        .values_list("removed_at", flat=True)
        .first()
    )
    if last_removal is not None and at < last_removal:
        raise InvalidTimestamp("Installation time cannot precede the component's last removal.")

    if component.in_service_date is None:
        component.in_service_date = at.date()
    life = get_component_life_status(component, today=at.date())
    if life.state == LifeState.EXPIRED:
        raise ComponentNotInstallable(f"Component {component} has exceeded a life limit.")

    if (
        position
        and ComponentInstallation.objects.filter(
            aircraft=aircraft, position=position, removed_at__isnull=True
        ).exists()
    ):
        raise PositionOccupied(f"Position {position!r} on {aircraft} is already occupied.")

    component.status = Component.Status.INSTALLED
    component.save(update_fields=["status", "in_service_date"])
    return ComponentInstallation.objects.create(
        component=component, aircraft=aircraft, position=position, installed_at=at
    )


@transaction.atomic
def remove_component(
    component: Component, *, at: datetime.datetime, reason: str = ""
) -> ComponentInstallation:
    component = Component.objects.select_for_update().get(pk=component.pk)
    installation = component.installations.filter(removed_at__isnull=True).first()
    if installation is None:
        raise ComponentNotInstalled(f"Component {component} is not installed.")
    if at < installation.installed_at:
        raise InvalidTimestamp("Removal time cannot precede installation time.")

    installation.removed_at = at
    installation.removal_reason = reason
    installation.save(update_fields=["removed_at", "removal_reason"])
    component.status = Component.Status.IN_STOCK
    component.save(update_fields=["status"])
    return installation


@transaction.atomic
def retire_component(component: Component) -> Component:
    component = Component.objects.select_for_update().get(pk=component.pk)
    if component.status == Component.Status.INSTALLED:
        raise ComponentInstalled(f"Remove component {component} before retiring it.")
    component.status = Component.Status.RETIRED
    component.save(update_fields=["status"])
    return component
