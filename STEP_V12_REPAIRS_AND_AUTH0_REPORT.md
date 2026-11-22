# workBYLiNE Genome — V12 Security Repairs & Corrected Auth0 Design

- **Date:** 2026-11-22
- **Phase:** VERIFICATION
- **Overall Lifecycle Status:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`
- **Preserved Frozen Archives:** `v10` (`b46d2f354e45c1817623b984d88e9b673c6da814d30f549940afb9e6ab76966e`) and `v11` (`dc01e311285cb3f4032154294b460c871862605044eb1babb0517d5e3014102b`) — **unchanged**
- **Git Branches:** `review/workbyline-v10-candidate` (`005144e517265a9556d67df51d82139c335a7479`), `fix/v11-security-repairs` (`74f255f49670fe9409da9438966029d356ea6946`), `fix/v12-security-repairs` (exported in `WorkByLine_v12_Candidate.bundle`)

---

## 1. Findings Closed (`V11-R1`, `V11-C1`, `V11-C2`, `V11-C3`)

| Finding | Root Cause in `v11` | `v12` Repair | Disposition |
|---|---|---|---|
| **V11-R1** Replay cache eviction & inclusive expiry boundary | `consumedNonces` evicted the oldest unexpired nonce at `MAX_TRACKED_NONCES` (2,000), and `now > payload.exp` allowed `now === exp`. Process-local map is not shared across instances. | Replaced FIFO eviction with `createMemoryGmailNonceStore({ maxEntries })` + `setGmailNonceStore(store)`: validates `maxEntries >= 1`, prunes expired entries (`<= now`), checks `has(nonce)`, and **fails closed** (`replay_store_full`) at capacity without evicting unexpired replay records. Changed expiry check to `now >= payload.exp` (rejecting exact expiry equality). Multi-instance/serverless deployment remains explicitly **single-process only** until an approved shared atomic store is wired. | **TEST-VERIFIED** (`V11SecurityRepairs.test.js`) |
| **V11-C1** Handoff entry points & `GMAIL_OAUTH_STATE_SECRET` env docs | `PARTH_HANDOFF.md` and `docs/handoff/START_HERE.md` referenced `v10`; `.env.example` and `apps/web/.env.example` omitted `GMAIL_OAUTH_STATE_SECRET`. | Updated `PARTH_HANDOFF.md` and `docs/handoff/START_HERE.md` to reference `v12` (`v10` pinned as baseline); added blank `GMAIL_OAUTH_STATE_SECRET=` to both `.env.example` files and documented deliberate key selection/fallback in `apps/web/lib/gmail.js`. | **VERIFIED** |
| **V11-C2** Stale committed manifest & source-vs-evidence divergence | `MANIFEST_SHA256.txt` in `fix/v11-security-repairs` was stale and Git retained prior run folders. | Regenerated `MANIFEST_SHA256.txt` cleanly for `v12` excluding `node_modules/`, `.next/`, `.git/`, `test-results/`, `playwright-report/`, and non-current `logs/` folders, and documented exact source-vs-evidence scope. | **VERIFIED** |
| **V11-C3** Search punctuation & real DB/PostgREST verification | `sanitizeSearchQuery` stripped `'` and `.` (turning `O'Reilly` into `O Reilly` and `Node.js` into `Node js`), and lacked raw disposable DB/PostgREST receipts. | Updated `sanitizeSearchQuery()` to preserve `'` and `.` while stripping `,`, `(`, `)`, `*`, `"`, `\` and escaping `%`/`_`, using double-quoted PostgREST `.or(...)` operands (`role_title.ilike."%${query}%",company.ilike."%${query}%"`). Executed raw `psql` privilege controls (`SQLSTATE 42501` + safe-column + cross-user + `service_role`) and live disposable PostgREST (`54421`) queries for `O'Reilly`, `Node.js`, and `Staff id.neq.0`. | **TEST-VERIFIED** (`V11SecurityRepairs.test.js` + `disposable_db_and_search_receipts.txt`) |

---

## 2. Corrected Auth0 Migration Design (`V11-D1`, `V11-D2` & Review Corrections 1–7)

*Design only — Auth0 is NOT implemented in `v12`.*

1. **No Automatic Email-Only Linking (`V11-D1`):** Never link an incoming Auth0 login to an existing `profiles` row on `email_verified` alone. Per Auth0's account-linking guidance (`https://auth0.com/docs/manage-users/user-accounts/user-account-linking/link-user-accounts`), require **proof of control of both accounts** (authenticated re-verification of the existing Supabase credential) or an explicitly audited, founder-approved one-time migration/invite workflow.
2. **Trusted `(issuer, subject)` Identity Binding (`V11-D1`):** Bind external accounts in `public.auth_identities (id UUID PRIMARY KEY, issuer TEXT NOT NULL, subject TEXT NOT NULL, user_id UUID NOT NULL, linked_at TIMESTAMPTZ, UNIQUE (issuer, subject))`, never a generic `provider = 'auth0'` label alone, preventing cross-tenant/issuer collisions (`https://supabase.com/docs/guides/auth/third-party/custom-oidc`).
3. **Supported Supabase Integration & `auth.uid()` / `auth.users` Treatment (`V11-D2`):**
   - Do **not** mint custom Supabase JWTs in application code or replace RLS with broad `service_role` queries.
   - Because PostgreSQL `auth.uid()` derives a UUID from JWT `sub` (and Auth0 `sub` values are non-UUID strings like `auth0|...`), injecting an `app_user_id` claim alone does **not** change `auth.uid()`.
   - Any Supabase Third-Party Auth (Auth0 `RS256` ID Token with Post-Login Action `role: 'authenticated'`) adoption requires an **audited SQL resolver/RLS migration** (e.g. `current_app_user_id()` mapping `(iss, sub)` via `auth_identities`) AND explicit migration of `profiles.id REFERENCES auth.users(id)` and `auth.users` email lookups (`20260803000001`, `20260804000001`). **Founder decision required** between: (A) Supabase Third-Party Auth + audited `current_app_user_id()` RLS migration, or (B) keeping Supabase Auth with `V6-R1` shared rate-limit backend.
