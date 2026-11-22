# Dependencies & Environment Setup (`DEPENDENCIES_AND_SETUP.md`)

**v5 review candidate — local engineering review only.** This is a delta from the v4 Parth archive, not a clean checkout of its base commit. The v4 guarded run and production-build counts below are historical, not v5 executions. Current evidence and remaining gates: [v5 review record](../../V5_REVIEW.md).

**Lifecycle Status:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`

---

## 1. Runtime & Package Inventory

### A. Root Verification Workspace (`package.json`)
- `@electric-sql/pglite` (`^0.5.11`) + `@electric-sql/pglite-pgvector` (`^0.0.12`): in-process WASM PostgreSQL used by `npm run test:postgres` and `npm run test:v3-regression`.
- `esbuild` (`0.28.2`): syntax and bundle check used by `npm run check:overlay`.

### B. Web Application (`apps/web/package.json` — `twin-intake-next` `0.1.0`)
- **Framework:** `next` `16.2.1` (`--webpack` mode), `react` `19.0.0`, `react-dom` `19.0.0`.
- **Database / Auth:** `@supabase/supabase-js` `^2.100.1`.
- **Document & External Clients:** `pdf-parse` `^2.4.5`, `adm-zip` `^0.6.0`, `axios` `^1.8.4`, `googleapis` `^171.4.0`, `google-auth-library` `^10.6.2`, `nodemailer` `^8.0.7`, `zod` `^3.24.4`, `dotenv` `^16.6.1`.
- **UI & Styling:** `tailwindcss` `^4.2.2`, `@tailwindcss/postcss` `^4.2.2`, Radix UI (`@radix-ui/react-*`), `lucide-react` `^0.507.0`, `recharts` `^3.6.0`, `motion` `^12.38.0`, `sonner` `^2.0.3`, `cmdk` `^1.1.1`.
- **Test & Lint Tooling:** `vitest` `^4.1.2`, `@testing-library/react` `^16.3.2`, `@testing-library/jest-dom` `6.4.5`, `jsdom` `^29.0.1`, `playwright` `^1.62.1`, `eslint` `^9`, `eslint-config-next` `16.2.1`.

### C. Shared Workspace Packages (`packages/`)
- `packages/proof-engine`: deterministic trust-packet evaluator, `WeakMap` provenance attestation, `calculation_digest`, `verified_proof_score` / `assertion_alignment_score` breakdown.
- `packages/hiring-genome`: role/contract rubric structures.
- `packages/shared-contracts`: shared validation and response contracts.
- `packages/ui`: shared UI components.

### D. Python Context Engine (`service/` & `requirements*.txt`)
- `fastapi==0.161.1`, `psycopg==3.3.6`, `psycopg-binary==3.3.6`, `pgvector==0.5.1`, `google-genai==2.33.0`, `openai==3.37.0`, `langgraph==1.2.17`, `langchain-core==1.7.0`, `graphiti-core==0.31.2`, `neo4j==6.4.1`, `huggingface_hub==2.4.0`, `numpy==2.5.4`.
- **Observed Local Gaps (`NOT VERIFIED` locally):**
  - `temporal` CLI binary (`127.0.0.1:7233`) is not installed locally (Temporal `ActivityEnvironment` unit tests run via pytest, not a live Temporal server).
  - `BAAI/bge-small-en-v1.5` embedding weights (`WORKBYLINE_EMBEDDING_WEIGHTS`) are not present locally; retrieval runs in `lexical_only` (PostgreSQL FTS) mode when weights are absent.
  - `python-docx` is not installed locally in `.venv` for `.docx` extraction.

---

## 2. Database & Migration Inventory

### A. Supabase / Operational Database (`supabase/migrations/`)
- **29 SQL migrations** (`20260803000001_operational_schema_baseline.sql` through `20260822000001_transactional_screening_completion.sql`) plus `supabase/migrations/rehearsals/`.
- Includes `20260820000001_track1_integrity_repairs.sql`, `20260821000001_datavertex_ledger_privilege_hardening.sql`, `20260821000002_canonical_fit_score_scale.sql`, `20260821000003_track1_forward_upgrade_reconciliation.sql`, and `20260822000001_transactional_screening_completion.sql`.

### B. Standalone Context Engine Migrations (`migrations/`)
- **8 SQL migrations** (`000_contain_unsafe_legacy_rpc.sql` through `009_datavertex_transactional_shortlist_and_credit_ledger.sql`).

---

## 3. Clean Setup & Verification Commands

### Protected Target Rule
Never run verification against `supabase_db_careertwin-local-baseline` (`54330–54335`) or ports `3000` / `3004`.

### Local Install
```bash
npm ci
(cd apps/web && npm ci)
```

### Root Behavioral, Contract, Schema & Overlay Checks
```bash
npm run test:v3-regression
npm run test:contracts
npm run test:postgres
npm run check:overlay
```

### Web Lint, Build & Standalone Unit Suites
```bash
cd apps/web
npm run lint
npm run build
```

### Guarded Disposable Harness (Full DB + Live `:3010` HTTP + Playwright)
Requires a dedicated disposable Supabase/PostgreSQL stack (e.g. `supabase_db_wbl-disposable-verify` on port `54422`, Kong on `54421`) with `CAREERTWIN_DRY_RUN_EMAIL=true` and `DISPOSABLE_VERIFICATION_PORT=3010`:
```bash
bash scripts/guarded_disposable_verify.sh
```
