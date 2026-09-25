# Step 4B4B4-A Execution Report

**Date:** August 2, 2026  
**Task:** Analysis of Authentication Warnings W10/W11 & Frontend Security Boundary Documentation  
**Status:** COMPLETED — Analysis & Documentation Only. Zero production source or test code modified.

---

## 1. Executive Summary

Step 4B4B4-A performed a read-only audit of the frontend authentication security boundary, token lifecycle, and ESLint warnings W10/W11 in `apps/web/lib/auth.js`.

Warnings W10 and W11 report that `syncTokenToCookie` is missing from the dependency arrays of `useEffect` (line 140) and `logout` `useCallback` (line 252). Because `syncTokenToCookie` is already memoized with an empty dependency array (`useCallback(..., [])`), its reference identity is 100% stable across re-renders. Adding `[syncTokenToCookie]` to both dependency arrays is **completely safe and behavior-preserving**.

However, the broader authentication boundary audit revealed significant architectural security risks—specifically hardcoded mock-token bypasses, non-HttpOnly cookie storage, commented-out role enforcement in `ProtectedRoute.jsx`, and a lack of server-side role and tenant authorization in API routes.

---

## 2. Baseline Verification

- **Branch:** `antigravity/step4b2-frontend-parity`
- **HEAD Commit:** `77bbb91` (`fix(web): make chat greeting actions declarative`)
- **Base Tag:** `step4b4b3-chat-greeting-fixed`
- **Working Tree:** Clean
- **Git Remote:** None
- **Package Manifest Hashes:**
  - `package.json` SHA256: `4c6f469f83690a45f50a77de1265e194da2459d8009a9b174a476de7e1b298bc` (Match)
  - `package-lock.json` SHA256: `5e2b91af2a5cca1863026532467b7e6a7c6fccb90f2355554c99fd128bb77365` (Match)
- **ESLint Warning Count:** 0 errors, exactly 5 warnings remaining (W07, W08, W09, W10, W11)
- **Vitest Suite:** 8 test files, 56 / 56 tests passed
- **Next.js Production Build:** Exit code 0 (21 page routes, 28 API handlers)

---

## 3. Analysis of `syncTokenToCookie`

