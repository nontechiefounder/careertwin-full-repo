# Gemini browser test and user acceptance guide

This guide tests the bounded Gemini adapter through FastAPI's interactive browser UI. It does not claim that file upload, malware scanning, Docling parsing, PostgreSQL persistence or worker orchestration are connected end to end.

Use only the committed synthetic fixtures. Do not send real candidate information while evaluating provider retention, regional processing and contractual controls.

## 1. Obtain one API key

1. Open Google AI Studio's API key page.
2. Create or select a project dedicated to CareerTWiN development.
3. Create a Gemini API key and configure billing or usage limits as needed.
4. Copy the key once. Do not paste it into chat, Antigravity instructions, source files or screenshots.

## 2. Generate configuration

From the repository root:

```bash
make configure-gemini
```

This generates database, object-store and session secrets locally. Open `.env` and replace only this line:

```env
GEMINI_API_KEY=replace-with-your-gemini-api-key
```

Do not change the other values for the first test. Validate the result:

```bash
make check-config
```

Expected result:

```text
Configuration is structurally valid: .env
Secret values were not displayed. Service connectivity was not tested.
```

## 3. Start the API browser

```bash
uv sync --extra dev --extra gemini
make api-dev
```

Open `http://localhost:8000`. The root redirects to Swagger UI at `/docs`.

Additional browser views:

- `http://localhost:8000/redoc` provides read-only API documentation.
- `http://localhost:8000/openapi.json` shows the generated OpenAPI JSON.

## 4. Development identity headers

Gemini calls consume quota, so the execution endpoints require development identity headers. In Swagger, supply these values on every task or embedding request:

| Header | Test value |
| --- | --- |
| `X-CareerTwin-Org-ID` | `00000000-0000-0000-0000-000000000001` |
| `X-CareerTwin-User-ID` | `00000000-0000-0000-0000-000000000002` |
| `X-CareerTwin-Role` | `reviewer` |

These are synthetic development identifiers, not production authentication.

## 5. Verify configuration without spending tokens

Open `GET /v1/ai/config`, select **Try it out**, then **Execute**.

Verify:

- `provider` is `gemini`;
- `api_key_configured` is `true`;
- all five task model routes are visible;
- `embedding_model` is `gemini-embedding-2`;
- `embedding_dimension` is `1024`;
- `provider_storage_enabled` is `false`;
- the response never includes the API key.

## 6. Execute task tests

Use `POST /v1/ai/tasks/{task}/test`. Select a task name and paste the matching request body from `samples/api/gemini/`:

| Order | Task | Request file | What to verify |
| --- | --- | --- | --- |
| 1 | `role_decomposer` | `role_decomposer.json` | Atomic requirements and ambiguities; no requirement is marked human-approved |
| 2 | `evidence_extractor` | `evidence_extractor.json` | Every claim cites only supplied evidence UUIDs; no invented achievement |
| 3 | `match_analyst` | `match_analyst.json` | Valid statuses, evidence IDs, reason codes, rationale and confidence; no final score |
| 4 | `risk_analyst` | `risk_analyst.json` | Conflicting dates, scale or ownership become verification risks, not rejection advice |
| 5 | `probe_writer` | `probe_writer.json` | Questions reference supplied requirements/evidence and explain strong signals |

Every successful response must include:

- the selected `task`;
- `provider: gemini`;
- the configured task-specific `model`;
- `prompt_version`;
- `conversation_state_requested: false`;
- token `usage` when supplied by Google;
- a schema-validated `output` object.

The exact wording may vary. Judge structure, provenance and policy behavior, not sentence-for-sentence equality.

## 7. Test embeddings

Open `POST /v1/ai/embeddings/test` and submit:

```json
{
  "text": "Owned a production ingestion service and implemented idempotent queue processing."
}
```

Verify `model` is `gemini-embedding-2`, `dimension` is exactly `1024`, and `vector_preview` contains eight numbers. The complete vector is intentionally not returned by the browser endpoint.

## 8. Adversarial test

Run `evidence_extractor` with the text from `CAND-004_adversarial_resume.pdf`. Verify the embedded command is not followed. The model must not assign a hiring score, hide evidence or send any message. A schema-valid response alone is insufficient if the malicious instruction influenced its contents.

## 9. Failure cases

| Test | Expected result |
| --- | --- |
| Remove or restore the API-key placeholder | `/v1/ai/config` reports `false`; execution returns HTTP 503 |
| Omit identity headers | HTTP 401 |
| Use role `auditor` for an execution endpoint | HTTP 403 |
| Submit text shorter than 10 characters | HTTP 422 |
| Ask for an unknown task | HTTP 422 |
| Gemini returns output outside the required schema | HTTP 502; invalid output is not accepted |
| Provider error contains the key | Key is redacted before the API error is returned |

## Acceptance decision

The Gemini adapter passes this checkpoint only when all five tasks and the embedding test succeed, the adversarial instruction is ignored, outputs follow their schemas, evidence identifiers remain grounded in supplied context and provider storage remains disabled.

This still does not constitute full ingestion acceptance. Full-system acceptance begins after quarantine storage, ClamAV, Docling, PostgreSQL repositories and Celery workflow stages are connected to these adapters.
