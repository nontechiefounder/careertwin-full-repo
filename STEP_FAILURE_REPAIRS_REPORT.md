# workBYLiNE Genome — Failure Repairs Report (`R2` & `R3`)

**Date:** 2026-11-21  
**Lifecycle State:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`  
**Parent Frozen Candidate:** `WorkByLine_Parth_Local_Review_v5.zip` (`9ab195880aed49a7eda94155829f46dfb4765cf7afee07e34eda340d9bc449ff`)  
**New Candidate:** `WorkByLine_Parth_Local_Review_v6.zip` (see `STEP_FAILURE_REPAIRS_EVIDENCE.md` for SHA-256 and manifest)

---

## 1. Executive Summary

Both independently reproduced failure paths (`R2` and `R3`) from `WorkByLine_v5_Repository_Review_20261120.zip` were reproduced on frozen v5 via `audit_probes.mjs`, repaired with minimal bounded changes, verified across Vitest, ESLint, Next.js production build (`51/51` routes), root contract/PGlite/overlay/v5-replay suites, and the guarded disposable harness (`Run ID: 20261120T224638Z_59395`, `PASSED`).

- **R1 (GitHub Repository Divergence):** Remains an external Git-branch synchronization / Founder-authorized push decision; remote `main` was not touched.
- **R2 (Screening Answer-Read Failure):** Repaired and `TEST-VERIFIED` locally.
- **R3 (Signup Verification-Email Delivery Failure):** Repaired and `TEST-VERIFIED` locally (with mocked SMTP / dry-run boundaries; live SMTP remains `NOT VERIFIED`).

---

## 2. Defect Reproduction, Root Cause & Before/After Behavior

### R2 — Screening Completion After `screening_answers` Query Failure
- **Reproduced on Frozen v5:** Yes (`audit_probes.mjs`: `screening_answers_query_failure` returned `status: 200`, `generation_calls: 1`, `persistence_calls: 1`, `question_count: 0`).
- **Root Cause:** `apps/web/app/api/candidate/screening-sessions/[sessionId]/complete/route.js:86` destructured only `{ data: qas }`, ignoring `error`, and coerced `null` into `qaContext = []`, allowing `generateChat()` and `complete_screening_session_transactional` to run without loaded answers.
- **User Impact:** A transient or permission database failure could persist AI-generated screening scores for an empty answer payload.
- **Before / After:**
  - **Before:** DB error or `null`/empty answers -> `generateChat()` + RPC persisted scores -> `200 OK`.
  - **After:**
    - DB error or non-array `qas` -> `503` `SCREENING_ANSWERS_UNAVAILABLE` with **0** `generateChat` calls and **0** RPC writes.
    - Non-empty rows lacking valid `answer_text` -> `422` `SCREENING_ANSWERS_INVALID` with **0** generation/writes.
    - Legitimate empty answers (`[]`) -> `422` `INSUFFICIENT_SCREENING_ANSWERS` with **0** generation/writes.
    - Valid answers -> normal `generateChat` + `complete_screening_session_transactional` (`200`).
    - Completed-session replay & unauthorized `403` checks preserved unchanged.

### R3 — Signup Reporting Success After Verification-Email Delivery Failure
- **Reproduced on Frozen v5:** Yes (`audit_probes.mjs`: `signup_email_failure` returned `status: 200` and `"Signup successful! Please check your email to verify your account."` after `sendSMTPEmail` threw).
- **Root Cause:** `apps/web/app/api/auth/signup/route.js:76-84` caught and swallowed SMTP exceptions inside `try/catch`, and unconditionally returned `200` with `"check your email"` for both failed delivery and dry-run suppression.
- **User Impact:** Users were instructed to check their inbox when no verification email was sent, with no UI resend recovery path.
- **Before / After:**
  - **Before:** `sendSMTPEmail` throws or dry-run suppresses -> `200` `"Signup successful! Please check your email..."`.
  - **After:**
    - Extracted shared helper `apps/web/lib/verificationEmail.js` (`deliverVerificationEmail`) without exposing tokens/links or raw SMTP errors.
    - `POST /api/auth/signup`:
      - Delivery succeeded (`!dryRun`) -> `200`, `delivery_status: 'sent'`, `email_sent: true`, `account_created: true`.
      - Dry-run active (`CAREERTWIN_DRY_RUN_EMAIL !== 'false'`) -> `200`, `delivery_status: 'suppressed_dry_run'`, `email_sent: false` (explicitly states dry-run suppression).
      - Link generation failed -> `500` `VERIFICATION_LINK_FAILED`, `account_created: true`, `delivery_status: 'not_attempted'`, `retry_supported: true`.
      - SMTP delivery failed -> `503` `VERIFICATION_EMAIL_DELIVERY_FAILED`, `account_created: true`, `delivery_status: 'failed'`, `email_sent: false`, `retry_supported: true` (never tells user to check email).
    - Added bounded recovery endpoint `POST /api/auth/resend-verification` (`apps/web/app/api/auth/resend-verification/route.js`) with `60s` per-email cooldown (`429 RATE_LIMITED`), existing-unconfirmed user check (`listUsers`, zero `createUser` calls), and non-enumerating response for missing/already-confirmed emails.
    - Updated `apps/web/lib/auth.js` and `apps/web/app/auth/page.jsx` to display truthful dry-run/failure notices and a **Resend verification email** button (`resend-verification-btn`) on partial-success delivery failure.

---

## 3. Exact Files Changed

1. `apps/web/app/api/candidate/screening-sessions/[sessionId]/complete/route.js` — Fail-closed `screening_answers` error/malformed/empty handling before generation/RPC.
2. `apps/web/lib/verificationEmail.js` — Shared verification-link + dry-run/SMTP dispatch helper.
3. `apps/web/app/api/auth/signup/route.js` — Honest `delivery_status` / `account_created` / `retry_supported` responses (`503` on delivery failure, `500` on link failure, `200` `suppressed_dry_run` on dry-run).
4. `apps/web/app/api/auth/resend-verification/route.js` — Bounded, rate-limited verification resend without account recreation.
5. `apps/web/lib/auth.js` — Preserves `delivery_status`, `account_created`, and `retry_supported` metadata in `register()`.
6. `apps/web/app/auth/page.jsx` — Truthful toast/banner states and resend recovery UI.
7. `apps/web/__tests__/api/screeningCompleteBehavior.test.js` — Added `R2` regression test covering DB error, null/malformed rows, and empty answers.
8. `apps/web/__tests__/pages/AuthPage.test.jsx` — Added `R3` API + UI regression tests covering `sent`, `503 failed`, `suppressed_dry_run`, duplicate/link errors, `429` resend recovery, and `AuthPage` UI state.
9. `docs/handoff/DATA_AND_API_CONTRACTS.md` — Documented `/api/auth/resend-verification` and R2/R3 contract codes.

---

## 4. Rollback & Remaining Gates

- **Rollback:** Retain frozen `WorkByLine_Parth_Local_Review_v5.zip` (`9ab195880aed49a7eda94155829f46dfb4765cf7afee07e34eda340d9bc449ff`) as comparison reference (note: v5 exhibits R2/R3; do not deploy v5 without these repairs). Zero SQL migrations were added in v6, so no DB rollback is needed.
- **Awaiting Independent Review:** `R2`/`R3` repairs, v6 patch (`evidence/v6/V6_REPAIR_DIFF.patch`), and `Run ID: 20261120T224638Z_59395`.
- **Remaining `NOT VERIFIED` / Blocked Scope:** Live SMTP delivery, live AI/sourcing providers, persistent Python Context Engine (`:8011` / Temporal `:7233` / BGE weights), and hosted staging/production.
