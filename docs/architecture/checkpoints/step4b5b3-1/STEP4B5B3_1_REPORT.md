# Step 4B5B3.1 Execution Report (Client-Side Mock-Session Decommission & Stale Cleanup)

**Date:** August 2, 2026  
**Task:** Remove Client-Side Mock-Session Recognition & Purge Stale Browser Artifacts  
**Status:** SUCCESS — Client-side mock-session restoration, persistence, auth-listener bypass, and synthetic user construction removed from `apps/web/lib/auth.js`.

---

## 1. Executive Summary

Step 4B5B3.1 decommissioned client-side mock-session recognition in `apps/web/lib/auth.js`. The `AuthProvider` component now automatically detects stale development tokens (`ct_token === 'mock-token'`), stale mock user objects (`is_mock: true`), and stale auth cookies on mount, purging all stale artifacts and remaining in a fail-closed unauthenticated state (`user: null`).

All client-side mock mechanisms (startup restoration, cookie persistence, auth-listener bypass, synthetic mock employer user construction in `login`) were deleted. Legitimate Supabase session handling remains 100% functional.

---

## 2. Baseline Verification

- **Branch:** `antigravity/step4b2-frontend-parity`
- **HEAD Commit:** `6f3ddd4` (`docs(security): design mock-session decommission`)
- **Pre-Change Tag:** `step4b5b3-1-pre-client-mock-session-removal` (Created)
- **Source Repair Tag:** `step4b5b2-signin-bypass-removed`
- **Working Tree:** Clean prior to edits
- **Package Manifest Hashes:**
  - `package.json` SHA256: `4c6f469f83690a45f50a77de1265e194da2459d8009a9b174a476de7e1b298bc` (Match)
  - `package-lock.json` SHA256: `5e2b91af2a5cca1863026532467b7e6a7c6fccb90f2355554c99fd128bb77365` (Match)
- **ESLint Output:** 0 errors, 3 image warnings remaining (W07, W08, W09 untouched)
- **Vitest Test Suite:** 12 test files, 113 / 113 tests passed (24 targeted tests + 89 existing tests, 100% green)
- **Next.js Production Build:** Exit code 0 (21 page routes, 28 API handler paths)

---

## 3. Removed Client Mock Mechanisms (`apps/web/lib/auth.js`)

1. **Startup Mock Restoration (L39–L47):** Removed the branch restoring `storedToken === 'mock-token'` or `parsed.is_mock` user into React state.
2. **Cookie Persistence (L44):** Removed `syncTokenToCookie('mock-token')`.
3. **Auth-Listener Bypass (L100):** Removed `if (storedToken === 'mock-token' && event !== 'SIGNED_OUT') return;`. All Supabase auth events (`SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`) are now processed.
4. **Login Mock-Session Acceptance (L148–L165):** Removed mock response handling in `login`. If an unexpected mock session token is returned, `login` invokes `clearClientAuthState()` and fails closed with an error.
5. **Synthetic User Construction (L153–L160):** Removed synthetic mock user object creation (`is_mock: true`, `role: 'employer'`, `name: 'Admin Tester'`).

---

## 4. Stale-Session Cleanup Contract

A single internal `clearClientAuthState` helper was added to `lib/auth.js`:
- Purges `ct_token` from `localStorage`.
- Purges `ct_user` from `localStorage`.
- Invokes `syncTokenToCookie(null)` to expire the browser auth cookie (`sb-<host>-auth-token=; expires=1970`).
- Sets React state `user` to `null`.

### Initialization Teardown Flow
When `AuthProvider` mounts, `getInitialSession` checks `localStorage` and browser cookies for stale mock markers (`storedToken === 'mock-token'`, `parsed.is_mock === true`, or cookie `access_token === 'mock-token'`). If detected, it immediately executes `clearClientAuthState()`, sets `loading: false`, and returns without calling `/auth/me` or contacting any provider.

---

## 5. Security Limitations & Active Server Mock Client

Phase B3.1 removes client-side mock acceptance and cleans stale browser artifacts.

It does **NOT**:
- Remove server-side mock client stubbing in `apps/web/lib/supabaseServer.js` (Phase B3.2 target). Server-side mock-client acceptance remains active in `lib/supabaseServer.js`.
- Protect the 9 unauthenticated sensitive API routes.
- Add server-side role, organization, or record ownership enforcement.
- Create server-managed `HttpOnly` auth cookies.
- Confirm credential rotation.
- Make public authenticated hosting or real company data safe.

---

## 6. Files Changed

### Production Source (1 file)
- `apps/web/lib/auth.js`

### Security & Component Tests (2 files)
- `apps/web/__tests__/security/ClientMockSessionDecommission.test.jsx` (New unit test file — 15 tests)
- `apps/web/__tests__/components/AuthProviderLifecycle.test.jsx` (Updated to reflect `clearClientAuthState`)

---

## 7. Commit & Tag Details

- **Commit Message:** `fix(auth): remove client mock-session acceptance`
- **Post-Change Tag Created:** `step4b5b3-1-client-mock-session-removed`
- **Tag `step4b2-frontend-verified`:** **NOT created**

---

## 8. Rollback Procedure

```bash
git tag -d step4b5b3-1-client-mock-session-removed
git reset --hard step4b5b3-1-pre-client-mock-session-removal
```

---

## 9. Founder Review Request

Step 4B5B3.1 implementation, targeted lifecycle unit tests, static source assertions, and documentation are complete. Request founder review and approval.
