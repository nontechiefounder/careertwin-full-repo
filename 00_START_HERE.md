# WorkByLine V2 — Operator Deployment & Verification Guide

## Executive Overview

This package contains the production-ready WorkByline V2 application, atomic database migrations, verified synthetic seed data, automated smoke and customer journey acceptance suites, raw verification logs, and a self-contained Core-08 rollback bundle.

**Security, Isolation & Boundary Constraints:**
- Zero remote code push or unreviewed external deployments.
- No live customer data; strictly reproducible synthetic test personas.
- Dry-run email mode strictly enforced (`CAREERTWIN_DRY_RUN_EMAIL=true`).
- No database credentials printed in logs (all passwords redacted via `****`).
- Any unexecuted hosted checks or unverified runtimes are explicitly marked **UNVERIFIED**.

---

## Package Directory Structure

```
careertwin-v2-memory-expansion-worktree/
├── 00_START_HERE.md                  # This reconciled operator guide
├── apps/web/                         # Next.js web application (package.json, src, tests)
│   ├── app/api/employer/context-sources/ # Context source upload, search, related endpoints
│   ├── app/api/employer/research-qa/     # Research QA proxy endpoint
│   ├── components/context/               # ContextEvidencePanel with search & related modes
│   └── lib/                              # contextClient, engineConfig, auth
├── infra/deployment/                 # Operational deployment & verification scripts
│   ├── deploy_staging.sh             # Atomic migration deployment
│   ├── seed_synthetic_data.sh        # Synthetic seed loader & fail-closed validator
│   ├── verify_staging_smoke.sh       # Staging smoke test
│   ├── verify_staging_acceptance.sh  # Automated acceptance runner
│   ├── rollback_staging.sh           # Atomic database rollback & app pairing guide
│   ├── rehearse_paired_rollback.sh   # Paired rollback verification script
│   └── run_customer_journey.js       # Authenticated journey suite
├── service/                          # Four-Layer Memory Expansion service
│   ├── run_memory.py                 # Memory service runner (serve, worker, test)
│   ├── temporal_pipeline.py          # Temporal workflow & activities (wbctx-version-<id>)
│   ├── hybrid.py                     # Scoped hybrid retrieval (pgvector 384d + FTS RRF)
│   ├── qa_flow.py                    # Bounded LangGraph QA flow (citation validation, abstention)
│   ├── graph_projection.py           # Derived Graphiti projection & re-resolution
│   ├── provider_factory.py           # Provider constructors & health checks
│   └── memory_api.py                 # FastAPI endpoints (/context/query, /context/related)
├── supabase/migrations/              # Atomic PostgreSQL migrations (19 files)
│   ├── 20260803000001_... to 20260817000002_... (15 baseline migrations)
│   ├── 20260818000001_context_evidence_foundation.sql
│   ├── 20260818000002_contain_unsafe_legacy_rpc.sql
│   ├── 20260818000003_context_evidence_service.sql
│   └── 20260818000004_hybrid_retrieval.sql
├── scripts/                          # Automated verification scripts
│   ├── verify_native_postgres_acceptance.py
│   └── verify_four_layer_expansion.py
└── tests/                            # Test suites
    ├── test_expansion.py             # 72 Python expansion tests
    ├── temporal_live_acceptance.py   # Live Temporal workflow acceptance
    ├── hybrid_postgres.mjs           # PostgreSQL hybrid retrieval test
    └── hybrid_queries.json           # Frozen hybrid test fixture
```

---

## Reconciliation Summary: Paths, Environment, Migrations & Application Start

### 1. Reconciled Directory Paths
All commands are executed directly from the monorepo root:
```bash
cd careertwin-v2-memory-expansion-worktree
```
Scripts in `infra/deployment/` automatically resolve the project root whether invoked from the repository root (`./infra/deployment/...`) or from within `infra/deployment/`.

### 2. Reconciled Environment Loading
All deployment scripts (`deploy_staging.sh`, `seed_synthetic_data.sh`, `verify_staging_smoke.sh`, `rollback_staging.sh`) utilize `load_env_safe()` to load variables in the following deterministic precedence:
1. `.env`
2. `.env.local`
3. `apps/web/.env`
4. `apps/web/.env.local`
Variables already exported in the shell take highest precedence and are never overwritten. Raw passwords and tokens are never printed or leaked.

For the web application process itself, Next.js natively loads `apps/web/.env.local` and `apps/web/.env`. Application dependencies and scripts reside in `apps/web/package.json` (with root package.json for workspace testing).

