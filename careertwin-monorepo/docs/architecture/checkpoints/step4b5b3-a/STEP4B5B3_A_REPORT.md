# Step 4B5B3-A Analysis Report (Mock-Session Decommission & Stale Cleanup Design)

**Date:** August 2, 2026  
**Task:** Read-Only Analysis & Architectural Design for Complete Mock-Session Removal  
**Status:** COMPLETED — Zero production source or test code modified. Read-only analysis and design completed.

---

## 1. Executive Summary

Step 4B5B3-A analyzed the complete removal of deprecated mock-session recognition from `apps/web/lib/auth.js` and `apps/web/lib/supabaseServer.js`.

The analysis identified 8 active production code locations handling mock sessions across client auth state, browser storage, auth listener events, and server client initialization. A phased implementation plan (Option D: Phase B3.1 Client Cleanup & Phase B3.2 Server Client Cleanup) was designed to safely decommission mock-token recognition while ensuring stale development browser sessions are automatically purged upon mount.

---

## 2. Baseline & In-Memory Scan Verification

- **Branch:** `antigravity/step4b2-frontend-parity`
- **HEAD Commit:** `ed64358` (`test(security): redact deprecated credential fixtures`)
- **Source Repair Tag:** `step4b5b2-signin-bypass-removed`
- **Working Tree:** Clean
- **Git Remote:** None
- **Package Manifest Hashes:** `package.json` and `package-lock.json` match baseline SHA256
- **ESLint Output:** 0 errors, exactly 3 warnings remaining (W07, W08, W09 — all `@next/next/no-img-element`)
- **Vitest Test Suite:** 11 test files, 98 / 98 tests passed (100% green)
- **Next.js Production Build:** Exit code 0 (21 application page routes, 28 API handler paths)
- **In-Memory Credential Scan Results:**
  - Checkpoint Documentation Matches: **0**
  - Test-Source Matches: **0**
  - Terminal Output Credential Protection: **CONFIRMED** (0 values printed)

---

## 3. Active Production Mock-Recognition Locations Inventory

### A. Client Auth Provider (`apps/web/lib/auth.js` — 6 Locations)
1. **L39 (`getInitialSession` check):** `if (storedUser && storedToken === 'mock-token')` accepts stale mock token from `localStorage`.
2. **L41 (`is_mock` user check):** `if (parsed.is_mock)` populates client user state with synthetic mock user.
3. **L44 (`syncTokenToCookie` call):** `syncTokenToCookie('mock-token')` persists mock token into non-`HttpOnly` browser cookie.
4. **L100 (`onAuthStateChange` listener bypass):** `if (storedToken === 'mock-token' && event !== 'SIGNED_OUT') return;` bypasses Supabase session event sync.
5. **L148 (`login` callback check):** `if (session.access_token === 'mock-token')` accepts mock token from login response.
6. **L159 (`is_mock` creation):** Constructs synthetic mock user object (`is_mock: true`, `role: 'employer'`, `name: 'Admin Tester'`) and writes to `localStorage`.

### B. Server Client Initialization (`apps/web/lib/supabaseServer.js` — 2 Locations)
7. **L33 (`sessionToken` check):** `if (sessionToken === 'mock-token')` intercepts request token.
8. **L34-L77 (`isMock` client stub):** Returns stubbed mock client (`isMock: true`) that bypasses PostgreSQL and returns synthetic table data.

### C. Axios Client (`apps/web/lib/api.js` — 0 Dedicated Mock Branches)
- `lib/api.js` contains no dedicated `mock-token` conditional branches, but attaches `Authorization: Bearer <token>` from `localStorage.getItem('ct_token')`. On 401 response, `lib/api.js` response interceptor automatically clears `ct_token` & `ct_user` from `localStorage` and redirects to `/auth`.

---

## 4. Client Initialization & Stale-Session Cleanup Contract

When browser storage contains stale development artifacts prior to Phase B3, the proposed `AuthProvider` initialization cleanup contract behaves as follows:

| Browser Storage State | Action Taken by Cleaned `AuthProvider` | Final User State | Cookie State | Redirect / Navigation |
|---|---|---|---|---|
| **No token / empty storage** | Resolves `loading: false` | `user: null` | Cleared | None |
| **Valid provider JWT** | `supabase.auth.getSession()` validates token | `user: <SupabaseUser>` | Synced | Navigates to dashboard |
| **Invalid ordinary token** | `getSession()` fails; clears `ct_token` & `ct_user` | `user: null` | Cleared | Remains on current / login |
| **Stale `mock-token`** | Rejects token; purges `ct_token` & `ct_user` from `localStorage` | `user: null` | Cleared via `syncTokenToCookie(null)` | Resolves `loading: false` |
| **Stale `is_mock` user** | Detects `is_mock: true`; purges `ct_user` | `user: null` | Cleared | Resolves `loading: false` |
| **Stale auth cookie only** | `syncTokenToCookie(null)` purges cookie | `user: null` | Cleared | Resolves `loading: false` |

---

## 5. Server Client & Route Impact Analysis

- **`createSupabaseServerClient` Behavior:** Removing `if (sessionToken === 'mock-token')` in `lib/supabaseServer.js` causes all incoming requests to pass their token directly to the official Supabase client.
- **Routes calling `getUser()` (16 routes):** Requests carrying a stale `mock-token` will fail `supabase.auth.getUser()`, returning HTTP 401 Unauthorized.
- **Routes NOT calling `getUser()` (12 routes):** Requests carrying a stale `mock-token` will no longer receive stubbed database data from `isMock` client. Instead, queries will execute against PostgreSQL. (Note: Missing route-level server authorization on these 12 routes remains a separate defect to be addressed in Phase B5).

---

## 6. Proposed Implementation Options & Recommendation

- **Option A:** Remove only the special mock branches in `lib/auth.js` and `lib/supabaseServer.js`.
- **Option B:** Remove mock branches and add explicit stale-session cleanup in `AuthProvider`.
- **Option C:** Remove mock branches, add stale cleanup, and add centralized API 401 cleanup in `lib/api.js`.
- **Option D (RECOMMENDED):** Phased Decommissioning:
  - **Phase B3.1:** Client mock-recognition removal & stale browser session cleanup in `apps/web/lib/auth.js`.
  - **Phase B3.2:** Server mock client removal & fail-closed token rejection in `apps/web/lib/supabaseServer.js`.

### Rationale for Option D
Option D separates client state cleanup from server client modifications, allowing independent unit and lifecycle verification of client session teardown before modifying server client database behaviors.

---

## 7. Explicit Security Scope Limitation Statement

Phase B3 implementation will:
- Remove active `mock-token` authentication acceptance in `lib/auth.js` and `lib/supabaseServer.js`.
- Automatically purge stale development mock tokens and cookies from browser storage.
- Stop returning stubbed mock database clients.

Phase B3 will **NOT**:
- Add server-side user verification to the 9 sensitive unauthenticated API routes.
- Add server-side role authorization checks to employer/candidate routes.
- Add `org_id` organization tenant scoping or record ownership checks.
- Create server-managed `HttpOnly` / `Secure` authentication cookies.
- Confirm credential rotation.
- Make the application suitable for public authenticated hosting or live company data.

---

## 8. Founder Review Request

Step 4B5B3-A analysis, production mock inventory, stale session cleanup contract, and Phase B3 implementation design (Option D) are complete. Request founder review and approval of the proposed Phase B3.1 / B3.2 implementation plan.
