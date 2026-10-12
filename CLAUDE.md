# HANGAR - Project Guidelines & Assistant Instructions

## Overview
HANGAR is a web platform for managing UAV (Unmanned Aerial Vehicle) fleets, tracking flight logs, scheduling periodic maintenance based on flight hours and calendar intervals, and monitoring component lifecycles using simulated data.

---

## Repository Structure (Monorepo)

```text
hangar/
├── .github/
│   └── workflows/          # GitHub Actions CI pipelines (lint, test, docker build)
├── backend/                # Python 3.12, Django 5, DRF, PostgreSQL
│   ├── manage.py
│   ├── config/             # Project settings, wsgi/asgi, base urls
│   └── apps/               # Domain-driven Django apps (fleet, maintenance, flights, etc.)
│       └── <app>/
│           ├── models.py
│           ├── serializers.py
│           ├── views.py
│           ├── services.py # Core business logic
│           └── tests/
├── contracts/              # Cross-service message contracts + golden files (tested by both sides)
│   └── flight-log/v1/
├── ingest/                 # Go flight log ingestion service (CSV/JSON -> Redis)
│   ├── cmd/
│   │   ├── ingest/         # Service: polls the inbox and publishes flight logs
│   │   └── simulate/       # CLI: generates synthetic flight logs
│   ├── internal/
│   │   ├── inbox/          # Inbox directory claim/archive lifecycle
│   │   ├── parser/         # Streaming CSV/JSON parsing + SHA-256 log IDs
│   │   ├── validator/      # Schema and flight data validation
│   │   ├── summary/        # Flight summary (takeoff/landing, distance, maxima)
│   │   ├── pipeline/       # Worker pool: parse -> validate -> summarize -> publish
│   │   └── queue/          # Redis publisher
│   ├── go.mod
│   └── go.sum
├── frontend/               # Next.js (App Router), TypeScript
│   ├── src/
│   │   ├── app/            # App Router pages and layouts
│   │   ├── components/     # UI components
│   │   ├── hooks/          # Custom hooks (TanStack Query, etc.)
│   │   ├── stores/         # Zustand global state stores
│   │   └── lib/            # Utilities, API client
│   ├── package.json
│   └── tsconfig.json
├── scripts/                # e2e.sh and other developer scripts
├── var/                    # Runtime data, git-ignored (var/flight-logs/{inbox,processing,processed,failed})
├── docker-compose.yml      # Orchestrates all services, PostgreSQL, and Redis
├── Makefile                # Unified developer commands
└── CLAUDE.md
```

---

## Architectural Principles & Workflow Rules

1. **Clean Code & SOLID:**
   - Keep views and controllers thin.
   - Django Rule: Strictly decouple business logic from views and serializers. Write all domain logic inside `services.py` modules.
   - Favor dependency injection, pure helper functions, and clear separation of concerns.

2. **Test-Driven & Verification Mandate:**
   - Write comprehensive tests for every new business logic component or edge case.
   - Backend: Use pytest (pytest-django).
   - Ingest: Use standard Go testing (`go test`).
   - Frontend: Unit/component tests via Jest/Vitest where applicable.
   - Verification: Run all relevant test suites at the end of every implementation phase and report passing status before concluding the turn.

3. **Language & Conventions:**
   - All code, docstrings, code comments, and git commit messages must be written strictly in English.
   - Use conventional commit messages (e.g., `feat: ...`, `fix: ...`, `refactor: ...`).

4. **Approval Gate for Major Changes:**
   - Do not jump into implementation for large or architectural changes.
   - Always present a clear design/step-by-step plan first and wait for my approval before proceeding.

5. **No Speculative Code:**
   - Stick to the defined scope. Do not create placeholder files or implement unrelated features ahead of time.

---

## Common Commands

### 1. Docker & Full Environment
```bash
# Start all services (Backend, Ingest, Frontend, Postgres, Redis)
docker compose up --build

# Run in background
docker compose up -d

# Stop all services
docker compose down
```

### 2. Backend (Python / Django)
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt  # requirements.txt holds runtime deps only
python manage.py makemigrations
python manage.py migrate
pytest
pytest --cov=.
ruff check .
ruff format . --check
```

### 3. Ingestion Service (Go)
```bash
cd ingest
go mod download
go run ./cmd/ingest                       # needs REDIS_URL and INBOX_DIR
go run ./cmd/simulate -serial AC-00001 -count 3 -out ../var/flight-logs/inbox
go test -v -race ./...
golangci-lint run
```

### 4. Frontend (Next.js / TypeScript)
```bash
cd frontend
npm install
npm run dev
npm run lint
npx tsc --noEmit
npm test                                  # Vitest + Testing Library, API mocked with MSW
npm run build
```
Next.js 16 has breaking changes: read `frontend/AGENTS.md` and the bundled docs in
`frontend/node_modules/next/dist/docs/` before using a Next.js API.

### API contracts
```bash
make schema    # regenerate contracts/openapi/hangar.yaml, contracts/errors/domain-errors.json,
               # and frontend/src/lib/api/schema.d.ts after changing serializers, views or errors
make e2e-ui    # Playwright browser tests against the compose stack (local only)
```
Backend tests fail if the committed contracts are stale; a frontend test fails if a backend
domain error code has no UI message in `frontend/src/lib/api/errors.ts`.

### 5. Flight log pipeline
```bash
make simulate SERIAL=AC-00001 COUNT=3     # drop simulated logs into var/flight-logs/inbox
make e2e                                  # full pipeline check against the compose stack
docker compose logs -f ingest flights-consumer
```
Flow: `var/flight-logs/inbox` → Go ingest → Redis stream `hangar:flight-logs:v1` →
`python manage.py consume_flight_logs` → `flights.services.process_flight_log()`.
Changing the message format means updating `contracts/flight-log/v1/` and both sides' contract tests.

### 6. CI / GitHub Actions
The CI pipeline checks:
- Backend: ruff (lint/format), pytest
- Ingest: golangci-lint, `go test -race ./...`
- Frontend: ESLint, TypeScript check, Next.js build
- Docker: `docker compose build` verification
