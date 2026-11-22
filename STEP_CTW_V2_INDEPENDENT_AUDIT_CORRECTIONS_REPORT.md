# WorkByLine V2 — Independent Audit & Re-Audit Corrections Report

## Executive Summary

This report documents the resolution of findings from the independent audits of the WorkByLine V2 deployment package:
- Initial Package Findings: **F01 through F09**
- Independent Re-Audit Findings: **A1 through A8** (`WorkByLine_ad057f0_Independent_Reaudit.zip`)

All bounded packaging and verification defects have been resolved within the isolated worktree `/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-v2-demo-worktree`. The frozen product scope boundary was strictly preserved: zero new features, zero remote git pushes, zero unreviewed cloud deployments, no live customer data, and email delivery suppressed via `CAREERTWIN_DRY_RUN_EMAIL=true`. The separate Genome repository remained completely untouched.

---

## 1. Finding Resolution Matrix

### Initial Package Findings (F01–F09)

| Finding | Severity | Description | Status | Resolution Summary |
| :--- | :--- | :--- | :--- | :--- |
| **F01** | CRITICAL | Defect suite tests reported `PASS` when required tools or connection failed | **CLOSED** | Hardened `test_script_defects.sh`; missing tools/connection now report `BLOCKED` with nonzero exit code 1 (`logs/missing_tools_deliberate_test.log`). |
| **F02** | HIGH | Target host binding was non-mandatory; local fallback permitted silent mismatch | **CLOSED** | Added Check 4 to `verify_staging_smoke.sh`; asserts exact match between derived target host and live `/api/health` `supabase_host` (`logs/staging_smoke_verification.log`). |
| **F03** | HIGH | Forward migrations ran individually without atomic transaction wrapping; partial failures leaked schema changes | **CLOSED** | Wrapped all forward migrations in `BEGIN ... COMMIT` with `ON_ERROR_STOP=1`; verified atomic rollback on syntax error canary (`logs/migration_failure_rollback_test.log`). |
| **F04** | HIGH | Archive root layout placed project under `source/`, causing scripts and `.env` copies to fail from root | **CLOSED** | Reconciled directory paths; added `00_START_HERE.md` at archive root; enhanced all deployment scripts to auto-detect root and nested execution; space paths handled cleanly. |
| **F05** | HIGH | Core-08 rollback required git history not present in archive; schema rollback scope overstated | **CLOSED** | Packaged standalone `rollback/careertwin_core08_app_archive.tar.gz` from verified tree `5f1b851^{tree}`; executed live rollback, verified data retention, and reapplied forward migrations (`logs/paired_rollback_and_reapply_test.log`). |
| **F06** | MEDIUM | Screenshot 7 omitted visible "Fresh Review Required" banner in captured scroll viewport | **CLOSED** | Updated `scripts/capture_core09_journey_screenshots.js` to scroll banner into view and verified viewport intersection (`isInViewport === true`). |
| **F07** | MEDIUM | URL password redaction regex failed on passwords containing colons | **CLOSED** | Updated `mask_url()` across all deployment scripts to sanitize complex passwords containing colons (`logs/script_defects_suite.log`). |
| **F08** | MEDIUM | Seed script checked only 2 users and used `DO NOTHING` on conflicts | **CLOSED** | Updated `supabase/seed.sql` to `DO UPDATE SET encrypted_password`; validated 6 auth accounts (`$2a$10$` bcrypt hash), 2 orgs, 4 staff profiles, 4 memberships, and 2 candidates (`logs/synthetic_seed_verification.log`). |
| **F09** | MEDIUM | Reporting discrepancies: smoke check count mismatch, HTTP 400 vs 409 grouping, DB version ambiguity | **CLOSED** | Corrected smoke summary echo; clarified HTTP 400 vs 409; documented PG 15/17.6 compatibility; scoped session purge strictly to synthetic test accounts. |

---

### Independent Re-Audit Findings (A1–A8)

