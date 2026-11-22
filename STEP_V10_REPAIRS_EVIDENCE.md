# workBYLiNE Genome — V10 Repairs Evidence

- **Date:** 2026-11-22
- **Lifecycle Status:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`
- **Parent Frozen Archive:** `WorkByLine_Parth_Local_Review_v9.zip` (`19,930,164` bytes, SHA-256 `aa0dcde22d5bd2119190ca5bf14e44134b54365f5ba67be665e2449eb6368720`)

---

## 1. Baseline Reproduction on Unchanged `v9`

Extracted `WorkByLine_v9_Independent_Review_20261122.zip` to `/tmp/wbl-v9-review` and `WorkByLine_Parth_Local_Review_v9.zip` to `/tmp/wbl-v10-candidate`. Running `/tmp/wbl-v9-review/independent_v9_probes.mjs` against unchanged `v9` confirmed `TOTAL 20 / 20 external_attempts 0`, reproducing:
- `V9-R1`: Eviction of active unexpired cooldown reservation under `maxEntries` capacity pressure.
- `V9-R2`: `nextPage !== null` with missing `lastPage` returning `200` on page-1 match vs. `503` on absent email.
- `V9-C1`: Directory budget exhaustion and cooldown interaction.

---

## 2. SDK Contract & Source Changes

- **Installed SDK Contract:** Inspected `@supabase/auth-js` in `apps/web/node_modules/@supabase/auth-js/dist/module/`: `GoTrueAdminApi.listUsers` initializes `{ nextPage: null, lastPage: 0, total: 0 }` (`types.d.ts` `lastPage: number`, `nextPage: number | null`) and does not expose `getUserByEmail`.
- **Modified Source Files:**
  - `apps/web/app/api/auth/resend-verification/route.js`
  - `apps/web/__tests__/pages/AuthPage.test.jsx`
  - `PARTH_HANDOFF.md`
  - `docs/handoff/START_HERE.md`
  - `docs/handoff/PARTH_HANDOFF.md`
  - `docs/handoff/DATA_AND_API_CONTRACTS.md`
  - `STEP_V10_REPAIRS_REPORT.md`
  - `STEP_V10_REPAIRS_EVIDENCE.md`
  - `evidence/v10/V10_REPAIR_DIFF.patch`

---

## 3. Command & Test Receipts

### 3.1 Locked Dependency Install
- `npm ci --no-audit --no-fund` at repo root (`4` packages) -> exit `0`.
- `npm ci --no-audit --no-fund` in `apps/web` (`936` packages) -> exit `0`.

### 3.2 Focused Vitest, Lint & Build (Pre-Harness)
- Focused Vitest (`AuthPage.test.jsx`, `screeningCompleteBehavior.test.js`, `dryRunEmail.test.js`, `ApiAuthorizationCharacterization.test.js`, `BrandingRegressionCheck.test.js`, `VitestDiscoveryContract.test.js`): **6/6 files, 50/50 tests passed** (exit `0`).
- `npm run lint`: **0 errors**, `3` `<img>` warnings (`NaiveShell.jsx`, `MarketingFooter.jsx`, `MarketingNav.jsx`).
- `npm run build` (`next build --webpack`): Compiled in `12.5s`, **51/51** static pages generated, exit `0`.

### 3.3 Guarded Disposable Verification (`20261122T000858Z_78719`)
Executed `scripts/guarded_disposable_verify.sh` against disposable `supabase_db_wbl-disposable-verify` (`127.0.0.1:54422`, Kong `54421`), isolated server on `http://localhost:3010`, `CAREERTWIN_DRY_RUN_EMAIL=true`, `WORKBYLINE_GENERATION_GATE=false`, and all third-party API keys blanked:
- `summary.json`: `"status": "PASSED"`, `"exit_code": 0`, `"cleanup_status": "clean"`, `"listener_pid": null`.
- **Step 6a (Unit & Mocked Contract Suites):** `20` test files passed, `185` tests passed.
- **Step 6b (Security, Provenance & Release Blocker Suites):** `6` test files passed, `61` tests passed.
- **Step 7 (ESLint & Webpack Build under strict allowlist):** ESLint `0` errors; Webpack compiled in `18.3s`, `51/51` static pages generated.
- **Step 8 (Server Startup & Real-PDF / Pre-Eval Serialization):** Passed (`pages=2`, `sha256=90ebc8dfa402...`).
- **Step 9 (Playwright Browser Assertions against `http://localhost:3010`):** `39` passed, `2` skipped (`41` total).

---

## 4. Non-Executed Checks Disclosure

- **CodeRabbit / Static Security Scanners:** Not executed (`semgrep`, `codeql`, `coderabbit`, `gitleaks` are not installed locally; no GitHub branch push was performed).
- **Live External Providers / SMTP:** Not executed (`CAREERTWIN_DRY_RUN_EMAIL=true`; all provider keys blanked).
- **GitHub `origin/main`:** Unchanged at `cd5b85db99b3127abbb62d7e7182a744b836846c` (non-matching root layout; excluded from v10 coverage claims).
