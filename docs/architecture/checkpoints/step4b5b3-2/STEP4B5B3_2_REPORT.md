# Step 4B5B3.2 Execution Report (Server-Side Mock-Client Decommission)

**Date:** August 2, 2026  
**Task:** Remove Server-Side Mock-Client Acceptance & Fail Closed on Deprecated Session Input  
**Status:** SUCCESS — Server-side mock-client return object, synthetic `auth.getUser` data, stubbed database queries, and `isMock` properties removed from `apps/web/lib/supabaseServer.js`.

---

## 1. Executive Summary

Step 4B5B3.2 decommissioned server-side mock-client acceptance in `apps/web/lib/supabaseServer.js`. Deprecated session input no longer creates a synthetic identity, an isMock client, stubbed database responses or a service-role client. It is currently downgraded to a standard anonymous client. Controlled request-level rejection remains unresolved for routes that do not verify identity.

All server-side mock client mechanisms (synthetic user objects, stubbed `from()` query chains, and `isMock` client flags) were deleted. Deprecated token input now fails closed across server-side identity checks.

---

## 2. Baseline Verification

- **Branch:** `antigravity/step4b2-frontend-parity`
- **HEAD Commit:** `eba63ee` (`fix(auth): remove client mock-session acceptance`)
- **Pre-Change Tag:** `step4b5b3-2-pre-server-mock-client-removal` (Created)
- **Source Repair Tag:** `step4b5b2-signin-bypass-removed`
- **Working Tree:** Clean prior to edits
- **Package Manifest Hashes:**
  - `package.json` SHA256: `4c6f469f83690a45f50a77de1265e194da2459d8009a9b174a476de7e1b298bc` (Match)
  - `package-lock.json` SHA256: `5e2b91af2a5cca1863026532467b7e6a7c6fccb90f2355554c99fd128bb77365` (Match)
- **ESLint Output:** 0 errors, 3 image warnings remaining (W07, W08, W09 untouched)
- **Vitest Test Suite:** 13 test files, test-password-not-secret / test-password-not-secret tests passed (10 new server decommission tests + 113 existing tests, 100% green)
- **Next.js Production Build:** Exit code 0 (21 page routes, 28 API handler paths)

---

## 3. Removed Server Mock Mechanisms (`apps/web/lib/supabaseServer.js`)

1. **Mock Client Return Object (L33–L77):** Deleted the complete mock-client object return block.
2. **Synthetic `auth.getUser` Behavior (L36–L46):** Deleted synthetic user data return (`id: '00000000-0000-0000-0000-000000000000'`, `email: '[REDACTED: retired development identity]'`).
3. **Stubbed Database Query Chains (L47–L74):** Deleted stubbed `from()` table query chains (`select`, `insert`, `upsert`, `update`).
4. **`isMock` Client Flag (L75):** Deleted `isMock: true` property creation.

---

## 4. Fail-Closed Deprecated Token Handling

When `createSupabaseServerClient(request, useServiceRole)` evaluates incoming request headers or cookies:
1. Extracts `sessionToken` from `Authorization: Bearer <token>` or `sb-<host>-auth-token` cookie.
2. If `sessionToken === 'mock-token'`, it sets `effectiveSessionToken = null` and `effectiveUseServiceRole = false`.
3. The server helper returns a standard Supabase client initialized with the anonymous key and no `Authorization` header.
4. In locally mocked tests, the anonymous client returned no authenticated user. Live Supabase behavior was not exercised.
5. Service-role client creation is disabled when the deprecated marker is detected. The request is then downgraded to an anonymous client rather than rejected at the request boundary.

---

## 5. Security Limitations & API Route Authorization Status

Phase B3.2 removes server-side mock-client database stubbing.

It does **NOT**:
- Add authentication to the 9 sensitive API handlers that perform no identity verification.
- Add employer/candidate role enforcement.
- Add organization or record ownership scoping.
- Create server-managed `HttpOnly` auth cookies.
- Confirm credential rotation.
- Make public authenticated hosting safe.

---

## 6. Files Changed

### Production Source (1 file)
- `apps/web/lib/supabaseServer.js`

### Security Tests (2 files)
- `apps/web/__tests__/security/ServerMockSessionDecommission.test.js` (New unit test file — 10 tests)
- `apps/web/__tests__/security/ApiAuthorizationCharacterization.test.js` (Preserved route characterizations)

---

## 7. Commit & Tag Details

- **Commit Message:** `fix(auth): remove server mock-client acceptance`
- **Post-Change Tag Created:** `step4b5b3-2-server-mock-client-removed`
- **Tag `step4b2-frontend-verified`:** **NOT created**

---

## 8. Rollback Procedure

```bash
git tag -d step4b5b3-2-server-mock-client-removed
git reset --hard step4b5b3-2-pre-server-mock-client-removal
```

---

## 9. Founder Review Request

Step 4B5B3.2 implementation, targeted server helper unit tests, static source assertions, and documentation are complete. Request founder review and approval.
