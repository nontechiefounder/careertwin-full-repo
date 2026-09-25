# Step 4B5.3-A — Sensitive Route Authorization & Server Fixture Architecture Inspection Report

**Date:** 2026-08-11  
**Baseline Commit:** `c0e010ad1f8f63bef40d211e55494a7ee35e12f3`  
**Branch:** `antigravity/step4b2-frontend-parity`  
**Target Staging Project:** `headwayos-secondary` (masked ref: `phli...xskd`), Region: `ap-northeast-2`, Status: `ACTIVE_HEALTHY`  
**Scope:** Read-Only Architectural Inspection & Route Authorization Inventory (Step 4B5.3-A Checkpoint)

---

## Executive Summary

Step 4B5.3-A conducted an exhaustive, read-only inspection of all 28 API route handlers in `apps/web/app/api/`, existing server authentication mechanisms (`lib/supabaseServer.js`), and database table RLS definitions. This inspection establishes the precise architectural design for sensitive route authorization hardening and server-originated fixture integration prior to making any code modifications.

Key Inspection Findings:
1. **API Route Inventory & Current Authentication Coverage (28 Routes)**:
   - **Currently Authenticated Routes (15/28)**: Call `createSupabaseServerClient(request)` and verify `getUser()`, returning HTTP `401 Unauthorized` if missing/invalid session:
     * `/api/auth/me` (GET)
     * `/api/employer/analytics` (GET)
     * `/api/employer/brief/[id]` (GET)
     * `/api/employer/candidate-extractions` (POST)
     * `/api/employer/chat` (POST)
     * `/api/employer/hiring-runs` (GET, POST)
     * `/api/employer/hiring-runs/suggest` (POST)
     * `/api/employer/packets/[extractionId]/action` (POST)
     * `/api/employer/shortlist/[roleId]` (GET)
     * `/api/employer/sourcing-sessions` (POST)
     * `/api/employer/sourcing-sessions/[id]` (GET)
     * `/api/employer/sourcing-sessions/[id]/auto-source` (POST)
     * `/api/integrations/gmail/connect` (GET)
     * `/api/search` (GET)
   - **Intentionally Public Endpoints (4/28)**: Public Auth flow or OAuth callback URLs:
     * `/api/auth/confirm` (GET)
     * `/api/auth/signin` (POST)
     * `/api/auth/signup` (POST)
     * `/api/integrations/gmail/callback` (GET)
   - **Unprotected Sensitive / Fallback Routes (9/28)**: Perform database operations or return mock fallback payloads without verifying `getUser()` beforehand:
     * `/api/candidate/proof-profile/[candidateId]` (GET)
     * `/api/candidate/proof-profile/[candidateId]/generate` (POST)
     * `/api/candidate/screening-sessions/[sessionId]` (GET)
     * `/api/candidate/screening-sessions/[sessionId]/start` (POST)
     * `/api/candidate/screening-sessions/[sessionId]/answer` (POST)
     * `/api/candidate/screening-sessions/[sessionId]/complete` (POST)
     * `/api/candidate/status/[candidateId]` (GET)
     * `/api/employer/packets/[extractionId]` (GET)
     * `/api/employer/packets/[extractionId]/generate` (POST)

2. **Screening Invitation Token vs Authenticated Access Model**:
   - Candidate screening sessions (`screening_sessions`) represent invitation-scoped workflow instances created by employers for candidates.
   - Database RLS explicitly revokes table-level `INSERT` from client roles (`REVOKE INSERT ON public.screening_sessions FROM anon, authenticated` in `20260804000001_staging_authorization_blockers.sql`).
   - `screening_sessions` rows must be instantiated strictly through authorized server workflows (such as employer candidate invitation or background sourcing pipeline). Candidate screening endpoints (`/api/candidate/screening-sessions/[sessionId]/*`) operate on the specific session ID bound to the candidate record (`candidate_id`).

3. **Database RLS Authorization Alignment**:
   - Database RLS policies on `organizations`, `hiring_runs`, `sourcing_sessions`, `candidates`, `candidate_profiles`, and `proof_profiles` already enforce row-level access controls using PostgreSQL `auth.uid()` and security helper functions (`security.is_org_member(id)`, `security.is_hiring_run_member(hiring_run_id)`).
   - Route handlers that initialize Supabase clients via `createSupabaseServerClient(request)` automatically pass user JWT credentials, allowing PostgreSQL RLS to execute secondary authorization checks at the database transaction level.

---

## Detailed 28 API Route Inventory & Authorization Matrix

