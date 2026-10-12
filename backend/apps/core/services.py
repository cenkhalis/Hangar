"""Infrastructure health checks."""

from dataclasses import dataclass

from django.db import DatabaseError, connections


@dataclass(frozen=True)
class HealthStatus:
    database: bool

    @property
    def healthy(self) -> bool:
        return self.database


def check_database(alias: str = "default") -> bool:
    """Return True if the given database connection can execute a query."""
    try:
        with connections[alias].cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except DatabaseError:
        return False
    return True


def get_health_status() -> HealthStatus:
    return HealthStatus(database=check_database())