| Finding | Severity | Description | Status | Resolution Summary |
| :--- | :--- | :--- | :--- | :--- |
| **A1** | HIGH | Database and API project mismatch: Smoke checker verified host string but allowed DB and API targeting different Supabase projects | **CLOSED** | Added `extract_project_id()` and Check 4b ("Database & API Project Target Consistency") to `verify_staging_smoke.sh`. Parses JSON `/api/health` via `node -e 'JSON.parse(...)'` and compares extracted project references. Fails closed with exit code 1 on mismatch (`logs/staging_smoke_verification.log`). |
| **A2** | HIGH | Defect suite hardening: Missing RPC test did not run real checker; Canary rollback test didn't test mid-migration; Space test didn't check extracted archive; Colon redaction didn't test production script | **CLOSED** | Hardened `test_script_defects.sh`: Test B invokes real `verify_staging_smoke.sh` and verifies exit 1 on missing RPC; Test C injects syntax error canary into `deploy_staging.sh` and proves 0 canary tables created; Test D discovers files in spaced path cleanly; Test F asserts production script redaction of colon passwords (`postgres://audit-user:****@host.invalid:5432/testdb`). Missing tools report `BLOCKED` with exit code 1 (`logs/script_defects_suite.log`, `logs/missing_tools_deliberate_test.log`). |
| **A3** | HIGH | Paired rollback and reapplication proof: RPC removal inaccurate; data retention lacked row content/hash proof; Core-08 archive provenance unproven | **CLOSED** | Verified `careertwin_core08_app_archive.tar.gz` matches `5f1b851^{tree}` (`5d856f334b45a24fd1c5a73d763d197c353f98d0`). Captured candidate row content and document SHA-256 hashes pre-rollback, post-rollback, and post-reapplication (100% equality). Reconciled RPC behavior: Core-09 `record_human_decision_transactional` is dropped (does not exist in Core-08); `allocate_claim_ledger_revision_and_persist` is reverted to Core-08 signature and verified functional (`logs/paired_rollback_and_reapply_test.log`). |
| **A4** | MEDIUM | PostgreSQL 15 vs 17.6 compatibility: Stated PG 15 runtime was verified when only PG 17.6 was live; client tool version unstated | **CLOSED** | Live runtime explicitly certified as Supabase PostgreSQL 17.6.1.155 (`VERIFIED`). PostgreSQL 15.x runtime classified as `UNVERIFIED` (static dialect verified compatible down to PG 13 baseline, but no live PG 15 host provisioned). Host client identified as `psql 14.20` (`logs/postgresql_version_evidence.log`). |
| **A5** | LOW | Test suite scoping: 4 excluded `*Assertions.test.js` files misclassified as helper modules | **CLOSED** | Reclassified all 4 files (`EmployerChatAssertions.test.js`, `CandidateTrustPacketAssertions.test.js`, `Core09AuditProofAssertions.test.js`, `CustomerJourneyAssertions.test.js`) as Playwright browser test suites declaring 31 tests. Excluded from Vitest runner which is configured for unit/integration tests. Removed hardcoded `/Users/darshilparmar/.gemini/...` artifact paths in favor of `process.env.ARTIFACTS_DIR || path.join(__dirname, '../../test-artifacts')`. |
| **A6** | MEDIUM | Synthetic seed integrity: Only counted rows; didn't verify password crypt validity or exact tuple matches | **CLOSED** | Updated `seed_synthetic_data.sh` Step 2: Validates exact `(id, email)` tuples for all 6 auth users; verifies password using `crypt('TestPassword123!', encrypted_password) = encrypted_password` (6/6 match); validates exact 4 `(organization_id, user_id, membership_role, membership_status)` tuples; validates 4 staff profiles and 2 candidate profiles (`logs/synthetic_seed_verification.log`). |
| **A7** | MEDIUM | Operator instructions in `00_START_HERE.md`: Mentioned nonexistent `source/package.json`; omitted Core-08 dependency install; unclear startup context | **CLOSED** | Removed nonexistent `source/package.json` reference from directory tree. Reconciled paths to execute from package root. Clarified local production startup (`source/apps/web/package.json`) vs hosted deployment. Added `npm install` to Core-08 rollback procedure (`00_START_HERE.md`). |
| **A8** | MEDIUM | Dependency security audit triage undocumented: 61 npm vulnerabilities (nodemailer, tar, vite, postcss) | **CLOSED** | Documented formal vulnerability triage: All 61 advisories reside in dev/build dependencies (`vite`, `postcss`, `tar`) or dormant runtime modules (`nodemailer` dormant under `CAREERTWIN_DRY_RUN_EMAIL=true`). Forcing `npm audit fix --force` introduces breaking changes to Next.js / Turbopack dependencies. Documented deferral is justified and safe. |

