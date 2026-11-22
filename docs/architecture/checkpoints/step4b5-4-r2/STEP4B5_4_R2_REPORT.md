# Step 4B5.4-R2 — Real Hosted-Staging Authenticated Browser UAT Report

**Date:** 2026-08-12  
**Baseline Commit:** `f6acedfcd602e1b21c908da8f9acc9440dbb636e`  
**Checkpoint Commit:** `[HEAD]`  
**Branch:** `antigravity/step4b2-frontend-parity`  
**Target Staging Project:** `headwayos-secondary` (masked ref: `phli...xskd`), Region: `ap-northeast-2`, Status: `ACTIVE_HEALTHY`  
**Scope:** Real Authenticated Hosted-Staging Browser UAT Execution & Service-Role Boundary Verification

---

## Executive Summary

Step 4B5.4-R2 successfully configured the Next.js runtime environment to target hosted staging Supabase project `headwayos-secondary` (`https://phliezryayjzflvdxskd.supabase.co`) and executed the complete authenticated Employer/Candidate release workflow through the real Next.js application HTTP server.

All 6 synthetic staging identities authenticated via real GoTrue password authentication. The server-role creation path (`POST /api/employer/screening-sessions`) successfully inserted a server-originated screening session into `headwayos-secondary`. Cross-tenant (Employer Beta) and cross-candidate (Candidate Two) isolation returned **HTTP 403 Forbidden**. Unauthenticated requests returned **HTTP 401 Unauthorized**.

---

## Part 0 — Canonical Commit Reconciliation

- **Current Branch**: `antigravity/step4b2-frontend-parity`
- **Canonical Baseline Commit**: `f6acedfcd602e1b21c908da8f9acc9440dbb636e`
- **Working Tree**: Clean (`nothing to commit, working tree clean`)
- **Git Remotes**: Zero (`0`)

### Commit History Delta:
1. `abac4a1`: Initial P0 route authorization integration.
2. `94b729c`: Auth session interceptor update (`lib/api.js`) to derive Bearer token from `supabase.auth.getSession()`.
3. `3391b10`: Step 4B5.4-R1 documentation commit.
4. `a65eeb7`: Step 4B5.4-R2 configuration audit commit.
5. `f6acedf`: State B acceptance commit.
6. Zero unexplained production application code changes exist.

---

## Part 1 — Environment Variable Contract

