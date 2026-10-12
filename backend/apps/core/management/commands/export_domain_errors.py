import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.core.errors import domain_error_codes

DEFAULT_PATH = Path(settings.BASE_DIR).parent / "contracts" / "errors" / "domain-errors.json"


def render() -> str:
    return json.dumps({"codes": domain_error_codes()}, indent=2) + "\n"


class Command(BaseCommand):
    help = "Write the domain error code registry used by the frontend's error messages."

    def add_arguments(self, parser):
        parser.add_argument("--file", default=str(DEFAULT_PATH))

    def handle(self, *args, **options):
        path = Path(options["file"])
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(render())
        self.stdout.write(f"Wrote {path}")