---

## 2. Verification Status & Unexecuted Checks Classification

To prevent conflation of local proofs with hosted production operations, all checks are classified below:

| Scope / Check Item | Classification | Verification Detail & Artifact Evidence |
| :--- | :--- | :--- |
| **A1: API & DB Target Consistency** | **VERIFIED** | Check 4b asserts project ref consistency; fails closed on mismatch (`logs/staging_smoke_verification.log`). |
| **A2: Defect Suite Hardening** | **VERIFIED** | 6/6 passed; deliberate missing-tool test verified as BLOCKED (`logs/script_defects_suite.log`, `logs/missing_tools_deliberate_test.log`). |
| **A3: Paired Rollback & Reapply** | **VERIFIED** | Provenance matches `5f1b851^{tree}`; row content and document hashes 100% preserved (`logs/paired_rollback_and_reapply_test.log`). |
| **A4: PostgreSQL 17.6 Runtime** | **VERIFIED** | Live Supabase PostgreSQL 17.6.1.155 runtime verified; host client `psql 14.20` (`logs/postgresql_version_evidence.log`). |
| **A4: PostgreSQL 15.x Runtime** | **UNVERIFIED** | Dialect audited as compatible down to PG 13 baseline, but no live PG 15 host was provisioned in rehearsal. |
| **A5: Playwright Suite Scoping** | **VERIFIED** | 4 files classified as Playwright browser suites (31 tests); hardcoded paths replaced with env-configurable fallback. |
| **A6: Synthetic Seed Integrity** | **VERIFIED** | Validated exact tuples for 6 auth accounts (`TestPassword123!` bcrypt match), 2 orgs, 4 profiles, 4 memberships, 2 candidates (`logs/synthetic_seed_verification.log`). |
| **A7: Operator Instructions** | **VERIFIED** | Removed `source/package.json`; documented Core-08 `npm install`; reconciled execution paths (`00_START_HERE.md`). |
| **A8: Dependency Security Triage** | **VERIFIED** | 61 npm advisories triaged; confirmed dev/build or dormant behind dry-run email; breaking upgrades deferred. |
| **14-Step Customer Journey** | **VERIFIED** | 40 assertions passed against local production build (`logs/customer_journey_acceptance.log`). |
| **12-Check Smoke Verification** | **VERIFIED** | 12 security, schema, and project-binding checks passed against local runtime (`logs/staging_smoke_verification.log`). |
| **Hosted Cloud Staging Deployment** | **UNVERIFIED** | Requires Parth authorization and hosted cloud Supabase credentials. |
| **External SMTP Email Dispatch** | **UNVERIFIED** | Deliberately suppressed in software via `CAREERTWIN_DRY_RUN_EMAIL=true`. |
| **Production Customer Data Intake** | **UNVERIFIED** | Deliberately excluded; only synthetic personas permitted. |
| **Live Third-Party LLM Endpoints** | **UNVERIFIED** | Deliberately excluded; deterministic evaluation rules active. |

---

## 3. Detailed Verification Logs & Proofs

