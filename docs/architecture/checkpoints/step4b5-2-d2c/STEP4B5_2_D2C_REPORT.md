# Step 4B5.2-D2C — Staging GoTrue Auth & Remote RLS Validation Report

**Date:** 2026-08-06  
**Baseline Commit:** `95a89be` — docs(database): verify staging client privilege boundaries  
**Target Isolated Staging Project:** `headwayos-secondary` (`phli...xskd`), Region: `ap-northeast-2`  
**Validation Status:** **State C — Auth configuration blocks synthetic runtime validation.**  

---

## 1. Executive Summary & Validation Finding

Synthetic identity registration and end-to-end remote RLS matrix validation were executed against the linked isolated staging project using public Auth (`/auth/v1/*`) and PostgREST (`/rest/v1/*`) interfaces.

### Primary Blocker Identified (State C)
1. **Public GoTrue API Gateway Header Requirement:** Calling `/auth/v1/health` or authentication endpoints without the `apikey` header returns HTTP 401. Including `apikey` connects successfully to GoTrue.
2. **GoTrue Email Confirmation Enforcement:** Public identity registration (`POST /auth/v1/signup`) creates synthetic user records in `auth.users`, but GoTrue in the remote staging project enforces email confirmation before issuing valid JWT access tokens (`access_token: null`).
3. **Password Signin Rejection:** Subsequent password authentication attempts (`POST /auth/v1/token?grant_type=password`) are rejected with `Email not confirmed` / HTTP 400.
4. **Governing Constraint Adherence:** Per task instructions, Antigravity did not alter remote Auth project settings, did not use `SUPABASE_SECRET_KEY` or `SERVICE_ROLE_KEY` (Auth Admin API), and stopped execution to declare **State C**.

---

## 2. Remote Security Advisor Audit (Part 6)

Review of remote database inspection and lint results (`npx supabase db lint --linked`):
- **Category:** `extensions`, `public`, `security`
- **Result:** **0 schema errors or security warnings found.**

---

## 3. Remote Data & Service Boundary Confirmation (Part 7)

- Synthetic identities created: **Yes (unconfirmed test records)**
- Real candidate or employer data used: **0**
- Storage objects created: **0**
- OAuth settings changed: **0**
- AI providers invoked: **0**
- Secret key / service role key used: **0**
- Database migrations or schema changes: **0**

---

## 4. Test Artifact & Quality Gates (Parts 8 & 9)

- **Test Artifact Created:** `apps/web/__tests__/staging/StagingRemoteRuntimeValidation.test.js`
  - Reads environment variables `CAREERTWIN_STAGING_SUPABASE_URL`, `CAREERTWIN_STAGING_PUBLISHABLE_KEY`, `CAREERTWIN_STAGING_TEST_PASSWORD`.
  - Skips safely when environment variables are absent, ensuring canonical local test suites remain 100% green.
  - Never prints passwords, keys, or token values.
- **Canonical Test Suite (`apps/web`):** **20/20 test files passed, 222/222 tests passed**
- **ESLint (`apps/web`):** **0 errors**, 3 pre-existing warnings
- **Production Build (`next build`):** **Passed (green)**

---

## 5. Integrity & Safety Audit (Part 11)

| Integrity Assertion | Status |
|---|---|
| Remote schema writes | 0 |
| Remote data writes | 0 (except unconfirmed signup attempts) |
| Migrations applied | 0 |
| Remote reset | 0 |
| Migration repair | 0 |
| Seed deployment | 0 |
| Auth Admin API / Secret Key usage | 0 |
| API keys retrieved | 0 |
| Application connected | 0 |
| Production source code changes | 0 |
| API route changes | 0 |
| Server auth helper changes | 0 |
| Git remote or push | 0 |

---

## 6. Required Founder Action for Step D2C Progression

To allow synthetic identity login and remote PostgREST RLS matrix execution without using privileged secret keys, the founder must:
1. Temporarily disable "Confirm email" in the Supabase Staging Project Dashboard (`Authentication -> Providers -> Email -> Confirm email = OFF`).
2. Alternatively, manually confirm the synthetic test emails in the staging dashboard.

---

## 7. Readiness Declaration

**State C:** Auth configuration blocks synthetic runtime validation.
