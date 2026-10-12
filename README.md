# HANGAR

**Modular UAV fleet operations, telemetry ingestion and maintenance management platform.**

HANGAR tracks a fleet of unmanned aircraft and their installed components. It ingests flight logs,
turns them into flights and usage counters, and schedules maintenance from flight hours, cycles and
calendar intervals. All flight data is simulated.

---

## Contents

- [Architecture](#architecture)
- [Key features](#key-features)
- [API contracts](#api-contracts)
- [Quickstart](#quickstart)
- [Testing and quality](#testing-and-quality)
- [Repository layout](#repository-layout)

---

## Architecture

HANGAR has three services that share PostgreSQL and Redis:

| Service | Stack | Responsibility |
|---|---|---|
| **ingest** | Go | Polls the flight log inbox, parses and validates CSV/JSON logs, builds a flight summary and publishes it to Redis |
| **backend** | Python 3.12, Django 5, DRF | Domain core: fleet, flights, maintenance and work orders. Serves the REST API |
| **flights-consumer** | Same image as backend | Runs `manage.py consume_flight_logs` to turn stream messages into flights and usage updates |
| **frontend** | Next.js 16 (App Router), React 19, TypeScript | Operations UI: dashboard, fleet, flights, maintenance due board, work orders |
| **postgres** | PostgreSQL 16 | System of record |
| **redis** | Redis 7 | Message bus (Redis Streams) between ingest and backend |

```text
                     var/flight-logs/
   simulate ──▶  inbox/ ─▶ processing/ ─┬─▶ processed/
   (Go CLI)                             └─▶ failed/
                           │
                           ▼
              ┌─────────────────────────┐
              │      ingest (Go)        │  parse ─▶ validate ─▶ summarize ─▶ publish
              │  worker pool, SHA-256   │  log_id = SHA-256 of raw file bytes
              └────────────┬────────────┘
                           │ XADD
                           ▼
              ┌─────────────────────────┐
              │   Redis Stream          │  hangar:flight-logs:v1
              │   group: django-flights │  dead letters ─▶ hangar:flight-logs:v1:dlq
              └────────────┬────────────┘
                           │ XREADGROUP (at-least-once)
                           ▼
              ┌─────────────────────────┐        ┌──────────────┐
              │ flights-consumer        │───────▶│              │
              │ process_flight_log()    │        │  PostgreSQL  │
              └─────────────────────────┘        │              │
              ┌─────────────────────────┐        │              │
              │ backend (Django + DRF)  │◀──────▶│              │
              │ fleet · flights ·       │        └──────────────┘
              │ maintenance · core      │
              └────────────┬────────────┘
                           │ REST /api/*  (OpenAPI typed)
                           ▼
              ┌─────────────────────────┐
              │ frontend (Next.js 16)   │  TanStack Query · TanStack Table
              │ operations dashboard    │  Tailwind CSS · shadcn/ui
              └─────────────────────────┘
```

### Flight log pipeline

1. A CSV or JSON log is dropped into `var/flight-logs/inbox/`. The ingest service waits for the file
   to settle, then claims it by moving it to `processing/`.
2. A worker parses the samples as a stream, validates them (schema, a single contiguous airborne
   segment, one aircraft serial) and computes a summary: takeoff and landing times, distance,
   maximum altitude and speed, and battery start and end.
3. The summary is published to the `hangar:flight-logs:v1` stream. The file is archived to
   `processed/`, or to `failed/` if it is rejected.
4. The Django consumer calls `flights.services.process_flight_log()`, which records a `FlightLog`,
   creates a `Flight` and adds flight time and cycles to the aircraft and its installed components.

Delivery is **at least once**. The consumer is idempotent on `log_id`: a redelivered or re-dropped
file only increments `duplicate_count` on the existing log, so usage is never counted twice.

### Backend domain apps

Business logic lives in each app's `services.py`. Views and serializers stay thin.

| App | Models |
|---|---|
| `fleet` | `AircraftModel`, `Aircraft`, `ComponentType`, `ComponentLifeLimit`, `Component`, `ComponentInstallation` |
| `flights` | `FlightLog` (accepted, rejected or duplicate), `Flight` |
| `maintenance` | `MaintenanceProgram`, `MaintenanceTask`, `InspectionInterval`, `WorkOrder`, `WorkOrderItem`, `TaskCompletion` |
| `core` | Health check, pagination, domain error registry, schema tooling |

---

## Key features

### Fleet and component life limits
- Aircraft models, aircraft (with status and in-service date) and serialized components.
- Component installation history with position, install and removal times, and a removal reason.
- Life limits per component type in flight hours, cycles or calendar days, each with a configurable
  warning threshold.

### Flight telemetry ingestion
- Concurrent Go worker pool with streaming CSV/JSON parsing and SHA-256 content-addressed log IDs.
- Explicit inbox lifecycle (`inbox → processing → processed | failed`) and graceful shutdown.
- Accepted flights automatically update aircraft and installed component usage counters
  (flight seconds and cycles).
- Rejected logs are kept with a rejection code and detail so they can be audited.

### Maintenance scheduling
- A maintenance program per aircraft model, made up of tasks with one or more resetting intervals:
  **flight hours**, **cycles** or **calendar days**.
- A due board computes the remaining interval from the last sign-off and classifies each task as OK,
  due soon (inside the warning threshold) or overdue.
- Database constraints enforce positive intervals, whole numbers for cycle and day intervals, and a
  threshold strictly between 0% and 100%.

### Work orders
- Open a work order against an aircraft with items for due tasks.
- Sign off items with a performer and a `performed_at` timestamp that has second precision. Each
  sign-off records a `TaskCompletion` that resets the task's interval baseline.
- Historical completions can be recorded without a work order. Completions can be voided with a reason.
- Cancelling a work order requires a reason, which is stored for the audit trail.
- Lifecycle: `open → completed | cancelled`. Items go from `pending` to `signed_off` or `cancelled`.

### Operations dashboard
- Home page with KPI tiles that summarize the fleet, flights and maintenance status.
- Backend health indicator in the app shell, refreshed by polling.
- Sortable, paginated tables for aircraft, flights, flight logs, the maintenance due board and work
  orders, with light and dark themes.

---

## API contracts

The backend API is the source of truth, and the generated artifacts are committed.

| Artifact | Path | Generated from |
|---|---|---|
| OpenAPI 3 spec | `contracts/openapi/hangar.yaml` | DRF views and serializers (drf-spectacular) |
| Domain error codes | `contracts/errors/domain-errors.json` | Backend domain exceptions |
| TypeScript API types | `frontend/src/lib/api/schema.d.ts` | The OpenAPI spec (openapi-typescript) |
| Flight log message v1 | `contracts/flight-log/v1/` | Hand-written contract plus golden `message.json` |

Regenerate them after changing serializers, views or domain errors:

```bash
make schema
```

These checks keep the contracts in sync:

- Schema generation runs with `--validate --fail-on-warn`.
- Backend tests fail if the committed OpenAPI spec or error registry is stale.
- A frontend test fails if a backend domain error code has no UI message in
  `frontend/src/lib/api/errors.ts`.
- The frontend calls the API through `openapi-fetch`, so request and response shapes are checked
  at compile time.
- The Go producer and the Django consumer both test against the same golden flight log message.
  Changing the message format means updating `contracts/flight-log/v1/` and both sides' tests.

Interactive API docs are served at <http://localhost:8000/api/docs/>. The raw schema is at
`/api/schema/`.

---

## Quickstart

### Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Docker + Docker Compose v2 | recent | Running the full stack |
| Go | 1.27+ (see `ingest/go.mod`) | Ingest development, `make simulate` |
| Python | 3.12 | Backend development and tests |
| Node.js | 24 (as used in CI) | Frontend development and tests |
| golangci-lint | v2 | `make lint-ingest` |

For local development, you only need the toolchain of the part you are working on. The Docker stack
needs Docker alone.

### Run the stack

```bash
cp .env.example .env        # or: make env
docker compose up --build -d --wait
```

`make up-d` does both steps. Migrations run automatically when the backend container starts.

| Service | URL / port | Override |
|---|---|---|
| Frontend | <http://localhost:3000> | `FRONTEND_PORT` |
| Backend API | <http://localhost:8000/api/> | `BACKEND_PORT` |
| API docs (Swagger) | <http://localhost:8000/api/docs/> | |
| Health check | <http://localhost:8000/api/health/> | |
| Django admin | <http://localhost:8000/admin/> | |
| PostgreSQL | `localhost:5432` | `POSTGRES_PORT` |
| Redis | `localhost:6379` | |

`NEXT_PUBLIC_API_URL` is inlined into the frontend bundle at build time. If you change it, rebuild
the frontend image.

### Simulate flights

A flight is only accepted for an aircraft that is already registered. Create the aircraft first,
either in the UI or through the API. Then drop simulated logs into the inbox.

From the host (requires Go):

```bash
make simulate SERIAL=AC-00001 COUNT=3
```

Or from the running ingest container, which ships the `simulate` binary:

```bash
docker compose exec ingest /simulate -serial AC-00001 -count 3 -out /data/flight-logs/inbox
```

`-out` is a directory. Other useful flags include `-format csv|json`, `-start <RFC3339>`, `-gap`,
`-cruise`, `-altitude`, `-speed` and `-seed`. Run `/simulate -h` for the full list.

Follow the pipeline:

```bash
docker compose logs -f ingest flights-consumer
```

### Ingest configuration

| Variable | Default | Purpose |
|---|---|---|
| `REDIS_URL` | required | Redis connection string |
| `INBOX_DIR` | `/data/flight-logs` | Root of the `inbox/processing/processed/failed` folders |
| `INGEST_WORKERS` | CPU-based | Worker pool size |
| `POLL_INTERVAL` | `2s` | Inbox polling interval |
| `INBOX_SETTLE` | `2s` | How long a file must stay unchanged before it is claimed |
| `SHUTDOWN_TIMEOUT` | `10s` | Per-file timeout during graceful shutdown |
| `AIRBORNE_ALTITUDE_M` | `1.0` | Altitude above which a sample counts as airborne |

### Local development without Docker

```bash
docker compose up -d postgres redis

# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py runserver
python manage.py consume_flight_logs   # in a second terminal

# Ingest
cd ingest
REDIS_URL=redis://localhost:6379/0 INBOX_DIR=../var/flight-logs go run ./cmd/ingest

# Frontend
cd frontend
npm install
npm run dev
```

Run `make help` to list every developer command.

---

## Testing and quality

| Suite | Command | Scope |
|---|---|---|
| Backend | `make test-backend` (`cd backend && pytest`) | 337 pytest-django tests; needs Postgres (`docker compose up -d postgres`) |
| Ingest | `make test-ingest` (`cd ingest && go test -race ./...`) | Parser, validator, summary, pipeline, inbox and queue, with the race detector |
| Frontend | `make test-frontend` (`cd frontend && npm test`) | 223 Vitest and Testing Library tests, with the API mocked by MSW |
| Pipeline E2E | `make e2e` | `scripts/e2e.sh`: registers an aircraft, drops a simulated log and checks that the flight and usage counters appear |
| Browser E2E | `make e2e-ui` | Playwright specs in `frontend/e2e/` against the compose stack (local only) |
| All unit suites | `make test` | Backend, ingest and frontend |

Linting and type checks:

```bash
make lint      # ruff check + ruff format --check, golangci-lint, ESLint + tsc --noEmit
make fmt       # auto-format backend and ingest code
```

### Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs on pushes to `main` and on every pull request:

- **Backend:** ruff lint and format check, a missing-migrations check, pytest with coverage against PostgreSQL
- **Ingest:** golangci-lint, `go test -race ./...`
- **Frontend:** a check that the generated API types are up to date, ESLint, TypeScript check, Vitest, `next build`
- **Docker:** `docker compose build`

---

## Repository layout

```text
hangar/
├── .github/workflows/      # CI pipeline
├── backend/                # Django 5 + DRF
│   ├── config/             # Settings, URLs, WSGI/ASGI
│   └── apps/
│       ├── core/           # Health, pagination, domain errors, schema tooling
│       ├── fleet/          # Aircraft, components, life limits, installations
│       ├── flights/        # Flight logs, flights, Redis stream consumer
│       └── maintenance/    # Programs, tasks, intervals, due board, work orders
├── contracts/
│   ├── openapi/            # Generated OpenAPI spec (hangar.yaml)
│   ├── errors/             # Generated domain error registry
│   └── flight-log/v1/      # Ingest → backend message contract + golden file
├── ingest/                 # Go ingestion service
│   ├── cmd/
│   │   ├── ingest/         # Inbox polling service
│   │   └── simulate/       # Synthetic flight log generator
│   └── internal/           # inbox, parser, validator, summary, pipeline, queue, ...
├── frontend/               # Next.js 16 (App Router)
│   ├── src/
│   │   ├── app/            # Routes: dashboard, aircraft, flights, flight-logs,
│   │   │                   #         maintenance, work-orders
│   │   ├── components/     # UI components (shadcn/ui based)
│   │   ├── hooks/          # TanStack Query hooks
│   │   └── lib/            # API client, generated types, error messages
│   └── e2e/                # Playwright browser tests
├── scripts/e2e.sh          # Pipeline end-to-end check
├── var/                    # Runtime data (git-ignored): var/flight-logs/{inbox,processing,processed,failed}
├── docker-compose.yml
└── Makefile
```
