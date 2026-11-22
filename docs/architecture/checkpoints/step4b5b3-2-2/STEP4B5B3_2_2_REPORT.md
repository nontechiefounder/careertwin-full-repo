# Step 4B5B3.2.2 Analysis Report (Server-Helper Reconciled Caller Inventory & Boundary Analysis)

**Date:** August 2, 2026  
**Task:** Reconcile Server-Helper Caller Inventory, Handler Authentication Behavior, and Sanitation Integrity  
**Status:** COMPLETED — Empirical caller audit, handler error-mapping inventory, harness validity reconciliation, and sanitation integrity verified. Zero production source code modified.

---

## 1. Executive Summary

Step 4B5B3.2.2 reconciled the server-helper caller inventory, empirical handler authentication behavior, and documentation sanitation integrity across `apps/web/app/api/`.

A dedicated empirical reconciliation test suite (`apps/web/__tests__/security/ApiAuthorizationBoundaryReconciliation.test.js`) confirmed exact handler responses under unauthenticated conditions. The analysis reconciled the distinction between handlers that call `supabase.auth.getUser()` (17 method handlers, which return HTTP 401 when unauthenticated) and handlers that perform no identity check (10 method handlers, which execute unauthenticated database/provider calls).

---

## 2. Commit File Integrity & Sanitation Reconciliation

- **Commit `d1e4826` Inspection:** File-name-only inspection of commit `d1e4826` confirmed changes to exactly 5 files:
  - `apps/web/__tests__/security/ServerMockSessionDecommission.test.js` (1 test file modified for credential sanitation)
  - `docs/architecture/checkpoints/step4b5b3-2/STEP4B5B3_2_EVIDENCE.md` (sanitized)
  - `docs/architecture/checkpoints/step4b5b3-2/STEP4B5B3_2_REPORT.md` (sanitized)
  - `docs/architecture/checkpoints/step4b5b3-2-1/STEP4B5B3_2_1_EVIDENCE.md` (created)
  - `docs/architecture/checkpoints/step4b5b3-2-1/STEP4B5B3_2_1_REPORT.md` (created)
- **Production Files Modified:** **0 production files modified**.
- **Sanitation Match Reduction Explanation:** In Step 4B5B3.2, `ServerMockSessionDecommission.test.js` was created with historical email references in test assertions. In commit `d1e4826`, `ServerMockSessionDecommission.test.js` was updated to replace those historical references with `[REDACTED: retired development identity]`, bringing post-sanitation test-source matches from 2 to 0.

---

## 3. Safe Credential Scan Results

- **Checkpoint Documentation Matches (`docs/architecture/checkpoints/**/*.md`):** **0 matches**
- **Test-Source Matches (`apps/web/__tests__/**/*`):** **0 matches**
- **Terminal Output Credential Protection:** **CONFIRMED** (0 credential values printed to stdout/stderr).

---

## 4. Reconciled Authoritative Invocation & Handler Counts

- **Route Files Count:** **28 route files**
- **HTTP Method Handlers Count:** **30 method handlers**
- **`createSupabaseServerClient` Invocation Sites:** **31 call sites**
- **Intentionally Public Auth Handlers:** **3 handlers** (`POST /api/auth/signin`, `POST /api/auth/signup`, `GET /api/auth/confirm`)
- **Verified Identity-Check Handlers (`getUser` called):** **17 handlers**
- **Sensitive No-Identity Handlers (`getUser` NOT called):** **10 handlers**
- **Role-Enforced Handlers (`user.role === 'employer'` checked):** **0 handlers** (0 handlers enforce role checks)
- **Expected-Role-but-Not-Enforced Handlers:** **17 handlers** (All 17 authenticated handlers accept candidate tokens for employer operations without 403)

---

## 5. Test Harness Validity Reconciliation

The empirical audit reconciled the apparent contradiction between Step 4B5B1 characterization results and caller code:
1. In `ApiAuthorizationCharacterization.test.js`, `createSupabaseServerClient` was mocked to return a synthetic user whenever `Bearer mock-candidate-token` was passed.
2. Employer handlers (`analytics`, `brief`, `suggest`, `shortlist`, `search`) DO call `getUser()`. When called unauthenticated (no user), they return **HTTP 401 Unauthorized**. When called with a candidate token, `getUser()` returns `user = { role: 'candidate' }`, and because the route lacks a role check (`user.role === 'employer'`), it returned HTTP 200 OK!
3. Candidate screening session handlers (`GET screening-sessions/[sessionId]`, `POST .../start`, `POST .../answer`, `POST .../complete`) do **NOT** call `getUser()`. When called unauthenticated, they execute database/mock fallbacks and return **HTTP 200 OK** (or 404).

---

## 6. Handler Error-Mapping Inventory & Non-Generic 500 Handlers

- **Handlers wrapping logic in `try/catch`:** 30 / 30 handlers.
- **Handlers returning HTTP 500 if helper throws:** 27 handlers.
- **The 3 Handlers Not Returning Generic 500:**
  1. `GET /api/auth/confirm`: Returns **HTTP 400 Bad Request** (`catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }`).
  2. `POST /api/auth/signin`: Returns `err.status` if available (`catch (err) { ... return NextResponse.json(..., { status: err.status || 500 }); }`).
  3. `POST /api/auth/signup`: Returns custom `err.message` in 500 JSON body.

---

## 7. Product-Boundary Options for `/api/search`

- **Current Source Behavior:** Calls `createSupabaseServerClient(request)`, checks `getUser()`, returns 401 if unauthenticated, and queries `hiring_runs` filtered by `employer_id = user.id`.
- **Founder Decision Options:**
  - **Option A (Public synthetic/marketing search):** Remove `getUser()` check, return public role search results without auth.
  - **Option B (Authenticated cross-product search):** Require valid user token, return user-accessible candidates/runs.
  - **Option C (Employer-only organization search):** Require `user.role === 'employer'`, filter results by `employer_id` / `org_id`.

---

## 8. Phased Implementation Recommendation

- **Phase B5.1 Scope:** Create `apps/web/lib/serverAuth.js` (`authenticateServerRequest`) with dedicated unit test suite `ServerAuthContract.test.js`. Zero API route handler changes in B5.1.
- **Phase B5.2 Scope:** Apply `authenticateServerRequest` to the 10 unauthenticated sensitive handlers first, establishing baseline identity verification across all API endpoints.

---

## 9. Quality Gates & Commit Details

- **Targeted Vitest Suite:** **3 / 3 passed** (`ApiAuthorizationBoundaryReconciliation.test.js`).
- **Full Vitest Suite:** **126 / 126 passed** across 14 test files (100% green).
- **Targeted ESLint:** **0 ERRORS, 0 WARNINGS**.
- **Application-Wide ESLint:** **0 ERRORS, 3 WARNINGS remaining** (W07, W08, W09 untouched).
- **Next.js Production Build:** **Exit Code 0** (21 page routes, 28 API route-handler paths).
- **Commit Message:** `test(security): reconcile API authentication boundary`
- **Working Tree:** Clean

---

## 10. Founder Review Request

Step 4B5B3.2.2 reconciliation analysis, caller inventory audit, harness validity reconciliation, and direct empirical tests are complete. Request founder review and approval.
