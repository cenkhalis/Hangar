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
├── ingest/                 # Go flight log ingestion service (CSV/JSON -> Redis)
│   ├── cmd/
│   │   └── ingest/
│   ├── internal/
│   │   ├── parser/         # Concurrent CSV/JSON parsing
│   │   ├── validator/      # Schema and flight data validation
│   │   └── queue/          # Redis publisher / worker
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
pip install -r requirements.txt
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
go run cmd/ingest/main.go
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
npm run build
```

### 5. CI / GitHub Actions
The CI pipeline checks:
- Backend: ruff (lint/format), pytest
- Ingest: golangci-lint, `go test -race ./...`
- Frontend: ESLint, TypeScript check, Next.js build
- Docker: `docker compose build` verification