### 3. Reconciled Migration-Path Selection
`deploy_staging.sh` supports two explicit migration paths:
- **Existing Database (`--path=existing`, default)**: Verifies prerequisite baseline table `public.organizations`, then applies only unapplied migrations from `supabase/migrations/` atomically within `BEGIN ... COMMIT` blocks with version tracking.
- **Fresh Database (`--path=fresh`)**: Applies baseline and context migrations sequentially and atomically on an uninitialized PostgreSQL instance.

### 4. Reconciled Application Start Step
To build and start the web application service on port 3004:
```bash
cd apps/web
npm install
npm run build
PORT=3004 npm run start -- -p 3004
```

---

## Step-by-Step Operator Guide

### Step 1: Environment Setup

From the monorepo root:

```bash
# 1. Create root environment template
cp .env.example .env

# 2. Create web application environment template
cp apps/web/.env.example apps/web/.env.local

# 3. Populate target variables in apps/web/.env.local:
#    NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
#    NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
#    SUPABASE_SERVICE_ROLE_KEY="eyJ..."
#    DATABASE_URL="postgres://postgres:password@db.your-project.supabase.co:5432/postgres"
#    CAREERTWIN_DRY_RUN_EMAIL=true
#    WORKBYLINE_CONTEXT_SERVICE_URL="http://127.0.0.1:8011"
#    WORKBYLINE_CONTEXT_DELEGATION_SECRET="<at-least-32-character-secret>"
```

### Step 2: Database Migration Deployment

Deploy forward migrations atomically (`BEGIN ... COMMIT` with `ON_ERROR_STOP=1`):

```bash
# Staging deployment (existing database)
DATABASE_URL="postgres://..." ./infra/deployment/deploy_staging.sh --target=staging --path=existing

# Or Fresh database deployment
DATABASE_URL="postgres://..." ./infra/deployment/deploy_staging.sh --target=staging --path=fresh

# Or Local Rehearsal (Docker container target)
./infra/deployment/deploy_staging.sh --target=local-rehearsal
```

### Step 3: Reproducible Synthetic Data Seeding

Seed synthetic personas (Alpha & Beta employers, candidate Sarah Connor, staff profiles, and active memberships):

```bash
# Staging seed
DATABASE_URL="postgres://..." ./infra/deployment/seed_synthetic_data.sh --target=staging

# Or Local Rehearsal
./infra/deployment/seed_synthetic_data.sh --target=local-rehearsal
```

### Step 4: Python Environment & Four-Layer Memory Service

Set up the Python virtual environment and run the Context Evidence / Memory service:

```bash
# 1. Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-lock.txt

# 2. Start the Memory Service (HTTP API on port 8011)
python service/run_memory.py serve

# 3. In a separate terminal, start the Temporal Worker (requires TEMPORAL_ADDRESS)
python service/run_memory.py worker
```

### Step 5: Build and Start Application Service

```bash
cd apps/web
npm install
npm run build
PORT=3004 npm run start -- -p 3004
```

### Step 6: Staging Smoke Verification

Verify that security boundaries, private storage, RPC signatures, and target project consistency fail closed:

```bash
# Staging smoke test
DATABASE_URL="postgres://..." ./infra/deployment/verify_staging_smoke.sh --target=staging --app-url="https://your-app-url.com"

# Or Local Rehearsal
./infra/deployment/verify_staging_smoke.sh --target=local-rehearsal --app-url="http://localhost:3004"
```

### Step 7: Authenticated Customer Journey Acceptance

Execute the complete end-to-end customer journey:

```bash
APP_URL="https://your-app-url.com" node ./infra/deployment/run_customer_journey.js
```

### Step 8: Memory Expansion & Test Suite Verification

Run the full memory expansion test suites:

```bash
# Python unit & expansion suite (72 tests)
pytest tests/

# Temporal live workflow acceptance
PYTHONPATH=. .venv/bin/python tests/temporal_live_acceptance.py

# PostgreSQL hybrid pgvector retrieval test
node tests/hybrid_postgres.mjs

# End-to-end 4-layer expansion verification
python scripts/verify_four_layer_expansion.py

# Full Vitest suite (53 test files, 536 passing tests)
cd apps/web && npx vitest run
```

---

## Verification Status & Unexecuted Checks Classification

