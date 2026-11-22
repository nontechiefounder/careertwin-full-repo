# Step 4B5.2-D2B-R1 — Staging Database Reinitialization & Deployment Report

**Date:** 2026-08-05  
**Baseline Commit:** `6ce429f` — docs(database): verify isolated staging migration preflight  
**Target Isolated Staging Project:** `headwayos-secondary` (`phli...xskd`), Region: `ap-northeast-2`  
**Execution Status:** **State A — Disposable staging was reset successfully and now matches the approved CareerTWiN authorization schema.**  

---

## 1. Local Baseline & Linked Project Identity Verification

| Check | Result |
|---|---|
| Git Branch | `antigravity/step4b2-frontend-parity` |
| HEAD Commit | `6ce429f` |
| Working Tree | Clean |
| Git Remote | None — 0 remotes configured |
| Docker Engine | 29.6.2 (Healthy) |
| Local Supabase Stack | Healthy (`http://127.0.0.1:54331`) |
| Vitest Suite | **19/19 test files passed, 221/221 tests passed** |
| ESLint Gate | **0 errors**, 3 pre-existing warnings |
| Production Build | **Passed (green)** |
| Linked Project Name | `headwayos-secondary` |
| Linked Region | `ap-northeast-2` |
| Masked Reference | `phli...xskd` |
| Project Status | `ACTIVE_HEALTHY` (Disposable Staging) |

---

## 2. Sanitized Pre-Reset Inventory

Pre-reset schema inventory confirmed the presence of 13 abandoned, user-created job-data tables from prior test activities:
- `_JobSkills`, `cities`, `companies`, `countries`, `job_data_100_sample`, `job_sources`, `jobs`, `leads`, `locations`, `refresh_runs`, `roles`, `skills`, `states`

Zero CareerTWiN tables existed prior to reset. Zero unexpected tables existed outside the founder-approved disposable set.

---

## 3. Approved Migrations & Execution

The single authorized command `npx supabase db reset --linked --no-seed --yes` was executed against `phli...xskd`.

**Applied Approved Migrations (in exact order):**
1. `20260803000001_operational_schema_baseline.sql`
2. `20260803000002_organization_and_rls_hardening.sql`
3. `20260803000003_organization_authorization_completion.sql`
4. `20260804000001_staging_authorization_blockers.sql`

- **Seed Execution:** Excluded (`--no-seed` flag applied).
- **Roles / Additional Scripts:** Excluded (`roles: []`).
- **Execution Result:** `"message": "Reset remote database."`

---

## 4. Post-Reset Migration History & Linked DB Lint

- **Migration History (`npx supabase migration list --linked`):** All 4 versions (`20260803000001`, `20260803000002`, `20260803000003`, `20260804000001`) exist in both local and remote history with zero divergence.
- **Linked Database Lint (`npx supabase db lint --linked`):** **No schema errors found** across `extensions`, `public`, and `security` schemas.

---

## 5. Post-Reset Schema & Security Verification

| Integrity Requirement | Status | Verification Detail |
|---|---|---|
| Abandoned Tables Removal | **Verified** | 0 abandoned tables remain in `public` schema |
| CareerTWiN Application Tables | **Verified** | 13 tables exist (`organizations`, `organization_memberships`, `hiring_runs`, `profiles`, `candidates`, `candidate_profiles`, `proof_profiles`, `sourcing_sessions`, `screening_sessions`, `screening_answers`, `screening_summaries`, `activity_events`, `scheduled_emails`) |
| Organization Context | **Verified** | `organizations`, `organization_memberships`, and `hiring_runs.org_id` exist with 18 Foreign Keys |
| Row-Level Security | **Verified** | RLS enabled on all 13 public application tables (`rowsecurity = true`) |
| RLS Active Policies | **Verified** | 23 active security policies enforced in `public` schema |
| Non-Exposed Security Schema | **Verified** | `security` schema exists containing 5 `SECURITY DEFINER` helper functions |
| RPC Isolation | **Verified** | Zero authorization helpers remain in `public`. Helper `EXECUTE` granted strictly to `authenticated` |
| Restricted Profile Columns | **Verified** | Direct `INSERT`/`UPDATE` on `role` and `gmail_*` columns denied to `authenticated` |
| Candidate Session Mutation | **Verified** | `screening_sessions` direct `UPDATE`/`INSERT` denied to candidates |
| Internal Queue Protection | **Verified** | `scheduled_emails` direct client access (`SELECT`/`INSERT`/`UPDATE`/`DELETE`) denied to `anon`/`authenticated` |
| Zero Seed Data | **Verified** | Row counts across all 13 application tables = 0 |

---

## 6. Remote Data & Service Boundary

- Abandoned user-created tables remaining: **0**
- Seed rows inserted: **0**
- Application rows inserted: **0**
- Real candidate or employer records inserted: **0**
- Auth users created: **0**
- Storage buckets/objects created: **0**
- OAuth provider changes: **0**
- API keys retrieved: **0**
- Application connected: **0**
- AI providers invoked: **0**

---

## 7. Credential Safety Audit

| Safety Criteria | Count |
|---|---|
| Credential values printed in console or logs | 0 |
| Credential values stored in documentation | 0 |
| Credential values committed to Git | 0 |
| Remote API keys read | 0 |
| Remote database passwords read | 0 |
| Remote JWT secrets or JWKS values read | 0 |

---

## 8. Readiness Declaration

**State A:** Disposable staging was reset successfully and now matches the approved CareerTWiN authorization schema.
