"""The committed OpenAPI schema drives the frontend's generated types; it must match the code."""

from io import StringIO
from pathlib import Path

from django.conf import settings
from django.core.management import call_command

SCHEMA_PATH = Path(settings.BASE_DIR).parent / "contracts" / "openapi" / "hangar.yaml"


def test_committed_schema_is_up_to_date():
    generated = StringIO()
    call_command("spectacular", "--validate", "--fail-on-warn", stdout=generated)

    assert generated.getvalue() == SCHEMA_PATH.read_text(), (
        "contracts/openapi/hangar.yaml is stale. Run `make schema` and commit the result."
    )