| Scope / Check | Status | Verification Context & Evidence |
| :--- | :--- | :--- |
| **A1: API & DB Target Consistency** | **VERIFIED** | Check 4b asserts exact project ref match between API `/api/health` and database URL; fails closed on mismatch (`logs/staging_smoke_verification.log`). |
| **A2: Defect Suite Robustness** | **VERIFIED** | 6/6 passed; deliberate missing-tool test verified as BLOCKED (`logs/script_defects_suite.log`, `logs/missing_tools_deliberate_test.log`). |
| **A3: Paired Rollback & Reapply** | **VERIFIED** | Verified `5f1b851^{tree}` provenance; dropped Core-09 RPC; restored Core-08 RPC; row content & document SHA-256 hashes 100% identical (`logs/paired_rollback_and_reapply_test.log`). |
| **A4: PostgreSQL 17.6 Runtime** | **VERIFIED** | Active Supabase PostgreSQL 17.6.1.155 runtime verified; host client is `psql 14.20` (`logs/postgresql_version_evidence.log`). |
| **A4: PostgreSQL 15.x Runtime** | **UNVERIFIED** | Dialect audited as compatible down to PG 13, but no live PG 15 host was provisioned in rehearsal. |
| **A5: Test Suite Scoping** | **VERIFIED** | 4 excluded `*Assertions.test.js` files classified as Playwright browser suites (31 declared tests), not helper modules; hardcoded paths removed. |
| **A6: Synthetic Seed Integrity** | **VERIFIED** | Validated 6 auth users with bcrypt crypt verification (`TestPassword123!`), 2 orgs, 4 staff profiles, 4 exact membership tuples, 2 candidates (`logs/synthetic_seed_verification.log`). |
| **A7: Operator Instructions** | **VERIFIED** | Nonexistent `source/package.json` removed; paths reconciled; Core-08 `npm install` documented. |
| **A8: Dependency Security Triage** | **VERIFIED** | 61 npm audit advisories analyzed; confirmed dev/build tooling or dormant behind `CAREERTWIN_DRY_RUN_EMAIL=true`; breaking upgrades safely deferred. |
| **14-Step Customer Journey** | **VERIFIED** | 40 assertions passed against local production build (`logs/customer_journey_acceptance.log`). |
| **12-Check Smoke Verification** | **VERIFIED** | 12 security, schema, and project-binding checks passed (`logs/staging_smoke_verification.log`). |
| **Hosted Cloud Staging Deploy** | **UNVERIFIED** | Requires Parth authorization and hosted cloud Supabase credentials. |
| **External SMTP Email Dispatch** | **UNVERIFIED** | Deliberately suppressed via `CAREERTWIN_DRY_RUN_EMAIL=true`. |
| **Production Customer Data** | **UNVERIFIED** | Deliberately excluded; only synthetic personas permitted. |
| **Live Third-Party LLM API** | **UNVERIFIED** | Deliberately excluded; deterministic evaluation rules active. |

---

## Rollback Procedure (Core-08 Pairing)

In the event of a staging rollback:

1. **Rehearse Rollback in Non-Destructive Disposable Inspection:**
   ```bash
   ./infra/deployment/rehearse_paired_rollback.sh
   ```
   *Note: Verifies Core-08 archive readability, extracts to a disposable inspection directory, checks committed lockfile/manifest, and verifies provenance against `UX-V2-D3-C4-R6-IDENTITY.txt` (commit `3f098cad`). Destructive database rollback is deliberately BLOCKED on the shared database to preserve 214 candidate records and 268 claim ledgers intact.*

2. **Deploy Paired Core-08 Application Version (Git-Independent):**
   ```bash
   mkdir -p rollback/core08_app
   tar -xzf rollback/careertwin_core08_app_archive.tar.gz -C rollback/core08_app
   cd rollback/core08_app/apps/web
   npm install
   npm run build
   PORT=3004 npm run start -- -p 3004
   ```

---

## Appendix: Context Engine & Context Evidence Foundation

> **Integration Branch:** `antigravity/ctw-v2-frontend-integration-rehearsal`
> **Preserved Baseline:** `84d9712d9cfe54986d835b42318fe5fe65eea3e4`
> **Rehearsal Commits:** `7dca3e4` -> `b1de785` -> `4e4036d` -> `0a3123f` -> **Current HEAD**
> **Status:** Core V2 READY. Context Evidence Foundation READY & CONNECTED. Research QA feature-flagged (`NEXT_PUBLIC_ENABLE_RESEARCH_QA=false`); live upstream Gemini generation marked **BLOCKED** pending provider key configuration.

### What Was Built & Hardened

