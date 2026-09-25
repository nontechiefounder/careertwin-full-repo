# CareerTWiN Platform

Backend-first engineering starter kit for the CareerTWiN evidence and trust engine.

This repository intentionally contains **no product frontend**. It exposes stable HTTP and event contracts that the existing CareerTWiN frontend can consume when ready.

Google Antigravity should load `.agents/agents.md` before changing the repository. It defines the backend-first boundary, agent responsibilities, locked architecture, domain invariants, security rules and verification workflow.

## What is implemented

- Typed domain contracts for roles, requirements, candidates, evidence, matches, Trust Packets and workflow runs.
- Deterministic scoring with separate score and confidence values.
- A resumable workflow state machine with explicit human gates.
- FastAPI endpoints for health, roles and workflow runs.
- Celery worker entry points and idempotent stage task boundaries.
- PostgreSQL + pgvector schema, row-level tenant isolation and an append-only audit log.
- Versioned CareerTWiN ontology and scoring rubric.
- Docker Compose services for PostgreSQL, Redis, MinIO, ClamAV, API and worker.
- A local/hosted configuration wizard, non-secret structural validator and setup guide.
- A Gemini profile with one editable API-key value and task-specific model routing.
- Interactive Swagger, ReDoc and OpenAPI JSON browser views for development testing.
- Synthetic PDF, DOCX and CSV ingestion fixtures with adversarial and contradictory cases.
- Unit, contract, ontology and workflow tests that run without infrastructure.

## Repository map

```text
src/careertwin/
  api/             HTTP boundary only
  domain/          business entities and deterministic scoring
  orchestration/   workflow state machine and stage contracts
  persistence/     database models, sessions and repository adapters
  worker/          asynchronous task entry points
packages/ontology/ versioned semantic model and scoring rubric
migrations/        Alembic database migrations
infra/             local services and telemetry configuration
services/          container entry points
tests/             unit, contract and workflow verification
docs/              architecture decisions, threat model and API notes
```

## Local verification

The core domain tests need only Python 3.12, Pydantic and PyYAML:

```bash
make verify-core
```

For the complete development environment:

```bash
make configure-local
make check-config
uv sync --extra dev
make generate-samples
docker compose -f infra/compose.yaml --profile local-ai up --build
```

Follow `docs/configuration-guide.md` to obtain or generate each value. The generated sample pack and expected results are documented in `samples/ingestion/README.md`.

## Quick Gemini browser test

```bash
make configure-gemini
# Replace only GEMINI_API_KEY in .env
make check-config
uv sync --extra dev --extra gemini
make api-dev
```

Open `http://localhost:8000`; it redirects to interactive Swagger UI. Follow `docs/gemini-user-acceptance-test.md` and use the request bodies under `samples/api/gemini/`.

Default task routing:

| AI task | Gemini model |
| --- | --- |
| Role decomposition | `gemini-2.5-pro` |
| Evidence extraction | `gemini-2.5-flash` |
| Requirement matching | `gemini-2.5-pro` |
| Risk analysis | `gemini-2.5-flash` |
| Interview probes | `gemini-2.5-flash-lite` |
| Embeddings | `gemini-embedding-2`, truncated to 1,024 dimensions |

These model values can be changed independently in `.env`; every task uses the same `GEMINI_API_KEY`. Gemini calls are sent with provider-side interaction storage disabled.

The API will expose:

- `GET /health/live`
- `GET /health/ready`
- `POST /v1/roles`
- `POST /v1/runs`
- `GET /v1/runs/{run_id}`
- `POST /v1/runs/{run_id}/role-approval`
- `POST /v1/runs/{run_id}/release`

OpenAPI is available at `/docs` in development.

## Deliberate MVP boundaries

- Uploaded files and manual role entry are the only inputs.
- No ATS, CRM, HRIS, ERP, email, calendar or web-scraping integration is required.
- The model layer cannot browse, execute shell commands or send messages.
- AI stages return validated records. Deterministic code owns gates and score aggregation.
- A reviewer must approve role requirements and release every Trust Packet.
- Protected traits and common proxies are prohibited from scoring.

## Next implementation slices

1. Connect API repositories to PostgreSQL and implement signed MinIO uploads.
2. Add Docling parsing and page-level evidence coordinates.
3. Connect the isolated Gemini adapter to worker stages and run the golden and ingestion fixture corpora.
4. Wire the existing frontend to the published OpenAPI contract.
