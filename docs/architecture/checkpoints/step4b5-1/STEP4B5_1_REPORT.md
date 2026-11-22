# Step 4B5.1 Report (Shared Server Request Authentication Contract)

**Date:** August 2, 2026  
**Task:** Create and Unit-Test Shared Server Request Authentication Contract  
**Status:** SUCCESS — `apps/web/lib/serverAuth.js` implemented and verified via 25 unit tests in `apps/web/__tests__/security/ServerAuthContract.test.js`. Zero API route handlers modified.

---

## 1. Executive Summary

Step 4B5.1 created the standalone, shared server request-authentication contract `authenticateServerRequest(request, options)` in `apps/web/lib/serverAuth.js`. The contract validates incoming session tokens from `Authorization` headers or cookies, rejects malformed header formats, detects header/cookie token conflicts, and fails closed immediately on deprecated session markers (`mock-token`) without creating Supabase clients or executing database queries.

The implementation was validated against a 25-scenario unit test suite (`ServerAuthContract.test.js`). Zero API route handlers were modified during this step.

---

## 2. Baseline Verification

- **Branch:** `antigravity/step4b2-frontend-parity`
- **HEAD Commit:** `13894c0` (`test(security): reconcile API authentication boundary`)
- **Pre-Change Tag:** `step4b5-1-pre-server-auth-contract` (Created)
- **Working Tree:** Clean prior to contract creation
- **Package Manifest Hashes:** `package.json` and `package-lock.json` match baseline SHA256
- **In-Memory Credential Scan:** 0 documentation matches, 0 test-source matches
- **ESLint Output:** 0 errors, 3 image warnings remaining (W07, W08, W09 untouched)
- **Vitest Test Suite:** 15 test files, 151 / 151 tests passed (25 new contract tests + 126 existing tests, 100% green)
- **Next.js Production Build:** Exit code 0 (21 page routes, 28 API handler paths)

---

## 3. Exported Authentication Contract (`lib/serverAuth.js`)

```javascript
export async function authenticateServerRequest(request, options = {})
```

### Options Default
```javascript
{ requireAuth: true }
```

### Discriminated Union Return Types

#### Success (`ok: true`)
```javascript
// Authenticated User Context
{
  ok: true,
  client, // Normal Supabase server client
  context: {
    userId: 'usr-test-password-not-secret',
    user: userObject
  }
}

// Unauthenticated (when requireAuth: false)
{
  ok: true,
  client: null,
  context: null
}
```

#### Failure (`ok: false`)
```javascript
{
  ok: false,
  status: 401,
  code,    // One of: AUTH_REQUIRED, MALFORMED_AUTHORIZATION, DEPRECATED_SESSION, TOKEN_SOURCE_CONFLICT, INVALID_SESSION, AUTH_PROVIDER_ERROR
  message
}
```

---

## 4. Supported Failure Codes & Behaviors

1. **`AUTH_REQUIRED` (401):** Returned when no token is present and `requireAuth: true`.
2. **`MALFORMED_AUTHORIZATION` (401):** Returned when `Authorization` header is present but does not start with `Bearer ` or contains an empty token. Does not fall back to cookies.
3. **`DEPRECATED_SESSION` (401):** Returned when `mock-token` is detected in header or cookie. Rejects request before `createSupabaseServerClient` invocation (0 client instances, 0 DB calls, 0 provider calls).
4. **`TOKEN_SOURCE_CONFLICT` (401):** Returned when both `Authorization` header and auth cookie are supplied but contain different token strings.
5. **`INVALID_SESSION` (401):** Returned when `client.auth.getUser()` returns an error or `user: null`.
6. **`AUTH_PROVIDER_ERROR` (401):** Returned when `createSupabaseServerClient` or network helper throws an unexpected exception. Sanitizes internal error messages.

---

## 5. Token Precedence & Public Handling (`requireAuth: false`)

- **Header / Cookie Precedence:** If both header and cookie contain the identical token string, it is accepted once. If they differ, `TOKEN_SOURCE_CONFLICT` is returned.
- **`requireAuth: false` Handling:** If no token is provided, returns `{ ok: true, client: null, context: null }` without creating a client. If a token IS provided while `requireAuth: false`, it is fully validated (rejecting malformed, conflicting, or deprecated tokens).

---

## 6. Security Limitations & Non-Protection Notice

**CRITICAL NOTICE:** Step 4B5.1 defines a reusable identity-verification contract.

It does **NOT**:
- Protect any API route handler yet (zero route handlers were modified in B5.1).
- Enforce employer or candidate roles.
- Derive organization membership.
- Enforce record ownership.
- Create `HttpOnly` sessions.
- Resolve credential rotation.
- Make public authenticated hosting safe.

---

## 7. Files Changed

### Production Source (1 file)
- `apps/web/lib/serverAuth.js` (NEW)

### Security Tests (1 file)
- `apps/web/__tests__/security/ServerAuthContract.test.js` (NEW — 25 tests)

---

## 8. Commit & Tag Details

- **Commit Message:** `feat(auth): add server request authentication contract`
- **Tag Created:** `step4b5-1-server-auth-contract-added`
- **Tag `step4b2-frontend-verified`:** **NOT created**

---

## 9. Rollback Procedure

```bash
git tag -d step4b5-1-server-auth-contract-added
git reset --hard step4b5-1-pre-server-auth-contract
```

---

## 10. Founder Review Request

Step 4B5.1 shared authentication contract implementation, unit test suite, and documentation are complete. Request founder review and approval.
