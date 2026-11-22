# workBYLiNE Genome — v9 Bounded Auth-Recovery & Handoff Repairs Report

**Date:** 2026-11-22  
**Lifecycle State:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`  
**Parent Frozen Candidate:** `WorkByLine_Parth_Local_Review_v8.zip` (`e834acb929bde40968cd7426ffcd858785f2fd3d0d7b340df9a15990609fd00e`)  
**New Candidate:** `WorkByLine_Parth_Local_Review_v9.zip` (see `STEP_V9_REPAIRS_EVIDENCE.md` for SHA-256 and manifest)

---

## 1. Executive Summary

Closed the remaining bounded findings from `WorkByLine_v8_Independent_Review_20261122.zip`:
- **`V8-R1` (Aggregate Directory Work Budget):** Reduced synchronous `listUsers` fallback cap from `1,000` to `MAX_LIST_USERS_PAGES = 25` and added an endpoint-wide window budget (`MAX_DIRECTORY_CALLS_PER_WINDOW = 50` calls per `60s` across all emails, returning `429 RATE_LIMITED` when exhausted).
- **`V8-R2` (Oversized Directory Status Differentiation):** When `listUsers` advertises `lastPage > MAX_LIST_USERS_PAGES`, `findUserByEmail` now fails fast and uniformly (`503 VERIFICATION_LOOKUP_UNAVAILABLE`) on page 1 before matching any user, eliminating the page-1 `200` vs. absent `503` distinction.
- **`V8-R3` (Expired Cooldown Entry Pruning & Bounded Cardinality):** `createMemoryCooldownStore({ maxEntries = 2000 })` now prunes expired entries (`expiresAt <= now`) on `tryReserve` (plus FIFO eviction if active keys exceed `maxEntries`), bounding memory under distinct-address churn.
- **`V8-C1` (Root Handoff Broken Relative Links):** Replaced the broken root-copied `PARTH_HANDOFF.md` links with valid root-relative links pointing to `./docs/handoff/PARTH_HANDOFF.md`, `./docs/handoff/START_HERE.md`, and `./STEP_V9_REPAIRS_*` (`54/54` links verified, `0` broken).
- **`V8-C2` (Optional `getUserByEmail` Malformed Payload Guard):** `findUserByEmail` now requires `{ data: { user } }` (and valid `email` when non-null), returning `503 VERIFICATION_LOOKUP_UNAVAILABLE` on malformed `{ data: { unexpected: true } }` responses instead of treating them as absence.

---

## 2. Exact Source Delta (`8` Changed/Added Paths vs. Frozen v8)

1. `apps/web/app/api/auth/resend-verification/route.js` — Bounded `MAX_LIST_USERS_PAGES = 25`, aggregate `MAX_DIRECTORY_CALLS_PER_WINDOW = 50` (`429`), uniform `lastPage > 25` early `503`, strict `getUserByEmail` contract validation, and expired-key pruning / `maxEntries = 2000` bounded cooldown store.
2. `apps/web/__tests__/pages/AuthPage.test.jsx` — Added regression tests for `V8-C2` malformed `getUserByEmail`, `V8-R2` oversized directory uniform `503`, `V8-R1` 50-call aggregate budget (`429`), and `V8-R3` expired-key pruning (`400 -> 1` after expiry).
3. `PARTH_HANDOFF.md` — Root entry point with valid root-relative links (`V8-C1`).
4. `docs/handoff/START_HERE.md`, `docs/handoff/PARTH_HANDOFF.md`, `docs/handoff/DATA_AND_API_CONTRACTS.md` — Updated candidate identity to `v9` and documented the bounded lookup/cooldown contract.
5. `STEP_V9_REPAIRS_REPORT.md` & `STEP_V9_REPAIRS_EVIDENCE.md` (plus `evidence/v9/V9_REPAIR_DIFF.patch`).

---

## 3. Remaining Release Gates & Founder Choice (`V6-R1`)

- **Founder Decision Required (`V6-R1` Multi-Instance Hosting):** Default `createMemoryCooldownStore()` and `directoryWindowCalls` remain single-process only. Multi-instance / serverless hosting remains **`BLOCKED / FOUNDER DECISION REQUIRED`** between:
  - **Option A:** PostgreSQL `auth_resend_cooldowns` table + atomic `SECURITY DEFINER` RPC migration + O(1) indexed user lookup (or approved GoTrue email configuration) so no synchronous `listUsers` scan is needed.
  - **Option B:** Redis (`SET key NX PX 60000` + aggregate counter) wired via `setResendCooldownStore()`.
- **Rollback:** Retain frozen `WorkByLine_Parth_Local_Review_v8.zip` (`e834acb929bde40968cd7426ffcd858785f2fd3d0d7b340df9a15990609fd00e`) as comparison reference. Zero SQL migrations were added in v9.
