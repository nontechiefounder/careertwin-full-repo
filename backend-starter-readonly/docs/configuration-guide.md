# CareerTWiN configuration guide

The current starter kit can run core tests without configuration because those tests use pure domain logic and an in-memory workflow store. A real ingestion run needs service configuration and the missing adapters described in `docs/implementation-status.md`.

Never send production API keys through chat, screenshots, tickets or source control. Enter them locally into `.env` for development and use a secret manager in production.

## Recommended for current testing: Gemini

Generate an environment where the only unresolved value is the Gemini API key:

```bash
make configure-gemini
```

Open `.env` and replace only:

```env
GEMINI_API_KEY=replace-with-your-gemini-api-key
```

Then run:

```bash
make check-config
uv sync --extra dev --extra gemini
make api-dev
```

Open `http://localhost:8000` for interactive Swagger UI. Follow `docs/gemini-user-acceptance-test.md` for request JSON and expected behavior.

The same key is used by every task. Model routing is separately editable through `GEMINI_ROLE_DECOMPOSER_MODEL`, `GEMINI_EVIDENCE_EXTRACTOR_MODEL`, `GEMINI_MATCH_ANALYST_MODEL`, `GEMINI_RISK_ANALYST_MODEL`, `GEMINI_PROBE_WRITER_MODEL` and `GEMINI_EMBEDDING_MODEL`.

The default model map intentionally uses stable Gemini 2.5 Pro, Flash and Flash-Lite identifiers. The adapter uses Google's Interactions API for structured generation and sends `store=false`. Embeddings use `gemini-embedding-2` with a requested output dimensionality of 1,024 to match the existing pgvector migration.

## Option 1: all-local development

This profile uses PostgreSQL, Redis, MinIO, ClamAV, Docling and Ollama locally. It requires no paid API key.

```bash
make configure-local
```

The wizard generates PostgreSQL, MinIO and session secrets locally and writes `.env` with file mode `0600`. It does not print secrets.

You must still install two compatible local models in Ollama:

1. A model capable of reliable JSON or tool-structured output.
2. A 1024-dimension embedding model.

Place the exact installed model names in:

```env
MODEL_NAME=installed-structured-model-name
EMBEDDING_MODEL_NAME=installed-1024d-embedding-model-name
```

To discover names already installed in a running local Ollama service:

```bash
docker compose -f infra/compose.yaml --profile local-ai up -d ollama
docker compose -f infra/compose.yaml exec ollama ollama list
```

If no suitable models are installed, select models that fit the development machine, install them with Ollama's documented `pull` command, and run `ollama list` again. The embedding model must actually produce 1024 values; a name alone is not proof of dimensionality.

Either edit the two generated `.env` values, or supply the discovered names when creating the file:

```bash
make configure-local \
  MODEL_NAME=exact-installed-model \
  EMBEDDING_MODEL_NAME=exact-installed-embedding-model
make check-config
docker compose -f infra/compose.yaml --profile local-ai up --build
```

Local model choice affects RAM, GPU requirements and extraction quality. Do not assume a small laptop model is suitable for a customer pilot.

The local profile needs no vendor API keys. PostgreSQL, MinIO and session secrets are generated on the machine. Do not send the resulting `.env` file to Antigravity or through chat; place it directly in the repository root on the machine running the services.

## Option 2: hosted model development

Use this profile when model quality matters more than keeping every component local.

```bash
make configure-hosted
make check-config
docker compose -f infra/compose.yaml up --build
```

The wizard requests secrets through hidden terminal input. Obtain the values from the chosen provider's developer console:

1. Create or select a project dedicated to CareerTWiN development.
2. Enable billing and set a low development budget or usage limit.
3. Create a server-side API key. Do not create a browser-exposed key.
4. Record the provider's API base URL.
5. Select a model that supports schema-constrained structured output.
6. Select an embedding model that returns exactly 1024 dimensions, or create a database migration before changing the configured dimension.
7. Enter the values when `make configure-hosted` prompts for them.
8. Restrict and rotate the key according to the provider's capabilities.
9. Confirm the provider's retention and training controls are appropriate before processing real candidate information.

The current repository has provider-neutral contracts but not the completed model adapter. Adding a key does not by itself enable extraction.

## Option 3: manual configuration

```bash
cp .env.example .env
chmod 600 .env
```

Generate secrets locally:

```bash
openssl rand -hex 32
openssl rand -base64 32
```

Replace every placeholder in `.env`, then run:

```bash
make check-config
```

The validator checks structure and placeholders without printing secret values. It does not make network requests.

## Where each value comes from

| Value | Source |
| --- | --- |
| `POSTGRES_PASSWORD` | Generated locally by the wizard or `openssl` |
| `DATABASE_URL` | Built from PostgreSQL user, password, host and database |
| `REDIS_URL` | Local Compose service or managed Redis connection string |
| MinIO access and secret keys | Generated locally for development; cloud IAM or S3-compatible credentials in production |
| `MODEL_BASE_URL` | Local Ollama/vLLM URL or hosted provider documentation |
| `MODEL_API_KEY` | Hosted provider developer console; local profile uses a non-secret placeholder accepted by the local server |
| `MODEL_NAME` | Exact deployed or locally installed model identifier |
| Embedding URL/key/name | Local embedding server or provider console |
| `SESSION_SECRET` | Generated locally; never supplied by an outside vendor |
| OTel endpoint | Local Collector or chosen observability backend |

## Production configuration

Do not copy the development `.env` file onto production as the long-term secret store.

- Store secrets in the deployment platform's secret manager.
- Inject values into API, worker and migration containers.
- Use separate credentials per environment.
- Do not share database-owner credentials with the API runtime.
- Restrict object-store credentials to the tenant-scoped operations the service needs.
- Enable TLS for every network service.
- Rotate model, database and object-store credentials.
- Configure real OIDC or session-backed authentication. Production currently fails closed until this adapter exists.

## Connectivity verification still needed

`make check-config` validates values, not service availability. The full integration suite must later verify:

- PostgreSQL and pgvector migrations;
- RLS isolation across two organizations;
- Redis and Celery delivery;
- MinIO write/read/delete;
- ClamAV accepted and rejected files;
- Docling parsing and evidence coordinates;
- structured model output and schema retries;
- 1024-dimension embeddings;
- restart recovery and immutable packet versions.
