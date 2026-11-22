# Step 4B5.2-D2C-R3.1 — Staging RLS Discrepancy Diagnosis & Correction Report

**Date:** 2026-08-10  
**Baseline Commit:** `1ecccc8273f75866d91dc889dd38a1e93ab5b2f4`  
**Branch:** `antigravity/step4b2-frontend-parity`  
**Target Staging Project:** `headwayos-secondary` (masked ref: `phli...xskd`), Region: `ap-northeast-2`, Status: `ACTIVE_HEALTHY`  
**Execution Mode:** Remote HTTPS execution against hosted Supabase staging instance via publishable key + user JWTs.

---

## Executive Summary

Step 4B5.2-D2C-R3.1 established the root causes for the two RLS SELECT discrepancies identified during D2C-R3, deployed a targeted SQL schema migration (`20260805000001_fix_staging_rls_discrepancies.sql`), and re-executed the live remote validation suite to achieve **100% pass rate (12/12 subtests)** across all publicly executable Auth and RLS security boundaries.

Key Accomplishments:
1. **Root Cause Analysis & SQL Fixes**:
   - **`organizations` SELECT Policy**: Confirmed that `organizations_select` was dropped via `CASCADE` when migration `20260804000001` dropped legacy function `public.is_org_member(UUID, UUID)`. Restored policy using schema helper `security.is_org_member(id) OR created_by = auth.uid()`.
   - **`candidates` Candidate Self-Read Policy**: Confirmed that `candidates_self_access` was dropped in migration `20260804000001` and `candidates_org_select` only permitted `security.is_hiring_run_member(hiring_run_id)`. Updated SELECT policy to permit `candidate_id = auth.uid() OR security.is_hiring_run_member(hiring_run_id)`.
2. **Migration Deployment**: Applied migration `20260805000001_fix_staging_rls_discrepancies.sql` to remote staging via Supabase CLI (`npx supabase db push --linked`).
3. **100% Live Test Pass Rate (12/12)**:
   - All 12 subtests in `StagingRemoteRuntimeValidation.test.js` passed cleanly against hosted staging.
   - Total Live HTTPS Requests: **134**
   - Authorization Assertions Passed: **40**
   - Permitted Operations Executed: **6**
   - Denied Operations Enforced: **52**
   - Denied Mutations with Verified Equal Hashes / Absence Proofs: **25**
   - Anonymous Table Checks Passed: **13/13**
   - Targeted Execution Duration: **26,410ms**
4. **Sanitization Compliance**: Masked all project references (`phli...xskd`) and omitted raw project-list outputs containing unmasked references per founder instruction.

---

## Root Cause & Remediation Summary

| Table | Issue Observed in D2C-R3 | Identified Root Cause | Deployed SQL Remediation (`20260805000001.sql`) | Re-Test Result |
| :--- | :--- | :--- | :--- | :--- |
| `organizations` | `GET /organizations` returned 0 rows for creator | Legacy `is_org_member` function dropped with `CASCADE` in `20260804000001`, dropping `organizations_select` policy without recreation. | Restored `organizations_select` policy using `security.is_org_member(id) OR created_by = auth.uid()`. | **PASS** (1 row returned) |
| `candidates` | `GET /candidates` returned 0 rows for self candidate | `candidates_self_access` dropped in `20260804000001` and replaced with employer-only `is_hiring_run_member`. | Updated `candidates_select` policy to include `candidate_id = auth.uid() OR security.is_hiring_run_member(hiring_run_id)`. | **PASS** (1 row returned) |

---

## Live Targeted Subtest Execution Breakdown (12/12 Passed)

| Subtest | Target Feature / Security Boundary | Status | Execution Metrics / Proof |
| :--- | :--- | :--- | :--- |
| **1. Auth Verification** | 6 Synthetic Password Sign-ins + `/auth/v1/user` | **PASS** | 6/6 users authenticated, tokens issued, identities verified |
| **2. Profiles & Fixtures** | Profile inventory & relationship validation | **PASS** | 6/6 profiles verified against deterministic UUIDs |
| **3. Org & Memberships** | Org read, membership recruiter/auditor denial | **PASS** | Org SELECT succeeded (1 row); recruiter/auditor denials enforced with before/after state proof |
| **4. Profiles Security** | Own update allowed; cross-user & protected fields denied | **PASS** | Own update succeeded; cross-user & protected columns (`role`, `gmail_*`) denied with state equality proof |
| **5. Hiring Runs** | Employer read allowed; cross-tenant & auditor write denied | **PASS** | Employer read succeeded; Beta read denied; Auditor write denied with state equality proof |
| **6. Sourcing Sessions** | Employer read allowed; cross-tenant & candidate write denied | **PASS** | Employer read succeeded; Beta read denied; Candidate write denied with state equality proof |
| **7. Candidate Isolation** | Candidate self-read, cross-candidate & employer isolation | **PASS** | Candidate 1 self-read succeeded (1 row); Candidate 2 & employer cross-reads denied |
| **8. Screening Sessions** | Candidate read session & write answer; cross-session write denied | **PASS** | Candidate answer write succeeded; cross-session write & answer delete denied with state proof |
| **9. Activity Events** | Client write denial & deferred positive tenant-read | **PASS** | Client write denied (`403`); positive read explicitly DEFERRED |
| **10. Scheduled Emails** | Complete client access restriction (`REVOKE ALL`) | **PASS** | SELECT, INSERT, UPDATE, DELETE denied (`401`/`403`/`404`) with schema-valid payloads |
| **11. Anonymous RLS** | Anonymous publishable-key access across 13 public tables | **PASS** | 13/13 tables returned zero rows or access denial |
| **12. Execution Metrics** | Final metrics aggregation and log assertions | **PASS** | Metrics validated: 134 HTTPS requests, 40 assertions, 13/13 anon checks |

---

## Quality Gate Verification

| Quality Gate | Command Executed | Result |
| :--- | :--- | :--- |
| **Targeted Staging Suite** | `CAREERTWIN_RUN_STAGING_TESTS=1 npm exec --offline vitest run __tests__/staging/StagingRemoteRuntimeValidation.test.js` | **PASS** (12/12 subtests passed live against hosted staging) |
| **Canonical Vitest Suite** | `unset CAREERTWIN_RUN_STAGING_TESTS && npm exec --offline vitest run` | **PASS** (19 files passed, 221 tests passed, 1 file / 1 test safely skipped) |
| **ESLint Audit** | `npm exec --offline eslint -- .` | **PASS** (0 errors, 3 warnings) |
| **Next.js Production Build** | `npm run build` | **PASS** (Compiled in 9.9s, static generation 31/31) |

---

## Final Integrity Confirmation

- Auth Admin API calls: **0**
- Service-role key usage: **0**
- Secret key usage: **0**
- Production application code changes: **0**
- API-route changes: **0**
- Server-auth-helper changes: **0**
- Deployment: **0**
- Git remotes configured: **0**
- Git push: **0**

---

## Readiness Classification

**State A — All publicly executable Auth/RLS scenarios passed remotely; only documented server-fixture activity-event positive-read remains deferred.**

---

## Founder Review Requested

Founder review is requested for formal acceptance of the Step 4B5.2-D2C-R3.1 State A checkpoint.
