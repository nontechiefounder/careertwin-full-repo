# workBYLiNE Genome — v8 Verification Evidence

**Date:** 2026-11-21  
**Lifecycle State:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`  
**Parent Frozen Candidate:** `WorkByLine_Parth_Local_Review_v7.zip` (`a8965a16b39c5d0b332aaf91c47dcd0d868afb170b886259ab47c2d8617e71a0`)

---

## 1. Before / After Counterexamples (`independent_probes.mjs`)

- **Before (`v7` baseline):** `independent_probes.mjs` reproduced `5` violations (`V6-R1` separate VM instances, `V6-R3` SMTP/link-error `503`/`500` vs absent `200`, `V7-P1` 20-page cap treating page-21 target as absent).
- **After (`v8`):** Re-running `independent_probes.mjs` against `/tmp/wbl-v8-candidate` stopped at line 130 (`AssertionError: Expected "actual" to be strictly unequal to: 200`), confirming `resend-verification` now returns `200 accepted` even on SMTP/link failure instead of disclosing unconfirmed account existence. `AuthPage.test.jsx` directly verifies page-21 pagination, `503` malformed lookup, and 5-way `200 accepted` parity.

---

## 2. Post-Repair Verification Matrix (on `/tmp/wbl-v8-candidate`)

| Check | Command & CWD | Exit | Result & Boundary |
|---|---|---:|---|
| **Locked Install (Root & Web)** | `npm ci --no-audit --no-fund` (root & `apps/web`) | `0` | `4` + `936` packages installed cleanly |
| **Focused V8 Vitest Suites** | `npx --no-install vitest run __tests__/pages/AuthPage.test.jsx __tests__/api/screeningCompleteBehavior.test.js __tests__/api/dryRunEmail.test.js __tests__/security/ApiAuthorizationCharacterization.test.js __tests__/security/BrandingRegressionCheck.test.js __tests__/security/VitestDiscoveryContract.test.js` (`apps/web`) | `0` | **6/6 files, 50/50 tests PASSED** (mocked `supabaseServer`, `smtp`, `ai`, `jsdom` UI) |
| **Root Suites** | `node tests/contracts.mjs && node tests/postgres_schema.mjs && node tests/check_overlay.mjs && node tests/v3_regression.mjs` (root) | `0` | Contracts `8/8`, PGlite `5/5`, Overlay `9/9`, V3 Regression `6/6` |
| **v5 Employer-Chat Replay** | `node --no-warnings --experimental-vm-modules tests/employer-chat-v5.mjs` (root) | `0` | **38/38 PASSED**, `external requests: 0` (Node loopback HTTP) |
| **ESLint & Next.js Build** | `npm run lint && npm run build` (`apps/web`) | `0` | `0` lint errors (`3` `<img>` warnings), Webpack compiled in `15.3s`, **51/51** static pages (`76` route table entries) |
| **Guarded Disposable Harness** | `bash scripts/guarded_disposable_verify.sh` (`Run ID: 20261121T133424Z_20156`, DB `supabase_db_wbl-disposable-verify` `54422`, Kong `54421`, App `:3010`, `CAREERTWIN_DRY_RUN_EMAIL=true`, `WORKBYLINE_GENERATION_GATE=false`, live keys blank) | `0` | `status: "PASSED"`, `cleanup_status: "clean"`: Step 5 `1\|1\|0\|0\|1`; Step 6a **20/20 files (185/185 tests)**; Step 6b **6/6 files (61/61 tests)**; Step 8 live `:3010` **PASSED**; Step 9 Playwright **39 passed, 2 skipped, 0 failed** (`43.1s`) |

---

## 3. Remaining Limits & `NOT VERIFIED` Boundaries

- **Multi-Instance Cooldown Hosting:** `createMemoryCooldownStore()` is single-process only; multi-instance / serverless hosting remains **`BLOCKED / FOUNDER DECISION REQUIRED`** (PostgreSQL vs. Redis shared limiter).
- **Playwright Skips (`2/41`):** `EmployerDay3Assertions.test.js:439` (`Test E`) and `EmployerDay4Assertions.test.js:306` (`Scenario 14`).
- **Not Verified Locally:** Multi-instance external shared cooldown store, live SMTP delivery, live external AI/sourcing providers, persistent Python Context Engine (`:8011` / Temporal `:7233` / BGE weights), GitHub `main` synchronization (`R1`), and hosted staging.
