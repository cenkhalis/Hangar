from apps.core.exceptions import DomainError


class FlightsError(DomainError):
    code = "flights_error"


class FlightLogNotRejected(FlightsError):
    code = "flight_log_not_rejected"
