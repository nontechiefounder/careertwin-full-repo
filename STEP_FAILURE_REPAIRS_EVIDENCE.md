# workBYLiNE Genome — Failure Repairs Verification Evidence (`v6`)

**Date:** 2026-11-21  
**Lifecycle State:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`  
**Parent Frozen Archive:** `WorkByLine_Parth_Local_Review_v5.zip` (`9ab195880aed49a7eda94155829f46dfb4765cf7afee07e34eda340d9bc449ff`)

---

## 1. Baseline Reproduction on Frozen v5 (`audit_probes.mjs`)

- **Command:** `node --no-warnings --experimental-vm-modules /tmp/wbl-repo-review/audit_probes.mjs` (against extracted frozen v5).
- **Result:** Exit `0`, `outbound_attempts: 0`.
  - `signup_email_failure` (`71a2bc02...`): `status: 200`, `"Signup successful! Please check your email to verify your account."` (**R3 CONFIRMED**).
  - `screening_answers_query_failure` (`19cb3b4a...`): `status: 200`, `generation_calls: 1`, `persistence_calls: 1`, `question_count: 0` (**R2 CONFIRMED**).
- **Post-Repair Re-run:** `audit_probes.mjs` exited `1` (`ERR_ASSERTION: Unexpected module @/lib/verificationEmail`), confirming `signup/route.js` now delegates to `@/lib/verificationEmail` rather than inline silent error swallowing.

---

## 2. Post-Repair Verification Matrix (on `/tmp/wbl-v6-candidate`)

| Check | Command & CWD | Exit | Result & Boundary |
|---|---|---:|---|
| **Locked Install (Root & Web)** | `npm ci --no-audit --no-fund` (root & `apps/web`) | `0` | `4` root packages + `936` web packages installed with full lockfile lifecycle |
| **R2/R3 & Discovery Vitest** | `npx --no-install vitest run __tests__/security/VitestDiscoveryContract.test.js __tests__/api/screeningCompleteBehavior.test.js __tests__/pages/AuthPage.test.jsx __tests__/api/dryRunEmail.test.js __tests__/security/ApiAuthorizationCharacterization.test.js` (`apps/web`) | `0` | **5/5 files, 45/45 tests PASSED** (mocked `supabaseServer`, `smtp`, `ai`, `jsdom` UI) |
| **Root Suites** | `node tests/contracts.mjs && node tests/postgres_schema.mjs && node tests/check_overlay.mjs && node tests/v3_regression.mjs` (root) | `0` | Contracts `8/8`, PGlite `5/5`, Overlay `9/9`, V3 Regression `6/6` |
| **v5 Employer-Chat Replay** | `node --no-warnings --experimental-vm-modules tests/employer-chat-v5.mjs` (root) | `0` | **38/38 PASSED**, `external requests: 0` (Node loopback HTTP, mocked provider transport) |
| **ESLint & Next.js Build** | `npm run lint && npm run build` (`apps/web`) | `0` | `0` lint errors (`3` `<img>` warnings), Next.js Webpack compiled in `18.8s`, **51/51 routes** |
| **Guarded Disposable Harness** | `bash scripts/guarded_disposable_verify.sh` (`Run ID: 20261120T224638Z_59395`, DB `supabase_db_wbl-disposable-verify` `54422`, Kong `54421`, App `:3010`, `WORKBYLINE_GENERATION_GATE=false`, live keys blank, `CAREERTWIN_DRY_RUN_EMAIL=true`) | `0` | `status: "PASSED"`, `cleanup_status: "clean"`: Step 5 migrations `1\|1\|0\|0\|1`; Step 6a **20/20 files (183/183 tests)**; Step 6b **6/6 files (61/61 tests)**; Step 8 live `:3010` **PASSED**; Step 9 Playwright **39 passed, 2 skipped, 0 failed** (`48.5s`) |

*(Note: An intermediate guarded run `20261120T223752Z_57102` failed at `VitestDiscoveryContract.test.js` (`68` vs `67`) before R2/R3 tests were consolidated into `screeningCompleteBehavior.test.js` and `AuthPage.test.jsx`; `20261120T224638Z_59395` passed with zero failures.)*

---

## 3. Excluded / Skipped / `NOT VERIFIED` Boundaries

- **Playwright Skips (`2/41`):** `EmployerDay3Assertions.test.js:439` (`Test E`) and `EmployerDay4Assertions.test.js:306` (`Scenario 14`), both pre-existing UI skips (`DocumentDropzone / intake-handoff-notice removed from /employer/intake in current UI`).
- **Not Verified Locally:** Live SMTP transport, live external AI/sourcing providers, persistent Python Context Engine (`:8011` / Temporal `:7233` / BGE weights), and hosted staging (`StagingRemoteRuntimeValidation.test.js`).
