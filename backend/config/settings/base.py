"""Base settings shared by all environments."""

from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR.parent / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=[])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "rest_framework",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "apps.core",
    "apps.fleet",
    "apps.flights",
    "apps.maintenance",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB", default="hangar"),
        "USER": env("POSTGRES_USER", default="hangar"),
        "PASSWORD": env("POSTGRES_PASSWORD", default="hangar"),
        "HOST": env("POSTGRES_HOST", default="localhost"),
        "PORT": env.int("POSTGRES_PORT", default=5432),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
    "EXCEPTION_HANDLER": "apps.core.exceptions.exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "HANGAR API",
    "DESCRIPTION": "UAV fleet, flight log, and maintenance management.",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
    # Separate request/response components so read-only and defaulted fields are required in
    # responses (accurate generated types) but optional in requests.
    "COMPONENT_SPLIT_REQUEST": True,
    "POSTPROCESSING_HOOKS": [
        "drf_spectacular.hooks.postprocess_schema_enums",
        "apps.core.schema.require_all_response_fields",
    ],
    # Name enums after their field so generated TypeScript types are readable.
    "ENUM_NAME_OVERRIDES": {
        "AircraftStatusEnum": "apps.fleet.models.Aircraft.Status",
        "ComponentStatusEnum": "apps.fleet.models.Component.Status",
        "WorkOrderStatusEnum": "apps.maintenance.models.WorkOrder.Status",
        "WorkOrderItemStatusEnum": "apps.maintenance.models.WorkOrderItem.Status",
        "FlightLogStatusEnum": "apps.flights.models.FlightLog.Status",
        # Life limits and inspection intervals share the hours/cycles/days choice set.
        "UsageUnitEnum": "apps.fleet.models.ComponentLifeLimit.LimitType",
        # Mirrors fleet.services.LifeState / maintenance.services.DueState (settings cannot import
        # app modules); test_openapi_schema fails if these drift.
        "LifeStateEnum": [
            (s, s) for s in ("untracked", "not_started", "ok", "due_soon", "expired")
        ],
        "DueStateEnum": [(s, s) for s in ("untracked", "not_started", "ok", "due_soon", "overdue")],
        "HealthStateEnum": [("ok", "ok"), ("unavailable", "unavailable")],
        "AircraftModelCategoryEnum": "apps.fleet.models.AircraftModel.Category",
        "ComponentTypeCategoryEnum": "apps.fleet.models.ComponentType.Category",
    },
}

REDIS_URL = env("REDIS_URL", default="redis://localhost:6379/0")

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
