# Step 4B5.2-D2C-R2 — Remote Auth & Staging RLS Validation Report

**Date:** 2026-08-10  
**Baseline Commit:** `e12d3c46312d2098d8fbddaebe90e267ca683667`  
**Target Project:** `headwayos-secondary` (masked ref: `phli...xskd`), Region: `ap-northeast-2`, Status: `ACTIVE_HEALTHY`  
**Confirm Email Status:** Founder confirmed Confirm Email ON before D2C-R2 execution.

---

## Executive Summary

Step 4B5.2-D2C-R2 evaluated remote authentication and Row-Level Security (RLS) execution against the isolated staging Supabase instance (`headwayos-secondary`).

The pre-execution repository gate verified a clean working tree on branch `antigravity/step4b2-frontend-parity` at commit `e12d3c46312d2098d8fbddaebe90e267ca683667` with zero configured Git remotes and healthy local Docker services.

During remote execution with `CAREERTWIN_RUN_STAGING_TESTS=1`:
1. **Confirm Email** was confirmed ON by the founder in the Supabase Dashboard.
2. The remote `auth.users` table contained zero confirmed synthetic user accounts.
3. Password authentication (`POST /auth/v1/token?grant_type=password`) for all six synthetic identities returned HTTP 400 (`Invalid login credentials`).
4. Account creation (`POST /auth/v1/signup`) with Confirm Email ON failed with HTTP 429 (`email rate limit exceeded`).
5. Per fixture safety boundaries, no privileged keys, service-role keys, or Auth Admin APIs were used.

---

## Execution Summary & Quality Gates

| Execution Gate / Metric | Result |
| :--- | :--- |
| **Pre-execution Repository Gate** | Pass (Branch: `antigravity/step4b2-frontend-parity`, HEAD: `e12d3c46312d2098d8fbddaebe90e267ca683667`, Clean working tree, 0 Git remotes) |
| **Linked Remote Project Gate** | Pass (`headwayos-secondary`, `ap-northeast-2`, `phli...xskd`, `ACTIVE_HEALTHY`) |
| **Confirm Email Precondition** | Founder confirmed Confirm Email ON before D2C-R2 execution |
| **Six Synthetic Identities Authenticated** | 0 of 6 (Password login denied: HTTP 400; Signup limited: HTTP 429) |
| **Synthetic Fixture Count** | 0 (No user-scoped JWT available for bootstrap) |
| **Live HTTPS Request Count** | 6 |
| **Authorization Assertion Count** | 6 |
| **Permitted Operation Count** | 0 |
| **Denied Operation Count** | 6 |
| **Denied Mutations with Equal Hashes** | 0 (Authentication blocked prior to mutation execution) |
| **Anonymous Table Checks (13/13)** | Completed |
| **Targeted Remote Suite (`CAREERTWIN_RUN_STAGING_TESTS=1`)** | 1 test file failed (Authentication prerequisite blocked) |
| **Targeted Test Duration** | 3.95s |
| **Mocked Network Calls** | 0 |
| **Early-Return Paths Taken** | 0 |
| **Ordinary Suite (`CAREERTWIN_RUN_STAGING_TESTS` unset)** | Pass (19 files passed, 221 tests passed, 1 file / 1 test safely skipped) |
| **ESLint (`apps/web`)** | Pass (0 errors, 3 warnings) |
| **Production Build (`apps/web`)** | Pass (Compiled successfully in 10.9s, static generation 31/31) |

---

## Final Integrity Boundary Confirmation

- Remote schema changes: 0
- Migrations applied: 0
- Remote reset: 0
- Migration repair: 0
- Seed deployment: 0
- Service-role usage: 0
- Secret-key usage: 0
- Auth Admin usage: 0
- Real candidate/employer data: 0
- Production application files changed: 0
- API-route files changed: 0
- Server-auth-helper files changed: 0
- OAuth changes: 0
- Storage changes: 0
- AI-provider invocation: 0
- Application connection: 0
- Application deployment: 0
- Git remote: 0
- Git push: 0

---

## Readiness State

**State C — Existing synthetic identities cannot authenticate.**

Authentication failed because the synthetic user accounts were not confirmed in remote GoTrue `auth.users` while Confirm Email remained ON, and signup was rate limited without admin bypass.

---

## Founder Review Requested

Founder review is requested for State C checkpoint acceptance.
