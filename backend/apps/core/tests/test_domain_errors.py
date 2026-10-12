from apps.core.errors import domain_error_codes
from apps.core.management.commands.export_domain_errors import DEFAULT_PATH, render


def test_registry_collects_codes_from_every_app():
    codes = domain_error_codes()

    assert "apps.fleet.exceptions.PositionOccupied" in codes["position_occupied"]
    assert "apps.flights.exceptions.FlightLogNotRejected" in codes["flight_log_not_rejected"]
    assert "apps.maintenance.exceptions.DuplicateOpenTask" in codes["duplicate_open_task"]
    # One code may be shared by several apps.
    assert len(codes["invalid_timestamp"]) == 2


def test_committed_registry_is_up_to_date():
    assert DEFAULT_PATH.read_text() == render(), (
        "contracts/errors/domain-errors.json is stale. Run `make schema` and commit the result."
    )