| Route Path | HTTP Method | Intended Access Level | Current Auth Verification | Required Route Hardening Action |
| :--- | :--- | :--- | :--- | :--- |
| `/api/auth/confirm` | GET | Public | Public OAuth Token Hash | Intentionally public (no change) |
| `/api/auth/me` | GET | Authenticated User | `getUser()` verified (401 on missing) | Verified (no change required) |
| `/api/auth/signin` | POST | Public | Public GoTrue Sign-in | Intentionally public (no change) |
| `/api/auth/signup` | POST | Public | Public GoTrue Sign-up | Intentionally public (no change) |
| `/api/candidate/profile` | GET, POST | Candidate | User token passed to Supabase | Require explicit `getUser()` check |
| `/api/candidate/proof-profile/[candidateId]` | GET | Candidate / Employer | DB query with mock fallback | Require `getUser()` & candidate/employer authorization |
| `/api/candidate/proof-profile/[candidateId]/generate` | POST | Candidate / Employer | Unprotected execution | Require `getUser()` & candidate/employer authorization |
| `/api/candidate/screening-sessions/[sessionId]` | GET | Session Candidate | Session lookup with dev fallback | Require valid session lookup / candidate verification |
| `/api/candidate/screening-sessions/[sessionId]/start` | POST | Session Candidate | Status update with dev fallback | Require valid session lookup / candidate verification |
| `/api/candidate/screening-sessions/[sessionId]/answer` | POST | Session Candidate | Answer upsert with dev fallback | Require valid session lookup & candidate ownership check |
| `/api/candidate/screening-sessions/[sessionId]/complete` | POST | Session Candidate | AI Summary generation | Require valid session lookup & candidate ownership check |
| `/api/candidate/status/[candidateId]` | GET | Candidate | DB query without auth check | Require `getUser()` & candidate/employer authorization |
| `/api/employer/analytics` | GET | Employer | `getUser()` verified | Enforce employer role / membership boundary |
| `/api/employer/brief/[id]` | GET | Employer | `getUser()` verified | Enforce hiring-run org membership check |
| `/api/employer/candidate-extractions` | POST | Employer | `getUser()` verified | Enforce employer role / membership boundary |
| `/api/employer/chat` | POST | Employer | `getUser()` verified | Enforce employer role / membership boundary |
| `/api/employer/hiring-runs` | GET, POST | Employer | `getUser()` verified | Enforce employer role / membership boundary |
| `/api/employer/hiring-runs/suggest` | POST | Employer | `getUser()` verified | Enforce employer role / membership boundary |
| `/api/employer/packets/[extractionId]` | GET | Employer | DB query without auth check | Require `getUser()` & employer org membership check |
| `/api/employer/packets/[extractionId]/action` | POST | Employer | `getUser()` verified | Enforce employer org membership check |
| `/api/employer/packets/[extractionId]/generate` | POST | Employer | Unprotected execution | Require `getUser()` & employer org membership check |
| `/api/employer/shortlist/[roleId]` | GET | Employer | `getUser()` verified | Enforce employer org membership check |
| `/api/employer/sourcing-sessions` | POST | Employer | `getUser()` verified | Enforce hiring-run org membership check |
| `/api/employer/sourcing-sessions/[id]` | GET | Employer | `getUser()` verified | Enforce sourcing-session org membership check |
| `/api/employer/sourcing-sessions/[id]/auto-source` | POST | Employer | `getUser()` verified | Enforce sourcing-session org membership check |
| `/api/integrations/gmail/callback` | GET | Public | OAuth Callback | Intentionally public (no change) |
| `/api/integrations/gmail/connect` | GET | Employer | `getUser()` verified | Enforce employer role / membership boundary |
| `/api/search` | GET | Employer | `getUser()` verified | Enforce employer role / membership boundary |

---

## Server Fixture Architectural Analysis

1. **`screening_sessions` Boundary**:
   - Table-level `INSERT` is revoked from client `authenticated` roles (`REVOKE INSERT ON screening_sessions FROM anon, authenticated`).
   - Creation of `screening_sessions` rows is a server-originated workflow operation triggered when an employer invites a candidate or initializes a candidate screening flow.
   - Route handlers for screening operate on pre-existing `screening_sessions` rows populated by authorized server workflows.

2. **`activity_events` Boundary**:
   - Table-level RLS policy permits `SELECT` to authenticated users in their organization, but restricts public `INSERT`.
   - `activity_events` are inserted by backend services/workers (e.g. `logEvent` in `lib/sourcing/agent.js`) to provide audit feed telemetry for employer dashboards.

---

## Quality Gate Status

```bash
$ cd apps/web && unset CAREERTWIN_RUN_STAGING_TESTS && npm exec --offline vitest run
Test Files: 19 passed | 1 skipped (20 total)
Tests: 221 passed | 1 skipped (222 total)

$ cd apps/web && npm exec --offline eslint -- .
0 errors, 3 warnings

$ cd apps/web && npm run build
Next.js production build: PASSED (Compiled in 8.6s, static generation 31/31)
```

---

## Integrity & Constraints Confirmation

- Production code modifications in Step 4B5.3-A: **0** (Read-Only Inspection Checkpoint)
- Database schema / migration changes: **0**
- Database resets / seeds: **0**
- Service-role key / secret key usage: **0**
- Auth Admin API calls: **0**
- Git remotes configured: **0**
- Git push: **0**

---

## Founder Review Requested

Founder review is requested for formal acceptance of the Step 4B5.3-A Inspection & Design Checkpoint.
