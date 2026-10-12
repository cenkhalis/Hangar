.DEFAULT_GOAL := help

COMPOSE := docker compose

.PHONY: help env up up-d down logs build migrate simulate e2e e2e-ui schema \
	test test-backend test-ingest test-frontend \
	lint lint-backend lint-ingest lint-frontend fmt

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

env: ## Create .env from .env.example if missing
	@test -f .env || cp .env.example .env

up: env ## Build and start all services
	$(COMPOSE) up --build

up-d: env ## Build and start all services in the background
	$(COMPOSE) up --build -d

down: ## Stop all services
	$(COMPOSE) down

logs: ## Follow service logs
	$(COMPOSE) logs -f

build: ## Build all images
	$(COMPOSE) build

migrate: ## Apply Django migrations inside the backend container
	$(COMPOSE) exec backend python manage.py migrate

simulate: ## Drop simulated flight logs into the inbox (SERIAL=AC-00001 COUNT=3)
	cd ingest && go run ./cmd/simulate -serial $(or $(SERIAL),AC-00001) -count $(or $(COUNT),3) -out ../var/flight-logs/inbox

schema: ## Regenerate API contracts (OpenAPI, domain error codes) and frontend types
	cd backend && DJANGO_SECRET_KEY=schema .venv/bin/python manage.py spectacular --validate --fail-on-warn --file ../contracts/openapi/hangar.yaml
	cd backend && DJANGO_SECRET_KEY=schema .venv/bin/python manage.py export_domain_errors
	cd frontend && npm run gen:api

e2e-ui: ## Browser end-to-end tests (Playwright) against the compose stack
	$(COMPOSE) up --build -d --wait
	cd frontend && npx playwright test

e2e: ## End-to-end flight log pipeline check against the compose stack
	./scripts/e2e.sh

test: test-backend test-ingest test-frontend ## Run all test suites

test-backend: ## Run backend tests (requires Postgres, e.g. `docker compose up -d postgres`)
	cd backend && .venv/bin/pytest

test-ingest: ## Run ingest tests with the race detector
	cd ingest && go test -race ./...

test-frontend: ## Run frontend tests
	cd frontend && npm test

lint: lint-backend lint-ingest lint-frontend ## Run all linters

lint-backend:
	cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check .

lint-ingest:
	cd ingest && golangci-lint run

lint-frontend:
	cd frontend && npm run lint && npx tsc --noEmit

fmt: ## Auto-format backend and ingest code
	cd backend && .venv/bin/ruff format . && .venv/bin/ruff check --fix .
	cd ingest && golangci-lint fmt
