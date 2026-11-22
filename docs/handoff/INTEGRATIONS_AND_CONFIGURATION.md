# Integrations & Configuration (`INTEGRATIONS_AND_CONFIGURATION.md`)

**Employer document chat:** this route has a Gemini-only transport; it does not use shared multi-provider fallback. It requires an explicit `WORKBYLINE_GENERATION_GATE=true`, a configured Gemini key and a compatible provider selection. Any explicit non-Gemini selection gives zero generation calls on this route. Strict mode requires explicit Gemini. Leave provider keys empty for offline work. Only the question and up to 20 eligible (≤4,000-character) authorized excerpts with filenames/span IDs enter the selection prompt. Other routes have separate policy.

**v5 review candidate — local engineering review only.** This is a delta from the v4 Parth archive, not a clean checkout of its base commit. The v4 guarded run and production-build counts below are historical, not v5 executions. Current evidence and remaining gates: [v5 review record](../../V5_REVIEW.md).

**Lifecycle Status:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`

---

## 1. Sanitized Environment Templates

Authoritative, secret-free templates are maintained in:
- Root: `.env.example`
- Web app: `apps/web/.env.example`

> [!CAUTION]
> Real `.env` and `.env.local` files are excluded from handoff archives. Rotate all development/local secrets before provisioning staging or production environments.

---

## 2. AI Provider Selection & Strict Mode (`apps/web/lib/ai.js`)

| Variable | Behavior |
|---|---|
| `WORKBYLINE_AI_PROVIDER` | **Provider preference** (`groq`, `gemini`, `claude`, `openai`). Orders preferred provider first while preserving fallback to other configured providers. |
| `WORKBYLINE_AI_STRICT_PROVIDER` | Set to `true` alongside `WORKBYLINE_AI_PROVIDER` to enforce an **explicit single-provider restriction** with zero fallback. |
| `GEMINI_API_KEY` | Google Gemini REST (`gemini-3.1-pro-preview:generateContent`). |
| `GROQ_API_KEY` / `GROK_API_KEY` | Groq OpenAI-compatible chat completions. |
| `ANTHROPIC_API_KEY` | Anthropic Messages API (`/v1/messages`, `callClaude`). |
| `OPENAI_API_KEY` | OpenAI chat completions. |
| `WORKBYLINE_GENERATION_GATE` | Set `false` during offline/disposable runs to block live generation calls in the Python Context Engine. |

---

## 3. Sourcing, ATS & Email Integrations

| Integration | Variables | Runtime & Verification Boundary |
|---|---|---|
| **DataVertex** | `DATAVERTEX_API_KEY`, `DATAVERTEX_MAX_CREDITS` | Protected by atomic `datavertex_credit_ledger` RPCs (`reserve_credits`, `settle_credits`). **Not called live** without explicit Founder authorization. |
| **Coresignal / Crustdata** | `CORESIGNAL_API_KEY`, `CRUSTDATA_API_KEY`, `CRUSTDATA_AUTH_TOKEN` | Sourcing lookup/search routes fail closed when keys are absent. **Not called live**. |
| **Ashby ATS** | `ASHBY_API_KEY` | `apps/web/app/api/employer/integrations/ashby/route.js` requires explicit `mode` and blocks `synthetic_sandbox` when `NODE_ENV === 'production'`. |
| **Gmail / SMTP** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SYSTEM_EMAIL_*` | `CAREERTWIN_DRY_RUN_EMAIL=true` suppresses all outbound SMTP/Gmail writes during verification. |

---

## 4. Python Context Engine & Optional Backends

| Variable | Default / Behavior |
|---|---|
| `WORKBYLINE_CONTEXT_SERVICE_URL` / `WORKBYLINE_ENGINE_URL` | `http://127.0.0.1:8011` |
| `WORKBYLINE_CONTEXT_DELEGATION_SECRET` / `WORKBYLINE_INTERNAL_SERVICE_KEY` | Required shared HMAC/delegation secret; fail closed if absent (no hardcoded default). |
| `WORKBYLINE_ENGINE_MAPPINGS` | JSON map of `orgId -> companyName + runs`; unmapped workspaces fail closed with `403 UNMAPPED_WORKSPACE`. |
| `WORKBYLINE_CONTEXT_DATABASE_URL` | PostgreSQL + pgvector DSN for `service/`. |
| `WORKBYLINE_EMBEDDING_WEIGHTS` | Optional local path to `BAAI/bge-small-en-v1.5`; absent locally (`lexical_only` mode). |
| `WORKBYLINE_GRAPH_ENABLED` | `false` by default (Graphiti/Neo4j optional & disabled in local verification). |