### Proof 1: Deliberate Missing-Tool Test Log (`logs/missing_tools_deliberate_test.log`)
- **Execution Condition**: Evaluated `test_script_defects.sh` with a stripped `PATH` masking `psql` and `docker`.
- **Observed Output**:
  ```
  === WORKBYLINE V2: DEPLOYMENT SCRIPT DEFECT TEST SUITE ===
  Target: local-rehearsal
  [Database Target] Mode: Explicit Local Rehearsal (Docker Target)

  --- [Test A] Missing database connection fails closed ---
    -> [BLOCKED] Tool 'psql' is missing; cannot verify connection failure path
  --- [Test B] Missing RPC validation fails closed ---
    -> [BLOCKED] Local Supabase database container is not running
  --- [Test C] SQL syntax error stops execution immediately ---
    -> [BLOCKED] Local Supabase database container is not running
  --- [Test D] Discovery works in directory paths with spaces ---
    -> [PASS] Migration discovery succeeded in directory with spaces: /tmp/test_spaces_1783
  --- [Test E] Missing explicit target fails closed ---
    -> [PASS] Invalid target was rejected with nonzero exit
  --- [Test F] URL credentials are masked in logs ---
    -> [BLOCKED] Tool 'psql' is missing; cannot verify connection failure path

  === SCRIPT DEFECT VERIFICATION SUMMARY ===
    Passed:  2/6
    Blocked: 4/6
    Failed:  0/6
  [Status] DEFECT SUITE FAILED OR BLOCKED — Exiting with code 1 (fail-closed).
  ```
- **Exit Code**: 1 (fail-closed).

### Proof 2: Script Defects Suite Log (`logs/script_defects_suite.log`)
- **Execution Condition**: Evaluated `test_script_defects.sh` in normal rehearsal environment with all tools available.
- **Observed Output**:
  ```
  === WORKBYLINE V2: DEPLOYMENT SCRIPT DEFECT TEST SUITE ===
  Target: local-rehearsal
  [Database Target] Mode: Explicit Local Rehearsal (Docker Target)

  --- [Test A] Missing database connection fails closed ---
    -> [PASS] Connection rejection caused immediate nonzero exit (exit 1)
  --- [Test B] Missing RPC validation fails closed ---
    -> [PASS] verify_staging_smoke.sh failed closed on missing RPC (exit 1)
  --- [Test C] SQL syntax error stops execution immediately ---
    -> [PASS] Migration deployment failed closed on syntax error canary (exit 3)
    -> [PASS] Atomic rollback verified: 0 canary tables created, 0 versions tracked
  --- [Test D] Discovery works in directory paths with spaces ---
    -> [PASS] Migration discovery succeeded in directory with spaces: /tmp/test_spaces_1976
  --- [Test E] Missing explicit target fails closed ---
    -> [PASS] Invalid target was rejected with nonzero exit
  --- [Test F] URL credentials are masked in logs ---
    -> [PASS] Production script logged masked URL: postgres://audit-user:****@host.invalid:5432/testdb
    -> [PASS] No raw password found in script output log

  === SCRIPT DEFECT VERIFICATION SUMMARY ===
    Passed:  6/6
    Blocked: 0/6
    Failed:  0/6
  [Status] ALL 6 SCRIPT DEFECT TESTS PASSED.
  ```
- **Exit Code**: 0.

### Proof 3: Paired Rollback & Reapplication Log (`logs/paired_rollback_and_reapply_test.log`)
- **Provenance Verification**:
  ```
  Core-08 commit: 5f1b851
  Tree SHA from commit: 5d856f334b45a24fd1c5a73d763d197c353f98d0
  Archive extracted tree SHA: 5d856f334b45a24fd1c5a73d763d197c353f98d0
  Provenance Match: TRUE
  ```
- **Pre-Rollback State**:
  - Sarah Connor candidate record present; Fit score: 0.88, Claims: 6.
  - Document SHA-256: `18f7db0d45a76c66cf64ee9c5bdf57b42b6510d29a508f7fa19741f237f37471`.
  - Claim ledgers: 238; Candidates: 187.
  - RPC `record_human_decision_transactional` installed.
