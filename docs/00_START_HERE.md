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
WorkByline_V2_Deployment_Package/
├── 00_START_HERE.md                  # This reconciled operator guide
├── STEP_CTW_V2_INDEPENDENT_AUDIT_CORRECTIONS_REPORT.md # Full audit & re-audit report
├── source/                           # Canonical runnable application tree
│   ├── apps/web/                     # Next.js web application (package.json, src, tests)
│   ├── supabase/                     # Migrations (15 files) & seed.sql
│   ├── packages/                     # Core evaluation & shared libraries
│   └── fixtures/                     # Test fixtures (sarah_connor_lead_infra.pdf)
├── deployment/                       # Operational deployment & verification scripts
│   ├── deploy_staging.sh             # Atomic migration deployment
│   ├── seed_synthetic_data.sh        # Synthetic seed loader & fail-closed validator
│   ├── verify_staging_smoke.sh       # 12-check staging smoke test with project mismatch guard
│   ├── verify_staging_acceptance.sh  # Automated acceptance runner
│   ├── rollback_staging.sh           # Atomic database rollback & app pairing guide
│   ├── run_customer_journey.js       # 14-step authenticated journey suite (40 assertions)
│   └── test_script_defects.sh        # 6-check script robustness & fail-closed test
├── migrations/                       # Standalone forward & rehearsal rollback SQL files
│   ├── 20260803000001_... to 20260817000002_... (15 migrations)
│   ├── rehearsals/rollback_20260817000001.sql
│   └── seed.sql
├── rollback/                         # Git-independent Core-08 application archive
│   └── careertwin_core08_app_archive.tar.gz
├── screenshots/                      # 10 verified browser journey evidence screenshots
└── logs/                             # Raw execution logs & proof of test execution
    ├── missing_tools_deliberate_test.log      # Deliberate missing-tool (BLOCKED) test log
    ├── migration_failure_rollback_test.log   # Injected syntax error atomic rollback log
    ├── paired_rollback_and_reapply_test.log  # Core-08 rollback & reapplication log
    ├── postgresql_version_evidence.log       # PG 17.6 verified runtime & PG 15 dialect evidence
    ├── customer_journey_acceptance.log       # 14-step customer journey acceptance log (40 passes)
    ├── staging_smoke_verification.log        # 12-check staging smoke verification log
    ├── synthetic_seed_verification.log       # 6-user synthetic seed validation log
    └── script_defects_suite.log              # 6-check script defect test log
```

---

## Reconciliation Summary: Paths, Environment, Migrations & Application Start

### 1. Reconciled Directory Paths
All commands can be executed directly from the package root:
```bash
cd WorkByline_V2_Deployment_Package
```
Every script in `deployment/` automatically resolves the project root whether invoked from the package root (`./deployment/...`), from within `deployment/`, or from within `source/infra/deployment/`. Spaces in directory paths are safely handled via strict quoting.

### 2. Reconciled Environment Loading
All deployment scripts (`deploy_staging.sh`, `seed_synthetic_data.sh`, `verify_staging_smoke.sh`, `rollback_staging.sh`) utilize `load_env_safe()` to load variables in the following deterministic precedence:
1. `source/.env`
2. `source/.env.local`
3. `source/apps/web/.env`
4. `source/apps/web/.env.local`
Variables already exported in the shell take highest precedence and are never overwritten. Raw passwords and tokens are never printed or leaked.

For the web application process itself, Next.js natively loads `source/apps/web/.env.local` and `source/apps/web/.env`. Note that there is no root `package.json`; application dependencies and scripts reside exclusively in `source/apps/web/package.json`.

### 3. Reconciled Migration-Path Selection
`deploy_staging.sh` supports two explicit migration paths:
- **Existing Database (`--path=existing`, default)**: Verifies prerequisite baseline table `public.organizations`, then applies only unapplied migrations from `supabase/migrations/` atomically within `BEGIN ... COMMIT` blocks with version tracking.
- **Fresh Database (`--path=fresh`)**: Applies all 15 baseline migrations sequentially and atomically on an uninitialized PostgreSQL instance.

### 4. Reconciled Application Start Step
To build and start the web application service on port 3004:
```bash
cd source/apps/web
npm install
npm run build
PORT=3004 npm run start -- -p 3004
```

---

## Step-by-Step Operator Guide (Parth Handoff)

### Step 1: Environment Setup

From the package root:

```bash
# 1. Create root environment template
cp source/.env.example source/.env

# 2. Create web application environment template
cp source/apps/web/.env.example source/apps/web/.env.local

# 3. Populate target variables in source/apps/web/.env.local:
#    NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
#    NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
#    SUPABASE_SERVICE_ROLE_KEY="eyJ..."
#    DATABASE_URL="postgres://postgres:password@db.your-project.supabase.co:5432/postgres"
#    CAREERTWIN_DRY_RUN_EMAIL=true
```

### Step 2: Database Migration Deployment

Deploy forward migrations atomically (`BEGIN ... COMMIT` with `ON_ERROR_STOP=1`):

```bash
# Staging deployment (existing database)
DATABASE_URL="postgres://..." ./deployment/deploy_staging.sh --target=staging --path=existing

# Or Fresh database deployment
DATABASE_URL="postgres://..." ./deployment/deploy_staging.sh --target=staging --path=fresh

# Or Local Rehearsal (Docker container target)
./deployment/deploy_staging.sh --target=local-rehearsal
```

### Step 3: Reproducible Synthetic Data Seeding

Seed synthetic personas (Alpha & Beta employers, candidate Sarah Connor, staff profiles, and active memberships):

```bash
# Staging seed
DATABASE_URL="postgres://..." ./deployment/seed_synthetic_data.sh --target=staging

# Or Local Rehearsal
./deployment/seed_synthetic_data.sh --target=local-rehearsal
```

### Step 4: Build and Start Application Service

```bash
cd source/apps/web
npm install
npm run build
PORT=3004 npm run start -- -p 3004
```

### Step 5: Staging Smoke Verification

Verify that security boundaries, private storage, RPC signatures, and target project consistency fail closed:

```bash
# Staging smoke test (12 checks)
DATABASE_URL="postgres://..." ./deployment/verify_staging_smoke.sh --target=staging --app-url="https://your-app-url.com"

# Or Local Rehearsal
./deployment/verify_staging_smoke.sh --target=local-rehearsal --app-url="http://localhost:3004"
```

### Step 6: Authenticated Customer Journey Acceptance

Execute the complete 14-step end-to-end customer journey (40 passing assertions):

```bash
APP_URL="https://your-app-url.com" node ./deployment/run_customer_journey.js
```

### Step 7: Script Robustness & Defect Verification

Verify that all deployment and smoke scripts fail closed when credentials or tools are missing:

```bash
./deployment/test_script_defects.sh
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

1. **Revert Database RPCs and Migration Version Entries:**
   ```bash
   DATABASE_URL="postgres://..." ./deployment/rollback_staging.sh --target=staging
   ```
   *Note: Reverts database to Core-08 state. Drops `record_human_decision_transactional` (which did not exist in Core-08), restores `allocate_claim_ledger_revision_and_persist` to its Core-08 signature, and unrecords migration version entries while preserving all 187 candidates and 238 claim ledgers intact.*

2. **Deploy Paired Core-08 Application Version (Git-Independent):**
   ```bash
   mkdir -p rollback/core08_app
   tar -xzf rollback/careertwin_core08_app_archive.tar.gz -C rollback/core08_app
   cd rollback/core08_app/apps/web
   npm install
   npm run build
   PORT=3004 npm run start -- -p 3004
   ```
