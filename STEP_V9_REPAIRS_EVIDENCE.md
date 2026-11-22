# workBYLiNE Genome — v9 Verification Evidence

**Date:** 2026-11-22  
**Lifecycle State:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`  
**Parent Frozen Candidate:** `WorkByLine_Parth_Local_Review_v8.zip` (`e834acb929bde40968cd7426ffcd858785f2fd3d0d7b340df9a15990609fd00e`)

---

## 1. Baseline Reproduction & Post-Repair Verification

- **Baseline (`independent_v8_probes.mjs` on unchanged `v8`):** `17/17` assertions ran (`external_attempts: 0`), reproducing `V8-R1` (`3` distinct addresses -> `3,000` calls), `V8-R2` (`known 200` vs `absent 503`), `V8-R3` (`10,001` retained keys), and `V8-C2` (malformed `getUserByEmail` -> `200`).
- **Post-Repair Link Validation:** Checked `54` relative Markdown links across `PARTH_HANDOFF.md` and `docs/handoff/*.md` -> **`0` broken links** (`V8-C1`).

| Check | Command & CWD | Exit | Result & Boundary |
|---|---|---:|---|
| **Locked Install (Root & Web)** | `npm ci --no-audit --no-fund` (root & `apps/web`) | `0` | `4` + `936` packages installed cleanly |
| **Focused V9 Vitest Suites** | `npx --no-install vitest run __tests__/pages/AuthPage.test.jsx __tests__/api/screeningCompleteBehavior.test.js __tests__/api/dryRunEmail.test.js __tests__/security/ApiAuthorizationCharacterization.test.js __tests__/security/BrandingRegressionCheck.test.js __tests__/security/VitestDiscoveryContract.test.js` (`apps/web`) | `0` | **6/6 files, 50/50 tests PASSED** (mocked `supabaseServer`, `smtp`, `ai`, `jsdom` UI; covers `V8-R1`, `V8-R2`, `V8-R3`, `V8-C2`, 7-branch non-enumeration, page-21 pagination, single-instance 8-way race, R2) |
| **Root Suites** | `node tests/contracts.mjs && node tests/postgres_schema.mjs && node tests/check_overlay.mjs && node tests/v3_regression.mjs` (root) | `0` | Contracts `8/8`, PGlite `5/5`, Overlay `9/9`, V3 Regression `6/6` |
| **v5 Employer-Chat Replay** | `node --no-warnings --experimental-vm-modules tests/employer-chat-v5.mjs` (root) | `0` | **38/38 PASSED**, `external requests: 0` (Node loopback HTTP) |
| **ESLint & Next.js Build** | `npm run lint && npm run build` (`apps/web`) | `0` | `0` lint errors (`3` `<img>` warnings), Webpack compiled in `14.3s`, **51/51** static pages generated (`76` route table entries) |
| **Guarded Disposable Harness** | `bash scripts/guarded_disposable_verify.sh` (`Run ID: 20261121T224805Z_64900`, DB `supabase_db_wbl-disposable-verify` `54422`, Kong `54421`, App `:3010`, `CAREERTWIN_DRY_RUN_EMAIL=true`, `WORKBYLINE_GENERATION_GATE=false`, live keys blank) | `0` | `status: "PASSED"`, `cleanup_status: "clean"`: Step 5 `1\|1\|0\|0\|1`; Step 6a **20/20 files (185/185 tests)**; Step 6b **6/6 files (61/61 tests)**; Step 8 live `:3010` **PASSED**; Step 9 Playwright **39 passed, 2 skipped, 0 failed** (`43.8s`) |

---

## 2. Remaining `NOT VERIFIED` Boundaries
- **Multi-Instance Shared Store (`V6-R1`):** Default limiter is single-process only; external Redis/PostgreSQL shared store wiring requires Founder decision and hosted verification.
- **Playwright Skips (`2/41`):** `EmployerDay3Assertions.test.js:439` (`Test E`) and `EmployerDay4Assertions.test.js:306` (`Scenario 14`).
- **Not Verified Locally:** Live SMTP delivery, live external AI/sourcing providers, persistent Python Context Engine (`:8011` / Temporal `:7233` / BGE weights), GitHub `main` synchronization (`R1`), and hosted staging.
