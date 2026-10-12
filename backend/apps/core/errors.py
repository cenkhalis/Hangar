"""Registry of domain error codes, exported to contracts/ for the frontend."""

from importlib import import_module

from django.apps import apps

from .exceptions import DomainError


def _load_exception_modules() -> None:
    for config in apps.get_app_configs():
        try:
            import_module(f"{config.name}.exceptions")
        except ModuleNotFoundError as exc:
            if exc.name != f"{config.name}.exceptions":
                raise


def domain_error_codes() -> dict[str, list[str]]:
    """Map each domain error code to the exception classes that raise it."""
    _load_exception_modules()
    codes: dict[str, list[str]] = {}
    pending = list(DomainError.__subclasses__())
    while pending:
        cls = pending.pop()
        pending.extend(cls.__subclasses__())
        if cls.__module__.startswith("apps.") and cls.__module__.endswith(".exceptions"):
            codes.setdefault(cls.code, []).append(f"{cls.__module__}.{cls.__name__}")
    return {code: sorted(names) for code, names in sorted(codes.items())}
