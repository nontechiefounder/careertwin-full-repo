# workBYLiNE Genome — v8 Auth Recovery & Review Closure Report

**Date:** 2026-11-21  
**Lifecycle State:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`  
**Parent Frozen Candidate:** `WorkByLine_Parth_Local_Review_v7.zip` (`a8965a16b39c5d0b332aaf91c47dcd0d868afb170b886259ab47c2d8617e71a0`)  
**New Candidate:** `WorkByLine_Parth_Local_Review_v8.zip` (see `STEP_V8_REPAIRS_EVIDENCE.md` for SHA-256 and manifest)

---

## 1. Executive Summary

Addressed the three remaining findings from `WorkByLine_v7_Independent_Review_20261121.zip`:
1. **`V6-R3` (Failure-Branch Account Enumeration in `resend-verification/route.js`):** Public `POST /api/auth/resend-verification` now logs internal delivery/link failures privately (without tokens/credentials) and returns the **exact same** `200` `{ delivery_status: 'accepted', message: 'If an unverified account exists for this email, a verification email will be sent.' }` across absent, confirmed, dry-run, unconfirmed-sent, unconfirmed-SMTP-failure, and unconfirmed-link-failure branches. Truthful `POST /api/auth/signup` partial-success metadata (`account_created: true`, `retry_supported: true`, `500`/`503`) is preserved.
2. **`V7-P1` (Scan-Cap Truncation / Incomplete Lookup in `resend-verification/route.js`):** Raised the bounded directory pagination safety ceiling (`MAX_LIST_USERS_PAGES = 1000`, supporting up to 1,000,000 users; or `getUserByEmail` when available) and changed cap exhaustion / malformed `users` payloads to return `503 VERIFICATION_LOOKUP_UNAVAILABLE` (`incomplete: true`) rather than silently treating an incomplete search as an absent account.
3. **`V6-D1` (Entry-Point & Root Handoff Parity):** Updated `docs/handoff/START_HERE.md` to open with `v8` identity and made root `PARTH_HANDOFF.md` byte-identical to `docs/handoff/PARTH_HANDOFF.md`.
4. **`V6-R1` (Explicit Multi-Instance Cooldown Boundary — `FOUNDER DECISION REQUIRED`):** Corrected `AuthPage.test.jsx` to state explicitly that `createMemoryCooldownStore()` enforces atomic single-instance concurrency (`1 x 200`, `7 x 429`) and `setResendCooldownStore()` is an adapter interface only. Multi-instance / serverless hosting remains **BLOCKED (`FOUNDER DECISION REQUIRED`)** between:
   - **Option A:** PostgreSQL `auth_resend_cooldowns` table + atomic `SECURITY DEFINER` RPC migration.
   - **Option B:** Redis `SET key NX PX 60000` store wired via `setResendCooldownStore()`.

---

## 2. Exact Files Changed (`10` total vs. Frozen v7)

1. `apps/web/app/api/auth/resend-verification/route.js` — Non-enumerating `200` across delivery/link failure branches, `MAX_LIST_USERS_PAGES = 1000` + `503 VERIFICATION_LOOKUP_UNAVAILABLE` on incomplete/malformed lookup.
2. `apps/web/__tests__/pages/AuthPage.test.jsx` — Corrected single-instance + adapter test wording, added page-21 pagination test, added `503` malformed lookup test, and verified `200 accepted` parity across absent, confirmed, unconfirmed-sent, SMTP-failure, and thrown-link-failure branches.
3. `docs/handoff/START_HERE.md` — Updated opening candidate identity to `v8` and linked `STEP_V8_REPAIRS_REPORT.md` / `STEP_V8_REPAIRS_EVIDENCE.md`.
4. `docs/handoff/PARTH_HANDOFF.md` & `PARTH_HANDOFF.md` — Synchronized byte-for-byte with `v8` identity.
5. `docs/handoff/DATA_AND_API_CONTRACTS.md` — Updated `/api/auth/resend-verification` contract.
6. `docs/handoff/SECURITY_AND_OPERATIONS.md` — Documented `V6-R1` multi-instance Founder decision options.
7. `STEP_V8_REPAIRS_REPORT.md` & `STEP_V8_REPAIRS_EVIDENCE.md` — Checkpoint report and verification evidence.
8. `evidence/v8/V8_REPAIR_DIFF.patch` (plus `V8_CHANGED_FILES.txt`).