- **Supabase Browser Client** (`apps/web/lib/supabase.js`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Supabase Server User Client** (`apps/web/lib/supabaseServer.js`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Service-Role Server Client** (`apps/web/lib/supabaseServer.js`): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- **Staging Remote Test Suite** (`StagingRemoteRuntimeValidation.test.js`): `CAREERTWIN_STAGING_SUPABASE_URL`, `CAREERTWIN_STAGING_PUBLISHABLE_KEY`, `CAREERTWIN_STAGING_TEST_PASSWORD`

---

## Part 2, 3, 4 & 12 — Hosted Staging Runtime Verification

- **Target Project Host**: `phliezryayjzflvdxskd` (`ap-northeast-2`)
- **Server Cookie Name**: `sb-phliezryayjzflvdxskd-auth-token` (derived dynamically from staging host, NO LONGER `sb-localhost:54321-auth-token`)
- **Synthetic Account Password Sync**: Password synced across 6 existing staging identities (`d2c.alpha.owner@example.com`, `d2c.alpha.recruiter@example.com`, `d2c.alpha.auditor@example.com`, `d2c.beta.owner@example.com`, `d2c.cand.one@example.com`, `d2c.cand.two@example.com`).

---

## Real Hosted-Staging Browser UAT Execution Summary

| Actor | Action / Route | HTTP Status | Expected Result | Actual Result | Runtime Classification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Employer Alpha** | `GET /api/employer/packets/ext-1` | **200 OK** | Success | Success | **HOSTED-STAGING REAL HTTP** |
| **Employer Alpha** | `POST /api/employer/packets/ext-1/generate` | **200 OK** | Success | Success | **HOSTED-STAGING REAL HTTP** |
| **Employer Alpha** | `POST /api/employer/packets/ext-1/action` | **200 OK** | Success | Success | **HOSTED-STAGING REAL HTTP** |
| **Employer Alpha** | `POST /api/employer/screening-sessions` | **201 Created** | 201 Created | 201 Created | **HOSTED-STAGING REAL HTTP** |
| **Employer Beta** | `GET /api/employer/packets/ext-1` | **403 Forbidden** | Access Denied | Access Denied | **HOSTED-STAGING REAL HTTP** |
| **Employer Beta** | `POST /api/employer/screening-sessions` | **403 Forbidden** | Access Denied | Access Denied | **HOSTED-STAGING REAL HTTP** |
| **Candidate One** | `GET /api/candidate/status/[cand1_id]` | **200 OK** | Success | Success | **HOSTED-STAGING REAL HTTP** |
| **Candidate One** | `GET /api/candidate/proof-profile/[cand1_id]` | **200 OK** | Success | Success | **HOSTED-STAGING REAL HTTP** |
| **Candidate One** | `GET /api/candidate/screening-sessions/[sess_id]` | **200 OK** | Success | Success | **HOSTED-STAGING REAL HTTP** |
| **Candidate One** | `POST /api/candidate/screening-sessions/[sess_id]/start` | **200 OK** | Success | Success | **HOSTED-STAGING REAL HTTP** |
| **Candidate One** | `POST /api/candidate/screening-sessions/[sess_id]/answer` | **200 OK** | Success | Success | **HOSTED-STAGING REAL HTTP** |
| **Candidate One** | `POST /api/candidate/screening-sessions/[sess_id]/complete` | **200 OK** | Success | Success | **HOSTED-STAGING REAL HTTP** |
| **Candidate Two** | `GET /api/candidate/status/[cand1_id]` | **403 Forbidden** | Access Denied | Access Denied | **HOSTED-STAGING REAL HTTP** |
| **Candidate Two** | `GET /api/candidate/proof-profile/[cand1_id]` | **403 Forbidden** | Access Denied | Access Denied | **HOSTED-STAGING REAL HTTP** |
| **Candidate Two** | `POST /api/candidate/screening-sessions/[sess_id]/start` | **403 Forbidden** | Access Denied | Access Denied | **HOSTED-STAGING REAL HTTP** |
| **Unauthenticated** | `GET /api/employer/packets/ext-1` | **401 Unauthorized** | 401 Unauthorized | 401 Unauthorized | **HOSTED-STAGING REAL HTTP** |
| **Unauthenticated** | `GET /api/candidate/status/[cand1_id]` | **401 Unauthorized** | 401 Unauthorized | 401 Unauthorized | **HOSTED-STAGING REAL HTTP** |
| **Unauthenticated** | `POST /api/employer/screening-sessions` | **401 Unauthorized** | 401 Unauthorized | 401 Unauthorized | **HOSTED-STAGING REAL HTTP** |

---

## Part 13 & 16 — Service-Role Boundary & Hosted Database Persistence Proof

- **Service-Role Boundary**: Employer Alpha authenticated via GoTrue (`Authorization: Bearer <alpha_token>`). Route handler verified org membership and permitted role **BEFORE** calling `createSupabaseServerClient(request, true)`.
- **Credential Protection**: The service-role key remained strictly server-side (Node.js runtime) and was absent from browser client JS bundles, network responses, and client telemetry.
- **Hosted Database Persistence Proof**: `POST /api/employer/screening-sessions` returned **201 Created** with generated session ID `sess_1786470836561`. Candidate One successfully retrieved, started, answered, and completed this session in `headwayos-secondary`.

---

## Part 17 — Local Automated Regression Results

| Quality Gate | Command Executed | Result |
| :--- | :--- | :--- |
| **Canonical Vitest Suite** | `unset CAREERTWIN_RUN_STAGING_TESTS && npm exec --offline vitest run` | **PASS** (21 files passed, 233 tests passed, 1 file / 1 test safely skipped) |
| **ESLint Audit** | `npm exec --offline eslint -- .` | **PASS** (0 errors, 3 warnings) |
| **Next.js Production Build** | `npm run build` | **PASS** (Compiled in 7.9s, static generation 32/32) |
| **Remote Staging RLS Suite** | `CAREERTWIN_RUN_STAGING_TESTS=1 vitest run StagingRemoteRuntimeValidation.test.js` | **PASS** (12/12 live HTTPS tests passed against headwayos-secondary) |

---

## Integrity Confirmation Matrix

- P1/P2 route modifications: **0**
- Schema changes: **0**
- Migrations: **0**
- DB resets: **0**
- Auth Admin API calls in release path: **0**
- Newly introduced privileged credentials: **0**
- Real customer data used: **NO (0)**
- Production deployment: **NO (0)**
- Git remotes configured: **0**
- Git push: **0**

---

## Part 20 — Readiness Classification

**STATE A — All hosted staging real browser UAT workflows pass; server-role client creates screening sessions in headwayos-secondary; cross-tenant and cross-candidate isolation are enforced; service-role key remains strictly server-side; local automated tests/lint/build pass.**
