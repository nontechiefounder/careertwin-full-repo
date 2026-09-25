.PHONY: verify-core verify format lint test openapi api-dev configure-local configure-hosted configure-gemini check-config generate-samples compose-up compose-down migrate

PYTHONPATH := $(CURDIR)/src

verify-core:
	PYTHONPATH=$(PYTHONPATH) python -m compileall -q src tests
	PYTHONPATH=$(PYTHONPATH) python scripts/validate_ontology.py
	PYTHONPATH=$(PYTHONPATH) python -m unittest discover -s tests -p 'test_*.py' -v

verify: lint test

format:
	uv run ruff format src tests scripts

lint:
	uv run ruff check src tests scripts
	uv run mypy src

test:
	PYTHONPATH=$(PYTHONPATH) uv run pytest -q

openapi:
	PYTHONPATH=$(PYTHONPATH) uv run python scripts/export_openapi.py

api-dev:
	uv run --extra gemini uvicorn careertwin.api.main:app --reload --host 0.0.0.0 --port 8000

configure-local:
	python scripts/configure_env.py --profile local $(if $(MODEL_NAME),--model-name "$(MODEL_NAME)") $(if $(EMBEDDING_MODEL_NAME),--embedding-model-name "$(EMBEDDING_MODEL_NAME)")

configure-hosted:
	python scripts/configure_env.py --profile hosted

configure-gemini:
	python scripts/configure_env.py --profile gemini

check-config:
	python scripts/check_config.py .env

generate-samples:
	uv run python scripts/generate_sample_documents.py

compose-up:
	docker compose -f infra/compose.yaml up --build

compose-down:
	docker compose -f infra/compose.yaml down

migrate:
	uv run alembic upgrade head
