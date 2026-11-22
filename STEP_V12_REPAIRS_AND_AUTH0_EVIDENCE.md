# workBYLiNE Genome — V12 Repairs & Disposable Verification Evidence

- **Date:** 2026-11-22
- **Lifecycle Status:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`
- **Pinned `v10` Baseline:** `review/workbyline-v10-candidate` (`005144e517265a9556d67df51d82139c335a7479`)
- **Prior `v11` Commit:** `fix/v11-security-repairs` (`74f255f49670fe9409da9438966029d356ea6946`)
- **Current `v12` Branch:** `fix/v12-security-repairs`

---

## 1. Changed Files (`v11` -> `v12`)

- `apps/web/lib/gmail.js` (`createMemoryGmailNonceStore`, `setGmailNonceStore`, fail-closed at capacity, `now >= payload.exp` exact expiry rejection)
- `apps/web/app/api/search/route.js` (preserve `'` & `.` in `sanitizeSearchQuery`, double-quoted `.or(...)` operands)
- `apps/web/__tests__/security/V11SecurityRepairs.test.js` (expiry equality, fail-closed capacity, concurrent duplicate, punctuation preservation)
- `PARTH_HANDOFF.md`, `docs/handoff/START_HERE.md`, `.env.example`, `apps/web/.env.example` (`V11-C1` handoff & `GMAIL_OAUTH_STATE_SECRET=` template)
- `STEP_V12_REPAIRS_AND_AUTH0_REPORT.md`, `STEP_V12_REPAIRS_AND_AUTH0_EVIDENCE.md`
- `evidence/v12/disposable_db_and_search_receipts.txt`, `evidence/v12/V12_REPAIR_DIFF.patch`, `evidence/v12/V12_CHANGED_FILES.txt`

---

## 2. Raw Focused & Disposable DB / PostgREST Receipts

### 2.1 Independent `v11` Probe Baseline Reproduction (`fix/v11-security-repairs`)
Command: `node --no-warnings --experimental-vm-modules /tmp/wbl-v11-review/independent_v11_probes.mjs` (exit `0`, `TOTAL 19 / 19 external_attempts 0`), reproducing:
- `LIMIT_capacity_eviction_allows_consumed_state_again` (`replay_accepted: true`)
- `LIMIT_separate_instances_both_consume_same_state` (`both_instances_accepted: true`)
- `LIMIT_expiry_boundary_is_inclusive` (`accepted_exactly_at_expiry: true`)
- `LIMIT_legitimate_punctuation_is_changed` (`apostrophe: "O Reilly"`, `dot: "Node js"`)

### 2.2 Focused Vitest (`v12`)
Command: `cd apps/web && npx vitest run __tests__/security/V11SecurityRepairs.test.js __tests__/pages/AuthPage.test.jsx __tests__/security/ApiAuthorizationCharacterization.test.js`
Result: **3 test files passed (3), 38 tests passed (38)**, exit `0`.

### 2.3 Raw Disposable PostgreSQL (`54422`) & PostgREST (`54421`) Controls
Saved verbatim in `evidence/v12/disposable_db_and_search_receipts.txt`:
1. `SET LOCAL ROLE authenticated; SELECT gmail_refresh_token FROM public.profiles LIMIT 1;` -> `ERROR: permission denied for table profiles`
2. `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = 'a1111111-1111-4111-d2c0-000000000001'; SELECT id, email, name, role, company, gmail_connected, gmail_email FROM public.profiles WHERE id = 'a1111111-1111-4111-d2c0-000000000001';` -> `1 row` (`Alpha Owner`)
3. `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = 'a1111111-1111-4111-d2c0-000000000001'; SELECT id, email FROM public.profiles WHERE id <> 'a1111111-1111-4111-d2c0-000000000001';` -> `0 rows` (RLS cross-user denial)
4. `SET LOCAL ROLE service_role; SELECT count(gmail_refresh_token) AS service_role_count FROM public.profiles;` -> `1 row` (`0`, exit `0`)
5. PostgREST `GET http://127.0.0.1:54421/rest/v1/hiring_runs?select=id,role_title,company&or=...` for `O'Reilly`, `Node.js`, and `Staff id.neq.0` -> `status=200` for all 3.

### 2.4 Guarded Disposable Verification (`20261122T124350Z_23172`)
- `summary.json`: `"status": "PASSED"`, `"exit_code": 0`, `"cleanup_status": "clean"`, `disposable_target: 54422 / postgres / supabase_db_wbl-disposable-verify`, `listener_pid: null`.
- Step 6a: `21` test files, `191` tests passed.
- Step 6b: `6` test files, `61` tests passed.
- Step 7: ESLint `0` errors; Webpack build `14.2s`, `51/51` static pages.
- Step 8: Real PDF + pre-eval serialization passed.
- Step 9 (Playwright): `39` passed, `2` skipped (`42.8s`).

---

## 3. Source-vs-Evidence Manifest Scope

- `WorkByLine_Parth_Local_Review_v12.zip` `MANIFEST_SHA256.txt` covers **100% of included payload files** (excluding `node_modules/`, `.next/`, `.git/`, `test-results/`, `playwright-report/`, and historical `logs/guarded_verify_*` folders other than `20261122T124350Z_23172`).
- `WorkByLine_v12_Candidate.bundle` tracks source/migration/test/report commits (`review/workbyline-v10-candidate`, `fix/v11-security-repairs`, `fix/v12-security-repairs`) without `logs/guarded_verify_*` runtime artifacts.