#### 1. Phase A — Closed Integration Defects
- **Exact Tenant & Run Mapping (`apps/web/lib/engineConfig.js`):** Server-owned registry mapping `org_id` + `hiring_run_id` to isolated engine workspaces and roles. Eliminates client workspace authority and blind `memberships[0]` fallbacks. Distinct runs in the same org resolve to distinct roles.
- **Engine-Side Delegated Authorization:** Cryptographic HMAC-SHA256 signed bearer tokens bind actor, organization, hiring run, workspace, role, operation, and expiration (300s TTL) with replay detection cache.
- **Strict Discriminated Mode Contracts:**
  - `retrieval_only`: Returns ranked passages with `RETRIEVAL_ONLY_COMPLETE` status; no answer text required.
  - `retrieval_augmented` & `full_context`: Requires string answer, valid citations, and strict boolean `has_validation_errors`.
  - **Grounding Abstention:** `GROUNDED` responses lacking citations or with validation warnings are automatically downgraded to `INSUFFICIENT_EVIDENCE`, and unverified answer text is replaced with safe evidence abstention notices.
  - **Type Safety:** `limit` must be a strict integer (rejects floats, strings, negative values).
- **Metadata & Deadlines:** Latency reconciled (`latency_seconds` -> `latency_ms`). 30-second abort deadline active through body consumption.
- **Scope-Aware UI (`ResearchQAPanel.jsx`):** Displays pending resolution state before query; distinguishes `PUBLIC_RESEARCH` from `TENANT_PRIVATE`; mode selector toggles Q&A vs Passages-only; displays server-resolved company and role.
- **Release Provenance Reconciliation:** Reconciled Core-08 release tag target (`5f1b851^{tree}`) with Day 3 final accepted commit (`3f098cad`). `rehearse_paired_rollback.sh` verifies readability, lockfile, and provenance cleanly while blocking destructive shared DB mutation.

#### 2. Phase B — Context Evidence Foundation
- **Database Schema (`supabase/migrations/20260818000001_context_evidence_foundation.sql`):**
  - `context_source_objects`: Source identities with workspace and confidentiality scope.
  - `context_source_versions`: Immutable source versions with original SHA-256 and effective timestamps.
  - `context_parsed_artifacts`: Normalized parsed content with parser version (`docling-evidence-parser v1.4.0`) and schema version (`2026.1`).
  - `context_evidence_spans`: Granular evidence spans with exact character offsets (`[start_char..end_char]`), page numbers, and types.
  - `context_processing_runs`: Batch run tracking (`pending`, `running`, `completed`, `partial`, `failed`).
  - `context_document_results`: Document-level coverage scores and explicit exceptions.
  - `context_evaluation_dependencies`: Versioned dependencies between candidate claims and source versions.
  - `context_transactional_outbox`: Transactional outbox for reliable asynchronous worker dispatch.
  - `ingest_context_source_version_transactional`: Atomic RPC for transactional ingestion and outbox enqueue.
- **Worker & Consumer (`apps/web/lib/contextEvidenceWorker.js`):** Idempotent processor with deduplication, retry limits, span extraction, and coverage evaluation, designed for future Temporal activity binding.
- **Connected User Journey (`apps/web/components/context/ContextEvidencePanel.jsx` & API routes):**
  - Mounted directly into Role Brief workspace (`/employer/brief/[id]`).
  - Authorized upload -> processing progress -> granular evidence spans -> coverage score -> changed source upload -> automatic version bump (v1 -> v2) -> revision history tracking.

### Untracked Files and Worktree Inventory

- **`apps/web/node_modules`**: Untracked symlink pointing to the shared local dependency cache (`/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-v2-demo-worktree/apps/web/node_modules`). It is intentionally excluded from git commits to prevent vendoring hundreds of megabytes of platform binaries.
- All application source files, tests, configurations, and migration scripts are committed and fully tracked.

### Running Integration & Full Regression Tests

```bash
cd apps/web

# Run Phase A & B focused test suites
npx vitest run __tests__/api/researchQA.test.js __tests__/components/ResearchQAPanel.test.jsx __tests__/context/ContextEvidenceFoundation.test.js --reporter=verbose

# Run full application Vitest suite (55 test files, 566 passed tests)
DISPOSABLE_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54399/postgres" npx vitest run
```

---

## Architecture Diagram (Current File Paths & Runtimes)

