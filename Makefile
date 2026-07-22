UV=python -m uv

.PHONY: install dev up down logs migrate migration seed test test-unit test-integration lint format typecheck security-check

install:
	$(UV) venv --seed .venv
	$(UV) sync --dev

dev:
	$(UV) run uvicorn openhealth_bridge.main:app --host 0.0.0.0 --port 8000 --reload

up:
	docker compose up --build

down:
	docker compose down --remove-orphans

logs:
	docker compose logs -f api postgres

migrate:
	$(UV) run alembic upgrade head

migration:
	$(UV) run alembic revision --autogenerate -m "$(message)"

seed:
	@echo "No seed data in Fase 0."

test:
	$(UV) run pytest

test-unit:
	$(UV) run pytest tests

test-integration:
	@echo "Integration tests start in Fase 1."

lint:
	$(UV) run ruff check .

format:
	$(UV) run ruff format .

typecheck:
	$(UV) run mypy src tests

security-check:
	$(UV) pip check
