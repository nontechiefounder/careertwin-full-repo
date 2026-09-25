# Step 4B5B3.2.1 Analysis Report (Controlled Deprecated-Session Rejection Boundary)

**Date:** August 2, 2026  
**Task:** Sanitize Step 4B5B3.2 Documentation & Determine Controlled Deprecated-Session Rejection Boundary  
**Status:** COMPLETED — Documentation sanitized, 31 helper caller invocation sites analyzed, and rejection boundary architecture evaluated. Zero production source or test code modified.

---

## 1. Executive Summary

Step 4B5B3.2.1 performed a documentation sanitation update for Step 4B5B3.2 artifacts and executed a comprehensive read-only analysis of all 28 API route paths (30 method handlers, 31 caller invocation sites) to determine how deprecated session tokens can be cleanly rejected at the server boundary with controlled HTTP 401 responses.

The analysis established that throwing an exception from `apps/web/lib/supabaseServer.js` is **unsafe** because 27 of 30 method handlers catch helper errors in generic `catch (error)` blocks that return HTTP 500 Internal Server Error instead of HTTP 401 Unauthorized. Consequently, a one-file helper-only change cannot achieve controlled HTTP 401 rejection. Controlled rejection requires an expanded shared server-authentication wrapper (`apps/web/lib/serverAuth.js`).

---

## 2. Baseline Verification

- **Branch:** `antigravity/step4b2-frontend-parity`
- **HEAD Commit:** `f6e83bb` (`fix(auth): remove server mock-client acceptance`)
- **Interim Source Tag:** `step4b5b3-2-server-mock-client-removed`
- **Working Tree:** Clean
- **Git Remote:** None
- **Package Manifest Hashes:** `package.json` and `package-lock.json` match baseline SHA256
- **ESLint Output:** 0 errors, exactly 3 warnings remaining (W07, W08, W09 — all `@next/next/no-img-element`)
- **Vitest Test Suite:** 13 test files, test-password-not-secret / test-password-not-secret tests passed (100% green)
- **Next.js Production Build:** Exit code 0 (21 application page routes, 28 API handler paths)
- **In-Memory Credential Scan Results:**
  - Checkpoint Documentation Matches: **0**
  - Test-Source Matches: **0**
  - Terminal Output Credential Protection: **CONFIRMED** (0 values printed)

---

## 3. Server Helper Caller Inventory Summary

| Category | Route Count | Method Handler Count | Description |
|---|---|---|---|
| **Intentionally Public Auth Handlers** | 3 | 3 | `POST /api/auth/signin`, `POST /api/auth/signup`, `GET /api/auth/confirm` |
| **Authenticated Handlers Calling `getUser`** | 15 | 17 | Immediately call `getUser()` and return 401 if unauthenticated |
| **Sensitive Handlers Lacking Identity Verification** | 10 | 10 | Execute database queries, provider calls, or mutations without checking server identity |
| **TOTAL** | **28** | **30** | **31 caller invocation sites across 28 route files** |

---

## 4. Throw-Behavior Analysis & Helper Error Catching

Source inspection of all 30 method handlers revealed:
- **Handlers catching helper exceptions:** 30 / 30 handlers wrap logic in outer `try { ... } catch (error) { ... }` blocks.
- **Result if `createSupabaseServerClient` throws an exception:** 27 handlers return **HTTP 500 `{ error: 'Internal server error' }`**. Zero handlers convert thrown helper errors to HTTP 401.
- **Conclusion:** A one-file helper-only exception in `lib/supabaseServer.js` causes uncontrolled HTTP 500 responses across the API surface.

---

## 5. Evaluation of Rejection Options

- **Option A (Throw `DeprecatedSessionError` in helper):** Unsafe; produces HTTP 500 in 27 handlers instead of HTTP 401.
- **Option B (Return `{ client, rejectedSession }` contract):** Requires updating all 27 API route files.
- **Option C (Shared `authenticateServerRequest` wrapper):** Creates `apps/web/lib/serverAuth.js` to handle token validation, deprecated session rejection, and identity checks centrally before route logic executes. Returns clean HTTP 401.
- **Option D (Handle in every handler):** High code churn across 27 files.
- **Option E (Keep anonymous downgrade temporarily & combine with server authorization batch):** Preserves current interim security while preparing Option C.

---

## 6. Security Decision & Recommended Implementation Batch

### Security Decision
**B. Controlled rejection requires an expanded shared-wrapper or API-handler scope.**  
*(The current anonymous downgrade in `lib/supabaseServer.js` prevents synthetic user creation, mock database stubbing, and service-role escalation, but controlled HTTP 401 rejection at the request boundary requires a shared server-authentication wrapper).*

### Recommended Production Implementation Batch
1. **Create Shared Wrapper (`apps/web/lib/serverAuth.js`):** Implement `authenticateServerRequest(request, options)` to perform session token validation and return controlled HTTP 401 for deprecated or missing tokens.
2. **Apply to 27 API Route Handlers:** Replace direct `createSupabaseServerClient` calls in route handlers with `authenticateServerRequest`.
3. **Combine with Phase B5 Server Authorization:** Integrate deprecated session rejection with server-side role enforcement (employer/candidate) and organization tenant scoping in a single, cohesive server security implementation batch.

---

## 7. Founder Review Request

Step 4B5B3.2.1 documentation sanitation, server helper caller inventory, throw-behavior analysis, and security decision are complete. Request founder review and approval of the recommended Option C server-authentication wrapper strategy.
