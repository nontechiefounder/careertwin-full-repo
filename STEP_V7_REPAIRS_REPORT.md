# workBYLiNE Genome — v7 Auth Recovery & Review Closure Report (`V6-R1`–`V6-R4`, `V6-C1`, `V6-C2`, `V6-D1`)

**Date:** 2026-11-21  
**Lifecycle State:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`  
**Parent Frozen Candidate:** `WorkByLine_Parth_Local_Review_v6.zip` (`de53be583e24dda12340f6508d355a12a685fdfb31dbdbcb8407e35d990cf1a3`)  
**New Candidate:** `WorkByLine_Parth_Local_Review_v7.zip` (see `STEP_V7_REPAIRS_EVIDENCE.md` for SHA-256 and manifest)

---

## 1. Executive Summary

All four newly reproduced authentication recovery findings (`V6-R1`–`V6-R4`), the screening-filter documentation limitation (`V6-C1`), the unsubstantiated `/auth` copy (`V6-C2`), and the canonical entry-point documentation drift (`V6-D1`) from `WorkByLine_v6_Independent_Review_20261121.zip` were addressed in `/tmp/wbl-v7-candidate` and verified across Vitest (`6/6` focused files / `50/50` tests), root suites (`contracts.mjs` `8/8`, `postgres_schema.mjs` `5/5`, `check_overlay.mjs` `9/9`, `v3_regression.mjs` `6/6`, `employer-chat-v5.mjs` `38/38`), ESLint (`0` errors), Next.js build (`12.0s`, `51/51` static pages), and the guarded disposable harness (`Run ID: 20261121T123258Z_7231`, `PASSED`).

---

## 2. Findings Addressed (`V6-R1`–`V6-R4`, `V6-C1`, `V6-C2`, `V6-D1`)

- **`V6-R1` (Atomic Cooldown Reservation & Multi-Instance Boundary):**
  - **Fix (`apps/web/app/api/auth/resend-verification/route.js`):** Cooldown reservation (`activeCooldownStore.tryReserve(email, RESEND_COOLDOWN_MS)`) now executes atomically **before** any `await` or user lookup, admitting at most `1` of `8` concurrent requests (`1 x 200`, `7 x 429 RATE_LIMITED`) and covering all lookup requests uniformly.
  - **Multi-Instance Boundary & Option for Human Review:** Added `setResendCooldownStore(store)` / `createMemoryCooldownStore()` and verified two simulated instances sharing an injected `sharedStore`. Because no Redis or dedicated auth-cooldown DB table currently exists in the repo, the default in-memory `Map` store remains single-process only; **multi-instance / serverless hosting requires configuring an approved shared store (Redis or a PostgreSQL cooldown table migration) under Founder/human review**.
- **`V6-R2` (Paginated User Lookup Past 1,000 Records):**
  - **Fix (`findUserByEmail` in `resend-verification/route.js`):** Uses direct `admin.getUserByEmail(email)` if available, or paginates `admin.listUsers({ page, perPage: 1000 })` up to `MAX_LIST_USERS_PAGES = 20` checking `nextPage`/`lastPage`, failing truthfully (`503 VERIFICATION_LOOKUP_UNAVAILABLE`) on any lookup error.
- **`V6-R3` (Non-Enumerating Public Response):**
  - **Fix (`resend-verification/route.js`):** Returns the identical `200` `{ delivery_status: 'accepted', message: 'If an unverified account exists for this email, a verification email will be sent.' }` across absent, already-confirmed, dry-run, and unconfirmed accounts (`email_sent` omitted from public body).
- **`V6-R4` (Thrown `generateLink` Exception Preserves Partial-Success Recovery):**
  - **Fix (`apps/web/lib/verificationEmail.js`):** Wrapped `supabase.auth.admin.generateLink(...)` in `try/catch` so both returned `linkError` and thrown exceptions return `{ ok: false, status: 500, error: 'VERIFICATION_LINK_FAILED', delivery_status: 'not_attempted', retry_supported: true }`, preserving `account_created: true` and inline recovery in `signup/route.js` and `AuthPage`.
- **`V6-C1` (Screening Mixed Valid + Blank Rows Limitation):**
  - Documented accurately in `docs/handoff/DATA_AND_API_CONTRACTS.md` and covered in `screeningCompleteBehavior.test.js`: `complete/route.js` filters out blank/non-string rows when at least one valid answer remains, and rejects (`422`) when zero valid answers remain.
- **`V6-C2` (`/auth` Unsubstantiated Copy):**
  - Replaced unsubstantiated `"70% screening time reduction"`, `"verified GitHub contributions"`, `"GDPR compliant"`, and `"thousands of teams"` copy in `apps/web/app/auth/page.jsx` with accurate, non-fabricated product copy while preserving `#00D604` branding.
- **`V6-D1` (Canonical Entry-Point Documentation):**
  - Updated `docs/handoff/START_HERE.md`, `docs/handoff/PARTH_HANDOFF.md`, and `docs/handoff/DATA_AND_API_CONTRACTS.md` to reference `STEP_V7_REPAIRS_REPORT.md` and `STEP_V7_REPAIRS_EVIDENCE.md`.

---

## 3. Rollback & Remaining Gates

- **Rollback:** Retain frozen `WorkByLine_Parth_Local_Review_v6.zip` (`de53be583e24dda12340f6508d355a12a685fdfb31dbdbcb8407e35d990cf1a3`) and `WorkByLine_Parth_Local_Review_v5.zip` (`9ab195880aed49a7eda94155829f46dfb4765cf7afee07e34eda340d9bc449ff`) as comparison references. Zero SQL migrations were added in v7.
- **Remaining Gates (`NOT VERIFIED` Locally):** Multi-instance shared cooldown backend (Redis/DB store wiring), live SMTP delivery, live external AI/sourcing providers, persistent Python Context Engine (`:8011` / Temporal `:7233` / BGE weights), GitHub `main` synchronization (`R1`), and hosted staging.
