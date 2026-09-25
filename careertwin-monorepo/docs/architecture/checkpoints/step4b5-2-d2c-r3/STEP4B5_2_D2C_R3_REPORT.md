# Step 4B5.2-D2C-R3 — Live Remote Auth & RLS Matrix Execution Report

**Date:** 2026-08-10  
**Baseline Commit:** `f4ed476e69c5fb44704e05a430aaabba6e89ade4`  
**Branch:** `antigravity/step4b2-frontend-parity`  
**Target Staging Project:** `headwayos-secondary` (masked ref: `phli...xskd`), Region: `ap-northeast-2`, Status: `ACTIVE_HEALTHY`  
**Execution Mode:** Live remote HTTPS network execution against hosted Supabase staging instance via publishable key + user JWTs.

---

## Executive Summary

Step 4B5.2-D2C-R3 executed the live remote GoTrue authentication and RLS security validation matrix against the real hosted staging Supabase environment (`headwayos-secondary` in `ap-northeast-2`).

Key Execution Findings:
1. **Authentication (6/6 Success)**: All six synthetic Auth identities authenticated successfully via password sign-in (`POST /auth/v1/token?grant_type=password`), received valid JWT access tokens, passed `/auth/v1/user` verification, and matched expected memory identity attributes. Zero public signup fallback calls occurred.
2. **Sanitized Execution Metrics**:
   - Total Live HTTPS Requests: **123**
   - Authorization Assertions Passed: **40**
   - Permitted Operations Executed: **4**
   - Denied Operations Enforced: **44**
   - Denied Mutations with Verified State Proofs (`hashBefore === hashAfter` or absence): **20**
   - Anonymous Table Checks Passed: **13/13**
   - Targeted Execution Duration: **25,166ms**
   - Mocked Network Calls: **0**
3. **Activity Event Server Boundary**: Client `POST /activity_events` mutation denial was successfully tested and proven (`403 Forbidden`). Positive tenant-read validation remains explicitly **DEFERRED** as it requires a server-originated background worker fixture.
4. **Discovered RLS Schema Discrepancy (State B Driver)**:
   - On the hosted database schema, `organizations` table lacks a `organizations_select` policy because `DROP FUNCTION public.is_org_member(UUID, UUID) CASCADE` in migration `20260804000001` dropped the previous policy without recreating it.
   - Consequently, `GET /organizations` is denied by default RLS policies (`200 []`), preventing client reads of organization records.

---

## Live Subtest Execution Breakdown

| Subtest | Target Feature / Security Boundary | Status | Detailed Result |
| :--- | :--- | :--- | :--- |
| **1. Auth Verification** | 6 Synthetic Password Sign-ins + `/auth/v1/user` | **PASS** | 6/6 users authenticated, tokens issued, identities verified |
| **2. Profiles & Fixtures** | Profile inventory & relationship validation | **PASS** | 6/6 profiles verified against deterministic UUIDs |
| **3. Org & Memberships** | Org read, membership recruiter/auditor denial | **FAIL** | Recruiter/Auditor denials passed; Org SELECT returned `0` rows due to missing RLS SELECT policy |
| **4. Profiles Security** | Own update allowed; cross-user & protected fields denied | **PASS** | Own update succeeded; cross-user & protected columns (`role`, `gmail_*`) denied with state equality proof |
| **5. Hiring Runs** | Employer read allowed; cross-tenant & auditor write denied | **PASS** | Employer read succeeded; Beta read denied; Auditor write denied with state equality proof |
| **6. Sourcing Sessions** | Employer read allowed; cross-tenant & candidate write denied | **PASS** | Employer read succeeded; Beta read denied; Candidate write denied with state equality proof |
| **7. Candidate Isolation** | Candidate self-read, cross-candidate & employer isolation | **FAIL** | Cross-candidate & employer isolation passed; candidate self-read returned `0` rows |
| **8. Screening Sessions** | Candidate read session & write answer; cross-session write denied | **PASS** | Candidate answer write succeeded; cross-session write & answer delete denied with state proof |
| **9. Activity Events** | Client write denial & deferred positive tenant-read | **PASS** | Client write denied (`403`); positive read explicitly DEFERRED |
| **10. Scheduled Emails** | Complete client access restriction (`REVOKE ALL`) | **PASS** | SELECT, INSERT, UPDATE, DELETE denied (`401`/`403`/`404`) with schema-valid payloads |
| **11. Anonymous RLS** | Anonymous publishable-key access across 13 public tables | **PASS** | 13/13 tables returned zero rows or access denial |
| **12. Execution Metrics** | Final metrics aggregation and log assertions | **PASS** | Metrics validated: 123 HTTPS requests, 40 assertions, 13/13 anon checks |

---

## Quality Gate Verification

| Quality Gate | Command Executed | Result |
| :--- | :--- | :--- |
| **Targeted Staging Run** | `CAREERTWIN_RUN_STAGING_TESTS=1 npm exec --offline vitest run __tests__/staging/StagingRemoteRuntimeValidation.test.js` | **Executed Live** (10 passed, 2 failed due to DB schema RLS policies) |
| **Canonical Vitest Suite** | `unset CAREERTWIN_RUN_STAGING_TESTS && npm exec --offline vitest run` | **PASS** (19 files passed, 221 tests passed, 1 file / 1 test safely skipped) |
| **ESLint Audit** | `npm exec --offline eslint -- .` | **PASS** (0 errors, 3 warnings) |
| **Next.js Production Build** | `npm run build` | **PASS** (Compiled in 9.3s, static generation 31/31) |

---

## Final Integrity Confirmation

- Database schema changes: **0**
- Alembic / SQL migrations applied: **0**
- Database resets: **0**
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

**State B — Auth succeeded but one or more executable RLS scenarios failed.**

---

## Founder Review Requested

Founder review is requested for formal acceptance of the Step 4B5.2-D2C-R3 State B report and findings.
