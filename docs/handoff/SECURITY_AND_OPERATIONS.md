# Security & Operations (`SECURITY_AND_OPERATIONS.md`)

**v5 review candidate — local engineering review only.** This is a delta from the v4 Parth archive, not a clean checkout of its base commit. The v4 guarded run and production-build counts below are historical, not v5 executions. Current evidence and remaining gates: [v5 review record](../../V5_REVIEW.md).

**Lifecycle Status:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`

---

## 1. Authorization & Tenant Isolation Boundaries

1. **Server-Side Membership & Role Enforcement:**
   - Every employer API route enforces authenticated Supabase session/JWT + active `organization_memberships` lookup via `getVerifiedOrgMembership`.
   - `POST /api/candidate/screening-sessions/[sessionId]/complete` enforces candidate self-completion OR `ALLOWED_EMPLOYER_WRITER_ROLES = ['owner', 'admin', 'recruiter', 'hiring_manager']`; `auditor` and `viewer` roles receive `403 Forbidden` before any AI calls or DB writes.
   - `apps/web/components/ProtectedRoute.jsx` is a client-side UI wrapper only (returns `null` when role mismatches, logs `"Dev: Bypassing role check for"` in `useEffect` rather than redirecting), and is **never** a server security boundary.
2. **PostgreSQL Least-Privilege & RLS (`supabase/migrations/20260820..20260822`):**
   - `PUBLIC` and `anon` privileges revoked across all 15 operational/tenant tables; RLS enabled on all 15 tables.
   - `datavertex_credit_ledger` accessible only to `postgres`/`service_role` (direct `authenticated`/`anon` `SELECT`/`TRUNCATE` fails with `SQLSTATE 42501`).
   - `candidate_documents` and `claim_ledgers` allow `SELECT` only for `authenticated` (governed by tenant RLS), with all mutations via `SECURITY DEFINER` RPCs restricted to `service_role`.
   - `apps/web/lib/supabaseServer.js` fails closed if `SUPABASE_SERVICE_ROLE_KEY` is missing (never falls back to anon key).
3. **Retired / Quarantined Code Audit:**
   - `apps/web/app/api/employer/candidate-extractions/route.js` returns `410 Gone`.
   - `apps/web/lib/contextEvidenceWorker.js` throws `LEGACY_WORKER_DISABLED`.
   - `apps/web/lib/datavertex/sandboxCatalog.js` is unreferenced in `app/`, `lib/`, and `components/`.
   - `apps/web/app/api/employer/integrations/ashby/route.js` blocks `synthetic_sandbox` in production (`NODE_ENV === 'production'`).

---

## 2. Secret & Sensitive-File Hygiene

- **Automated Scan Scope (2026-11-19):** Scanned **1,043** non-cache, non-`.git`, non-`node_modules`, non-`.next`, non-`logs` staged source files for API key/private key patterns (`AIza*`, `sk-*`, `ghp_*`, `xox*-*`, `-----BEGIN * PRIVATE KEY-----`) and `.env`/`.pem`/`.key` files.
- **Scan Result:** `0` populated secrets in runtime source; `1` benign documentation regex example in `docs/architecture/checkpoints/step4b1/FRONTEND_SECRET_SCAN_REPORT.md:21`; `0` `.env`/`.env.local`/`.pem`/`.key` files in staged tree.
- **Scan Limitation:** Regex pattern scan cannot guarantee absence of custom/unpatterned passwords or third-party tokens outside scanned patterns; private archives under `backups/` (e.g., `backups/state-c-snapshot-20261114/`) and `docs/private/**` are excluded from all handoff ZIPs.

---

## 3. Protected Targets & Operational Rules

- **Protected Local Targets:** `supabase_db_careertwin-local-baseline` (`54330–54335`) and ports `3000` / `3004` must never be touched by verification scripts.
- **Resend Cooldown Hosting Boundary (`V6-R1`):** Default `createMemoryCooldownStore()` in `apps/web/app/api/auth/resend-verification/route.js` enforces atomic single-instance cooldown only. Multi-instance / serverless hosting remains **BLOCKED (`FOUNDER DECISION REQUIRED`)** until an approved shared backend is wired via `setResendCooldownStore()` — either **Option A:** PostgreSQL `auth_resend_cooldowns` table + atomic `SECURITY DEFINER` RPC migration, or **Option B:** Redis `SET key NX PX 60000` store.
- **Disposable Verification Target:** `supabase_db_wbl-disposable-verify` (`54422` / Kong `54421`), app port `3010`, `CAREERTWIN_DRY_RUN_EMAIL=true`.
- **External Call Policy:** No live AI, sourcing, or email sends are authorized without explicit Founder approval.