4. **Next.js 16.2.1 SDK Surface (`proxy.ts`):** Genome uses Next.js `16.2.1`, where current `@auth0/nextjs-auth0` (`https://auth0.github.io/nextjs-auth0/`) recommends `proxy.ts` rather than `middleware.ts`. Pin and verify the exact `@auth0/nextjs-auth0` + Next.js `16.2.1` behavior before implementation.
5. **Exact Route & Matcher Enumeration:** `/auth` (page), `/auth/login` (Auth0 SDK default), and `/api/auth/signin` (API route) are distinct paths. Enumerate exact `matcher` rules and route paths rather than assuming prefix collisions; keep `/api/integrations/gmail/*` and API routes explicitly excluded from Auth0 login redirects so APIs return `401` JSON rather than `307` HTML redirects.
6. **Scope of Auth0 Cutover:** Retiring `/api/auth/signup`, `/api/auth/resend-verification`, `/api/auth/confirm`, and `/api/auth/signin` removes those endpoints only when explicitly disabled. Auth0 cutover does **not** replace Gmail OAuth `state`/nonce replay protection (`gmail.js`), server-side `getVerifiedOrgMembership` authorization, or application-level rate limits.
7. **Rollback & Data Treatment:** Retaining `auth.users` rows alone is insufficient for safe rollback. Define explicit handling for: (a) Auth0-created users who have no `auth.users` password/credential, (b) `organization_memberships` and pending `organization_invites` created during the pilot, (c) revoked/suspended accounts (`membership_status != 'active'`), and (d) active Auth0/Supabase sessions during reversal.
8. **Required Environment Variable Names (values omitted):** `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`, `APP_BASE_URL`, `AUTH0_AUDIENCE`.

---

## 3. Verification, Scanners & Readiness by Scope

- **Guarded Disposable Verification (`Run ID: 20261122T124350Z_23172`):** `PASSED` (`exit_code: 0`, `cleanup_status: "clean"`, disposable DB `54422`, `:3010`, `CAREERTWIN_DRY_RUN_EMAIL=true`, `WORKBYLINE_GENERATION_GATE=false`):
  - Step 6a: `21` test files, `191` tests passed.
  - Step 6b: `6` test files, `61` tests passed.
  - Step 7: ESLint `0` errors; Webpack build `14.2s`, `51/51` static pages.
  - Step 8: Real PDF + pre-eval serialization passed.
  - Step 9 (Playwright): `39` passed, `2` skipped (`42.8s`).
- **Scanners (`NOT VERIFIED`):** `semgrep`, `codeql`, `coderabbit`, `gitleaks`, `trivy`, `osv-scanner`, `snyk`, `bandit` are not installed; `npm audit` failed offline (`ENOTFOUND registry.npmjs.org`).

| Scope | Readiness | Blocking Gates |
|---|---|---|
| **V12 Bounded Security Repairs** | **TEST-VERIFIED** (controlled Vitest + disposable PostgreSQL/PostgREST) | Independent review of `v12` candidate |
| **Local Synthetic Demo** | **VERIFIED** (`20261122T124350Z_23172`) | Live SMTP/providers gated (`CAREERTWIN_DRY_RUN_EMAIL=true`) |
| **Hosted Demo / Design-Partner Pilot / Real-Company Data / Production** | **NOT VERIFIED** | Hosting topology, single- vs multi-instance Gmail/resend store, SAST/CodeRabbit scan, live provider/SMTP, Auth0 architecture decision |

**Remaining Founder Decisions:** (1) Choose Auth0 architecture (`A` vs `B`) or retain Supabase Auth + shared `V6-R1` store; (2) Authorize remote branch push + CodeRabbit/SAST CI scan; (3) Approve single-instance restriction or shared Redis/DB nonce + cooldown store before multi-instance hosting.
