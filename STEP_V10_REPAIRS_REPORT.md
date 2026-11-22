# workBYLiNE Genome — V10 Repairs Report (Closing V9 Bounded Delta Findings)

- **Date:** 2026-11-22
- **Phase:** VERIFICATION
- **Lifecycle Status:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`
- **Parent Frozen Archive:** `WorkByLine_Parth_Local_Review_v9.zip` (`19,930,164` bytes, SHA-256 `aa0dcde22d5bd2119190ca5bf14e44134b54365f5ba67be665e2449eb6368720`)
- **Review Input:** `WorkByLine_v9_Independent_Review_20261122.zip`

---

## 1. Executive Summary

This `v10` delta closes the bounded `v9` independent review findings (`V9-R1`, `V9-R2`, `V9-C1`) and records the source-to-review-branch gate and scanner disclosure without expanding scope into live external provider calls, deployments, or unrequested UI/KB/graph work.

All repairs were implemented in `apps/web/app/api/auth/resend-verification/route.js` and covered in `apps/web/__tests__/pages/AuthPage.test.jsx`, then verified through focused Vitest, ESLint, Webpack production build, and the full guarded disposable verification harness (`Run ID: 20261122T000858Z_78719`, `exit_code: 0`).

---

## 2. Findings Addressed

| Finding | Root Cause in `v9` | `v10` Repair | Status |
|---|---|---|---|
| **V9-R1** Active cooldown eviction under capacity pressure | `createResendCooldownStore` evicted the oldest FIFO entry when `map.size >= maxEntries`, deleting unexpired active cooldowns and allowing a second send before 60s. Also did not validate `maxEntries < 1`. | Validates `Number.isInteger(maxEntries) && maxEntries >= 1` (throws `RangeError` otherwise). Checks `existing > now` before capacity check. Prunes expired entries (`pruneExpired(now)`), and when `map.size >= maxEntries`, fails closed for new keys with `{ allowed: false, capacityLimited: true, retryAfterSeconds }` (`429`) without evicting active keys. | Repaired & verified (`AuthPage.test.jsx`) |
| **V9-R2** Missing/invalid `lastPage` pagination status difference | Oversized-directory check (`lastPage > maxPages`) only ran when `typeof lastPage === 'number'`, so payloads with `nextPage !== null` and missing/invalid `lastPage` matched page-1 accounts (`200`) while absent accounts hit page-25 exhaustion (`503`). | Enforces `advertisesMore && (!Number.isInteger(lastPage) || lastPage < page || lastPage > maxPages)` -> `503 VERIFICATION_LOOKUP_UNAVAILABLE` **before** page-1 matching. Inspected `@supabase/auth-js` `GoTrueAdminApi.listUsers` contract (`nextPage: number \| null`, `lastPage: number`). | Repaired & verified (`AuthPage.test.jsx`) |
| **V9-C1** Global 50-call budget availability tradeoff & cooldown churn | Directory call budget was only checked after reserving an email cooldown, and the single-instance 50-call/60s budget availability tradeoff needed explicit documentation. | Added `hasDirectoryCallBudget()` pre-check before reserving an email cooldown so budget-exhausted requests fail cleanly (`503`) without churning the per-email cooldown map. Documented the single-instance availability tradeoff and open `V6-R1` multi-instance requirement. | Repaired & documented |

---

## 3. Open Design & Hosting Gates (Unchanged from v6–v9)

1. **`V6-R1` Multi-Instance Shared Cooldown & Budget Store:** The default in-memory `Map` stores enforce cooldowns and directory call budgets within a single Node.js process (`apps/web/app/api/auth/resend-verification/route.js`). Multi-instance public hosting requires wiring a shared store (e.g., Redis/database) via `createResendVerificationHandler({ cooldownStore, directoryBudgetStore })`, or running single-instance until wired.
2. **Global Directory Call Budget (`V9-C1`):** The single-instance 50-call/60s `listUsers` budget prevents unbounded fan-out under distinct-email churn, which intentionally trades availability under sustained unauthenticated churn (`503`) for directory protection.
3. **Live Provider / SMTP Verification:** All verification in `v10` ran with `CAREERTWIN_DRY_RUN_EMAIL=true`, `WORKBYLINE_GENERATION_GATE=false`, and blank third-party API keys. Live SMTP and real-company-data acceptance remain separate gates.

---

## 4. Source-to-Review-Branch Mapping & Scanner Disclosure

- **GitHub `origin/main` Gate:** Public GitHub `origin/main` remains at `cd5b85db99b3127abbb62d7e7182a744b836846c` with a different root layout and does **not** contain the `v5`–`v10` codebase. Any automated review must target a dedicated review branch created from the `v10` archive (for example `review/workbyline-v10-candidate`), never `cd5b85db99b3127abbb62d7e7182a744b836846c`.
- **CodeRabbit & Static Security Scanners:** CodeRabbit, `semgrep`, `codeql`, and `gitleaks` did **not** run locally (not installed in this environment, and no GitHub push was performed).

---

## 5. Verification Summary

- **Focused Vitest (`apps/web`):** `6` test files, `50` tests passed (`0` failed).
- **ESLint (`npm run lint`):** `0` errors (`3` pre-existing `<img>` warnings).
- **Production Build (`npm run build`):** Compiled in `12.5s`, `51/51` static pages generated.
- **Guarded Disposable Verification (`Run ID: 20261122T000858Z_78719`):** `status: "PASSED"`, `exit_code: 0`, `cleanup_status: "clean"` against disposable `supabase_db_wbl-disposable-verify` (`54422`) and isolated server (`3010`), including Step 6a (`20` files / `185` tests), Step 6b (`6` files / `61` tests), Step 7 (`lint` + `build` `18.3s`, `51/51` pages), Step 8 (real PDF upload/parse/download/generate + competing pre-eval serialization), and Step 9 Playwright (`39` passed, `2` skipped).

See [STEP_V10_REPAIRS_EVIDENCE.md](./STEP_V10_REPAIRS_EVIDENCE.md) for exact receipts, file paths, and archive parity details.
