from apps.core.exceptions import DomainError


class FleetError(DomainError):
    code = "fleet_error"


class InvalidUsage(FleetError):
    code = "invalid_usage"


class AircraftRetired(FleetError):
    code = "aircraft_retired"


class ComponentNotInstallable(FleetError):
    code = "component_not_installable"


class ComponentNotInstalled(FleetError):
    code = "component_not_installed"


class ComponentInstalled(FleetError):
    code = "component_installed"


class PositionOccupied(FleetError):
    code = "position_occupied"


class InvalidTimestamp(FleetError):
    code = "invalid_timestamp"