```
Browser Client (Next.js 16 Production Build :3004)
 │
 ├── Context Evidence Panel [apps/web/components/context/ContextEvidencePanel.jsx]
 ├── Research QA Panel     [apps/web/components/ResearchQAPanel.jsx]
 │
 └── Next.js Route Handlers
      ├── /api/employer/context-sources/upload  [apps/web/app/api/employer/context-sources/upload/route.js]
      ├── /api/employer/context-sources/search  [apps/web/app/api/employer/context-sources/search/route.js]
      └── /api/employer/research-qa             [apps/web/app/api/employer/research-qa/route.js]
           │
           │ (Internal HMAC Bearer / Loopback HTTP)
           ▼
Python Memory & Retrieval Service (:8011) [service/run_memory.py]
 ├── Temporal Pipeline & Workflow       [service/temporal_pipeline.py]
 ├── Scoped Hybrid Retrieval (pgvector) [service/hybrid.py]
 ├── LangGraph Bounded QA Flow          [service/qa_flow.py]
 └── Graphiti Knowledge Projection     [service/graph_projection.py]
           │
           ▼
PostgreSQL 17.6 + pgvector Database (:54399 disposable / :54332 protected)
 ├── Context Source & Span Tables       [supabase/migrations/20260818000001_context_evidence_foundation.sql]
 ├── Hybrid Vector & FTS Indexes        [supabase/migrations/20260818000004_hybrid_retrieval.sql]
 └── Atomic Outbox Dispatch             [context_transactional_outbox]
```

---

## Reconciled Synthetic Founder Test Credentials

The synthetic accounts provisioned in `supabase/seed.sql` and verified by `infra/deployment/seed_synthetic_data.sh` are:

| Role | Synthetic Email | Password | Access Scope |
| :--- | :--- | :--- | :--- |
| **Owner Alpha** | `synthetic.employer.alpha@example.invalid` | `TestPassword123!` | Tenant Alpha (Full read/write) |
| **Recruiter Alpha** | `synthetic.employer.alpha.recruiter@example.invalid` | `TestPassword123!` | Tenant Alpha (Standard operations) |
| **Auditor Alpha** | `synthetic.employer.alpha.auditor@example.invalid` | `TestPassword123!` | Tenant Alpha (Strict Read-Only, write rejected) |
| **Owner Beta** | `synthetic.employer.beta@example.invalid` | `TestPassword123!` | Tenant Beta (Isolated, cannot access Alpha) |
| **Candidate One** | `synthetic.candidate.one@example.invalid` | `TestPassword123!` | Candidate Profile & Screenings |

---

## Step-by-Step Founder Acceptance Walkthrough

1. **Sign In as Owner Alpha:**
   - Navigate to `http://127.0.0.1:3004/auth`.
   - Enter `synthetic.employer.alpha@example.invalid` and `TestPassword123!`.
   - Confirm successful redirect to `/employer`.

2. **Open Role Brief Context Workspace:**
   - Click into a role brief (e.g. `/employer/brief/b0000000-0000-4000-a000-000000000001`).
   - Observe the **Context Evidence & Grounding Panel** rendered with the authoritative disclaimer: *"SOURCE MATERIAL / NOT EMPLOYER-APPROVED"*.

3. **Upload Real Documents (TXT, PDF, DOCX):**
   - Click "Upload Evidence". Select a candidate document.
   - Observe upload progress and HTTP 202 Accepted status with returned `source_id` and `version_id`.
   - Background worker processes document into normalized spans with exact Unicode offsets and SHA-256 hash.

4. **Search Grounded Spans:**
   - Type a keyword into the passage search box (e.g. *"Python"* or *"PostgreSQL"*).
   - Verify matching excerpts render inside the results component tied to the exact source identity and version.

5. **Upload Revised Version (v2 Superseding v1):**
   - Upload modified content under the same file identity.
   - Observe automatic bump to **v2**.
   - Current retrieval returns v2 content; immutable v1 audit history remains accessible in version history.

6. **Verify Cross-Tenant Isolation (Tenant Beta):**
   - In an incognito window, sign in as `synthetic.employer.beta@example.invalid` with `TestPassword123!`.
   - Attempt to access Tenant Alpha brief or search Tenant Alpha context sources.
   - Confirm access is denied; Tenant Beta search results return empty with zero cross-tenant leakage.

7. **Verify Auditor Read-Only Enforcement:**
   - Sign in as `synthetic.employer.alpha.auditor@example.invalid` with `TestPassword123!`.
   - Attempt to upload an evidence file or mutate a hiring packet.
   - Confirm operation is rejected with `ACCESS_DENIED`.