- **Implementation (`lib/auth.js:14-28`):**
  ```javascript
  const syncTokenToCookie = useCallback((token) => {
    if (typeof document === 'undefined') return;
    const projectHost = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0];
    const cookieName = `sb-${projectHost}-auth-token`;
    
    if (token) {
      const cookieValue = JSON.stringify({ access_token: token });
      document.cookie = `${cookieName}=${encodeURIComponent(cookieValue)}; path=/; SameSite=Lax`;
    } else {
      document.cookie = `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    }
  }, []);
  ```
- **Memoization Status:** Wrapped in `useCallback(..., [])` with an empty dependency array. Its function reference is **permanently stable** across the lifecycle of `AuthProvider`.
- **Browser APIs Used:** `document.cookie`
- **Cookie Name:** `sb-${projectHost}-auth-token`
- **Security Attributes:** `path=/; SameSite=Lax`. **Defects:** Lacks the `Secure` flag, and client-side JavaScript (`document.cookie`) **cannot set `HttpOnly` cookies**.
- **W10/W11 Impact:** Because `syncTokenToCookie` never changes reference identity, adding `[syncTokenToCookie]` to lines 140 and 252 will **neither trigger extra re-renders nor alter runtime behavior**. The repair is 100% safe.

---

## 4. Analysis of Auth Initialization Effect (W10)

- **Location:** `lib/auth.js:31-140`
- **Current Dependencies:** `[]` (ESLint W10 flags missing `syncTokenToCookie`)
- **Initialization Sequence:**
  1. Checks `localStorage` for `ct_user` and `ct_token === 'mock-token'`. If mock user exists, sets user state, clears loading, syncs cookie, and exits.
  2. If Supabase is configured, calls `supabase.auth.getSession()`.
  3. On valid session, stores `access_token` in `localStorage` and syncs cookie.
  4. Calls `api.get('/auth/me')` to fetch server profile. If API is offline, falls back to Supabase `user_metadata` (`role`, `name`, `company`).
  5. Subscribes to `supabase.auth.onAuthStateChange`. Unsubscribes on unmount cleanup.
- **Strict Mode Double Invocation:** In React Strict Mode, `getInitialSession` runs twice, but state updates (`setUser`, `localStorage.setItem`) are idempotent.
- **Repair Safety:** Adding `[syncTokenToCookie]` is completely safe and behavior-preserving.

---

## 5. Analysis of Logout Callback (W11)

- **Location:** `lib/auth.js:238-252`
- **Current Dependencies:** `[]` (ESLint W11 flags missing `syncTokenToCookie`)
- **Sequence:**
  1. Calls `supabase.auth.signOut()`.
  2. Clears `ct_token` and `ct_user` from `localStorage`.
  3. Calls `syncTokenToCookie(null)` to clear browser cookie.
  4. Resets `user` state to `null`.
  5. Triggers `window.location.href = '/auth'` to force a complete client reload.
- **Server Session Invalidation:** Calls Supabase `signOut()`, but does not issue a specific revocation request to local API handlers.
- **Repair Safety:** Adding `[syncTokenToCookie]` to `useCallback` dependency array `[syncTokenToCookie]` is completely safe and behavior-preserving.

---

## 6. Token Storage & Transport Inventory

| Location | Storage Mechanism | Data Stored | Security & Transport Implications |
|---|---|---|---|
| `lib/auth.js` | `localStorage` (`ct_token`) | Access JWT or `'mock-token'` | Exposed to XSS attacks; read by `lib/api.js` interceptor. |
| `lib/auth.js` | `localStorage` (`ct_user`) | JSON User Profile Object | Exposed to XSS; includes role, email, name, company. |
| `lib/auth.js` | `document.cookie` | `{ access_token }` JSON string | Exposed to XSS (`SameSite=Lax`, non-`HttpOnly`). |
| `lib/api.js` | HTTP Header | `Authorization: Bearer ${token}` | Attached on all outgoing `/api/*` requests. |
| `lib/supabaseServer.js` | Server Cookie / Header | `sb-*-auth-token` or Bearer | Read by server routes to initialize Supabase client. |

---

## 7. Mock-Token Acceptance Inventory

Four active locations in the codebase accept or produce `'mock-token'`:

1. **`lib/auth.js:39-45`:** `getInitialSession` accepts stored `'mock-token'` from `localStorage` and bypasses Supabase session verification.
2. **`lib/auth.js:148-165`:** `login` checks `session.access_token === 'mock-token'` and creates a synthetic admin user profile.
-    [REDACTED: known hardcoded development credential condition removed]
4. **`lib/supabaseServer.js:33-77`:** Server client check `if (sessionToken === 'mock-token')` returns a mock Supabase object that returns fake user data (`[REDACTED: development credential email]`) and stubs out database queries without reaching PostgreSQL or enforcing RLS!

**Impact:** These mock paths are fully reachable in production builds. They block real-company pilots and hosted synthetic demonstrations until removed or guarded by strict environment controls.

---

## 8. Role & Route Authorization Analysis

- **Client-Side Protection (`ProtectedRoute.jsx`):** Evaluates `user` and `allowedRole`.
  - **Defect in `ProtectedRoute.jsx:15-18`:** The role check redirect `router.replace('/')` is **commented out**! It logs `console.log("Dev: Bypassing role check for", allowedRole)`. While line 30 returns `null` (preventing UI component rendering), an employer user navigating to a candidate URL is presented with a blank screen instead of being redirected cleanly.
- **Server-Side API Authorization Defect:** Server API route handlers (`/api/employer/*`, `/api/candidate/*`) do NOT perform independent role or tenant organization checks. Security relies entirely on frontend route protection. An authenticated candidate token could invoke employer API endpoints if called directly.

---

## 9. Security Finding Register & Classification

### CRITICAL (3 Findings)
- **F1 (Mock-Token Bypass):** Hardcoded credentials (`[REDACTED: development credential email]` / `[REDACTED: development credential password]`) and `'mock-token'` bypasses in `signin/route.js` and `supabaseServer.js` stub out database access and bypass authentication.
- **F2 (Missing Server-Side Role/Tenant Authorization):** API route handlers lack independent role verification and `org_id` tenant scoping.
- **F3 (Commented-Out Role Redirect):** `ProtectedRoute.jsx` has role redirect logic commented out, bypassing client-side role navigation enforcement.

### HIGH (2 Findings)
- **F4 (Insecure Token Storage):** Auth tokens and cookies are stored in JavaScript-accessible `localStorage` and non-`HttpOnly` cookies, vulnerable to XSS.
- **F5 (Client-Controlled Role Origin):** User role is fallback-derived from mutable `user_metadata` when the backend profile is offline.

### MEDIUM (2 Findings)
- **F6 (Offline API Fallback Silencing):** Failing backend API calls fall back to Supabase metadata without notifying the user of profile sync failure.
- **F7 (Unrefined Logout Refresh):** Logout uses `window.location.href = '/auth'` full-page reload rather than client-side router navigation.

### LOW (2 Findings)
- **F8 (W10 Lint Warning):** Missing `syncTokenToCookie` dependency in `lib/auth.js` initialization `useEffect`.
- **F9 (W11 Lint Warning):** Missing `syncTokenToCookie` dependency in `lib/auth.js` `logout` `useCallback`.

---

## 10. Recommended Repair Sequence

- **Phase A (W10/W11 Lint Repair):** Add `[syncTokenToCookie]` to dependency arrays in `lib/auth.js`. (*Low risk, offline, behavior-preserving*).
- **Phase B (Mock-Token Removal & Role Redirect Repair):** Remove hardcoded credentials from `signin/route.js` and `supabaseServer.js`; restore `router.replace('/')` in `ProtectedRoute.jsx`.
- **Phase C (HttpOnly Session Cookies):** Replace client-managed cookies with secure, `HttpOnly`, `SameSite=Strict` server-managed session cookies.
- **Phase D (Server-Side Role & Tenant Enforcement):** Add role checks and `org_id` tenant scoping to all `/api/*` handlers.
- **Phase E (PostgreSQL RLS Verification):** Enforce PostgreSQL row-level security policies on all database tables.

---

## 11. Proposed Unit Test Plan (13 Tests)

1. Auth initialization with no token resolves `user = null`, `loading = false`.
2. Valid mocked local session loads user profile correctly.
3. Invalid session API error clears tokens and resets user to `null`.
4. Strict Mode double invocation executes idempotently without duplicate side-effects.
5. Logout clears `ct_token`, `ct_user`, cookie, resets `user` to `null`, and redirects to `/auth`.
6. Logout calls `supabase.auth.signOut()`.
7. `ProtectedRoute` redirects unauthenticated user to `/auth`.
8. `ProtectedRoute` enforces `allowedRole` redirect when role mismatches.
9. Mock-token login attempt is rejected when mock mode is disabled.
10. Expired JWT returns 401 and clears client tokens.
11. Cookie and `Authorization` header token values remain synchronized.
12. Zero secret tokens or raw user credentials appear in console logs.
13. Zero external provider requests occur during unit tests.

---

## 12. Environment & Launch Status

- **`.env.local` Status:** File exists on disk, untracked by Git, containing keys (`NEXT_PUBLIC_SUPABASE_URL`, `GEMINI_API_KEY`, etc.).
- **Credential Rotation:** **Unconfirmed**.
- **Authenticated Browser Testing:** **BLOCKED** until credential rotation is confirmed and provider governance is approved.

---

## 13. Commit & Founder Review Request

This task is read-only analysis and documentation only. Zero source code or test files were modified.

- **Commit Message:** `docs(web): audit frontend authentication boundary`
- **Tag:** None created

Request founder review and authorization for Step 4B4B4-B implementation (Phase A: W10/W11 lint repairs).