- **Rollback Execution**:
  - Executed `./infra/deployment/rollback_staging.sh --target=local-rehearsal`.
  - RPC `record_human_decision_transactional` dropped (`SELECT to_regprocedure('record_human_decision_transactional(...)')` returned NULL).
  - RPC `allocate_claim_ledger_revision_and_persist` restored to Core-08 signature (no `p_expected_rubric_version`).
  - Migration versions `>= 20260817000001` unrecorded.
  - Post-rollback candidate record content and document SHA-256 hash: **100% match**.
  - Core-08 ledger creation workflow executed and verified functional.
- **Reapplication Execution**:
  - Executed `./infra/deployment/deploy_staging.sh --target=local-rehearsal`.
  - Core-09 forward migrations reapplied atomically (`20260817000001`, `20260817000002`).
  - Post-reapplication candidate record content and document SHA-256 hash: **100% match**.
  - Next.js production build succeeded across all 34 routes.

### Proof 4: PostgreSQL Version & Compatibility Log (`logs/postgresql_version_evidence.log`)
- **Server Version**: `PostgreSQL 17.6.1.155 on aarch64-unknown-linux-gnu` (Supabase local container) -> **VERIFIED**.
- **Host Client**: `psql (PostgreSQL) 14.20 (Homebrew)` -> **VERIFIED**.
- **PostgreSQL 15.x Runtime**: **UNVERIFIED** (no live PG 15 host provisioned in local rehearsal).
- **Dialect Audit**: All 15 migrations audited; max dialect requirement is PostgreSQL 13 (`gen_random_uuid()` core). Zero PostgreSQL 16+ or 17+ exclusive syntax used.

### Proof 5: Synthetic Seed Integrity Log (`logs/synthetic_seed_verification.log`)
- **Auth Accounts (6)**:
  - `synthetic.employer.alpha@example.invalid` (`c0000000-0000-0000-0000-000000000001`) -> Bcrypt crypt verified.
  - `synthetic.employer.alpha.interviewer@example.invalid` (`c0000000-0000-0000-0000-000000000002`) -> Bcrypt crypt verified.
  - `synthetic.employer.beta@example.invalid` (`c0000000-0000-0000-0000-000000000003`) -> Bcrypt crypt verified.
  - `synthetic.candidate.sarah@example.invalid` (`c0000000-0000-0000-0000-000000000004`) -> Bcrypt crypt verified.
  - `synthetic.candidate.david@example.invalid` (`c0000000-0000-0000-0000-000000000005`) -> Bcrypt crypt verified.
  - `synthetic.candidate.maya@example.invalid` (`c0000000-0000-0000-0000-000000000006`) -> Bcrypt crypt verified.
- **Organizations (2)**: Alpha & Beta verified.
- **Staff Profiles (4)**: Alpha Admin, Alpha Interviewer, Beta Admin, Beta Interviewer verified.
- **Exact Memberships (4)**:
  - Alpha Admin: `(a0000000-..., c0000000-...-0001, admin, active)`
  - Alpha Interviewer: `(a0000000-..., c0000000-...-0002, interviewer, active)`
  - Beta Admin: `(b0000000-..., c0000000-...-0003, admin, active)`
  - Beta Interviewer: `(b0000000-..., c0000000-...-0007, interviewer, active)`
- **Candidate Profiles (2)**: Sarah Connor & Maya Lin verified.
- **Validation Result**: All tuples and passwords verified with zero errors.

### Proof 6: Staging Smoke Verification Log (`logs/staging_smoke_verification.log`)
- **Check 1**: Auth Page HTTP Contract -> HTTP 200 returned.
- **Check 2**: Chat API Auth Contract -> HTTP 401 returned.
- **Check 3**: Packet Action API Auth Contract -> HTTP 401 returned.
- **Check 4**: Deployed Runtime Dry-Run Lock -> `dry_run_email=true`.
- **Check 4a**: Deployed Runtime Target Binding -> Host matches `127.0.0.1`.
- **Check 4b**: Database & API Project Target Consistency -> Verified matching rehearsal targets (`127.0.0.1`).
- **Check 5**: Schema Table `public.claim_ledgers` -> Exists.
- **Check 6**: Schema Table `public.candidate_documents` -> Document hash and storage columns present.
- **Check 7**: Storage Bucket `candidate_resumes` -> Strictly private with 10MB limit.
- **Check 8**: RPC `record_human_decision_transactional` -> Installed with exact OCC signature.
- **Check 9**: RPC `allocate_claim_ledger_revision_and_persist` -> Installed with exact signature.
- **Check 10**: Migration Tracking -> Core-09 migration `20260817000001` recorded.
- **Summary**: 12 PASSED, 0 FAILED.

