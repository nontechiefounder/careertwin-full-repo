# workBYLiNE Genome — v7 Verification Evidence (`V6-R1`–`V6-R4`, `V6-C1`, `V6-C2`, `V6-D1`)

**Date:** 2026-11-21  
**Lifecycle State:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`  
**Parent Frozen Candidate:** `WorkByLine_Parth_Local_Review_v6.zip` (`de53be583e24dda12340f6508d355a12a685fdfb31dbdbcb8407e35d990cf1a3`)

---

## 1. Baseline Reproduction (`independent_probes.mjs` on Unchanged v6)

- **Command:** `node --no-warnings --experimental-vm-modules /tmp/wbl-v6-review/independent_probes.mjs`
- **Observed Failures Reproduced:**
  - `NEW_resend_cooldown_race` (`V6-R1`): `8/8` concurrent requests returned `200` and triggered `8` synthetic sends.
  - `NEW_resend_user_on_second_page` (`V6-R2`): `listUsers` called once (`page 1`), returned `ignored_or_already_verified` (`0` deliveries) for user on `page 2`.
  - `NEW_resend_account_state_distinguishable` (`V6-R3`): `known` returned `sent` (`email_sent=true`) vs `unknown` returned `ignored_or_already_verified` (`email_sent=false`).
  - `NEW_signup_unexpected_link_exception_loses_partial_success` (`V6-R4`): thrown `generateLink` returned `500` `{ error: "Internal server error" }` with `account_created: undefined`.
  - `LIMIT_screening_mixed_valid_and_blank_rows` (`V6-C1`): returned `200` with `1` generation and `1` RPC when one valid row + one blank row existed.

---

## 2. Post-Repair Verification Matrix (on `/tmp/wbl-v7-candidate`)

| Check | Command & CWD | Exit | Result & Boundary |
|---|---|---:|---|
| **Locked Install (Root & Web)** | `npm ci --no-audit --no-fund` (root & `apps/web`) | `0` | `4` root + `936` web packages installed cleanly |
| **Focused V7 Vitest Suites** | `npx --no-install vitest run __tests__/pages/AuthPage.test.jsx __tests__/api/screeningCompleteBehavior.test.js __tests__/api/dryRunEmail.test.js __tests__/security/ApiAuthorizationCharacterization.test.js __tests__/security/BrandingRegressionCheck.test.js __tests__/security/VitestDiscoveryContract.test.js` (`apps/web`) | `0` | **6/6 files, 50/50 tests PASSED** (mocked `supabaseServer`, `smtp`, `ai`, `jsdom` UI; covers `8`-request race `1x200`/`7x429`, 2-instance `sharedStore`, `page 2` >1,000-user pagination, non-enumeration parity, thrown `generateLink` `500` partial-success preservation, R2/V6-C1 cases, `/auth` copy removal) |
| **Root Suites** | `node tests/contracts.mjs && node tests/postgres_schema.mjs && node tests/check_overlay.mjs && node tests/v3_regression.mjs` (root) | `0` | Contracts `8/8`, PGlite `5/5`, Overlay `9/9`, V3 Regression `6/6` |
| **v5 Employer-Chat Replay** | `node --no-warnings --experimental-vm-modules tests/employer-chat-v5.mjs` (root) | `0` | **38/38 PASSED**, `external requests: 0` (Node loopback HTTP) |
| **ESLint & Next.js Build** | `npm run lint && npm run build` (`apps/web`) | `0` | `0` lint errors (`3` `<img>` warnings), Webpack compiled in `12.0s`, **51/51** static pages generated (`76` route table entries) |
| **Guarded Disposable Harness** | `bash scripts/guarded_disposable_verify.sh` (`Run ID: 20261121T123258Z_7231`, DB `supabase_db_wbl-disposable-verify` `54422`, Kong `54421`, App `:3010`, `WORKBYLINE_GENERATION_GATE=false`, live keys blank, `CAREERTWIN_DRY_RUN_EMAIL=true`) | `0` | `status: "PASSED"`, `cleanup_status: "clean"`: Step 5 `1\|1\|0\|0\|1`; Step 6a **20/20 files (185/185 tests)**; Step 6b **6/6 files (61/61 tests)**; Step 8 live `:3010` **PASSED**; Step 9 Playwright **39 passed, 2 skipped, 0 failed** (`41.8s`) |

*(Note: An initial guarded run `20261121T122232Z_6360` exited `2` at Step 2 because the `wbl-disposable-verify` Docker containers were stopped; after starting the containers, `20261121T123258Z_7231` passed cleanly.)*

---

## 3. Skips & `NOT VERIFIED` Boundaries

- **Playwright Skips (`2/41`):** `EmployerDay3Assertions.test.js:439` (`Test E`) and `EmployerDay4Assertions.test.js:306` (`Scenario 14`), both pre-existing UI skips (`DocumentDropzone / intake-handoff-notice removed from /employer/intake in current UI`).
- **Not Verified Locally:** Multi-instance external Redis/DB cooldown backend (tested via injected in-memory `sharedStore`), live SMTP delivery, live external AI/sourcing providers, persistent Python Context Engine (`:8011` / Temporal `:7233` / BGE weights), and hosted staging.