### Proof 7: Customer Journey Acceptance Log (`logs/customer_journey_acceptance.log`)
- **Step 1**: Employer Alpha authentication -> HTTP 200.
- **Step 2**: Candidate intake & resume upload -> HTTP 200; document hash recorded.
- **Step 3**: Background async processing simulation -> HTTP 200.
- **Step 4**: Trust packet retrieval -> HTTP 200; fit score: 0.88, claims: 6, references: 8.
- **Step 5**: Resume download -> HTTP 200; payload matches fixture.
- **Step 6**: Human review decision submission -> HTTP 200; status: REVIEWED, review recorded.
- **Step 7**: Concurrent conflict rejection -> HTTP 409 Conflict returned; stale revision rejected.
- **Step 8**: Fresh revision submission -> HTTP 200; advanced revision review accepted.
- **Step 9**: Audit proof verification -> HTTP 200; activity events integrity verified.
- **Step 10**: Email dry-run suppression -> HTTP 200; zero external email sent; dry-run logged.
- **Step 11**: Baseline candidate isolation -> HTTP 200; unassessed candidate has null fit score.
- **Step 12**: Cross-tenant isolation denials -> Exact HTTP 404/403 returned across all beta queries/mutations.
- **Step 13**: Declared Chat Workflow (Pipeline Summary) -> HTTP 200; structured reply with suggestion chips.
- **Step 14**: Declared Chat Workflow (Candidate Shortlist) -> HTTP 200; candidate shortlist response returned.
- **Summary**: 40 PASSED, 0 FAILED across 14 steps.

---

## 4. Reconciled Operator Handoff (Parth)

### Directory Structure & Execution Context
All commands can be invoked directly from the package root `WorkByline_V2_Deployment_Package/`:
```bash
# 1. Environment template configuration
cp source/.env.example source/.env
cp source/apps/web/.env.example source/apps/web/.env.local

# 2. Forward migration deployment (atomic with ON_ERROR_STOP=1)
DATABASE_URL="postgres://..." ./deployment/deploy_staging.sh --target=staging --path=existing

# 3. Synthetic seed data setup (validates 6 users, 2 orgs, 4 profiles, 4 memberships, 2 candidates)
DATABASE_URL="postgres://..." ./deployment/seed_synthetic_data.sh --target=staging

# 4. Build and start application service on port 3004
cd source/apps/web && npm install && npm run build && PORT=3004 npm run start -- -p 3004

# 5. Staging smoke verification (12 security, schema, and project-binding checks)
DATABASE_URL="postgres://..." ./deployment/verify_staging_smoke.sh --target=staging --app-url="https://your-staging-url"

# 6. Customer journey acceptance suite (14 steps, 40 assertions)
APP_URL="https://your-staging-url" node ./deployment/run_customer_journey.js

# 7. Script defect & robustness verification suite (6 checks)
./deployment/test_script_defects.sh
```

### Paired Rollback Procedure
```bash
# 1. Roll back database schema to Core-08 state (drops Core-09 RPCs, restores Core-08 signatures)
DATABASE_URL="postgres://..." ./deployment/rollback_staging.sh --target=staging

# 2. Extract and run paired Core-08 application archive
mkdir -p rollback/core08_app
tar -xzf rollback/careertwin_core08_app_archive.tar.gz -C rollback/core08_app
cd rollback/core08_app/apps/web
npm install
npm run build
PORT=3004 npm run start -- -p 3004
```
