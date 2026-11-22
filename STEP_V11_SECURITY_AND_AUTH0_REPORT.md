# workBYLiNE Genome — V11 Bounded Security Repairs & Auth0 Migration Design

- **Date:** 2026-11-22
- **Phase:** VERIFICATION
- **Overall Lifecycle Status:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`
- **Parent Frozen Archive:** `WorkByLine_Parth_Local_Review_v10.zip` (`20,737,959` bytes, SHA-256 `b46d2f354e45c1817623b984d88e9b673c6da814d30f549940afb9e6ab76966e`) — **preserved unchanged**
- **Baseline Review Branch:** `review/workbyline-v10-candidate` (`005144e517265a9556d67df51d82139c335a7479`, `1,038/1,038` payload parity)
- **V11 Repair Branch:** `fix/v11-security-repairs` (exported with reproducible Git bundle `WorkByLine_v11_Candidate.bundle`)

---

## 1. Bounded Security Repairs (Dispositions & Changes)

| Finding | Root Cause in `v10` | `v11` Repair | Disposition |
|---|---|---|---|
| **Gmail OAuth State / Session Binding & Callback Error Handling** | `apps/web/lib/gmail.js` `getAuthUrl()` sent no `state`; `connect/route.js` set no OAuth transaction cookie; `callback/route.js` exchanged `code` without verifying session-bound `state`, interpolated raw `error` into `${process.env.NEXT_PUBLIC_URL}/employer/integrations?error=${error}` (could also produce `"undefined/..."`). | Added HMAC-SHA256 signed `state` (`{ sub, nonce, iat, exp }`, 10-minute TTL) + `HttpOnly; SameSite=Lax` cookie (`wbl_gmail_oauth_state`) + bounded single-use `consumedNonces` replay map in `apps/web/lib/gmail.js`; enforced verification in `callback/route.js` **before** `getTokens(code)` or `profiles` DB write; allowlisted callback `error` codes (`ALLOWED_OAUTH_ERRORS`) and used `URL` + `searchParams.set()`. | **TEST-VERIFIED** (`V11SecurityRepairs.test.js`) |
| **Browser-Facing Profile Credential Exposure & DB Column Grants** | `apps/web/app/api/auth/me/route.js` used `.from('profiles').select('*')` and spread `...baseProfile`; `public.profiles` had table-level `SELECT` granted to `authenticated` (`20260803000001`), exposing `gmail_refresh_token`. | Replaced `.select('*')` with explicit non-credential columns and explicit safe response object in `apps/web/app/api/auth/me/route.js`. Added `supabase/migrations/20260823000001_revoke_profiles_token_select.sql` revoking table-level `SELECT` on `public.profiles` from `anon, authenticated` and granting column-level `SELECT` on safe columns only (preserving `service_role` for server-side Gmail send/callback). | **TEST-VERIFIED** (`V11SecurityRepairs.test.js` + direct `psql` `SQLSTATE 42501` check on disposable DB `54422`) |
| **Search Filter Interpolation & Swallowed Query Errors** | `apps/web/app/api/search/route.js` interpolated raw `query` into `.or(\`role_title.ilike.%${query}%,company.ilike.%${query}%\`)` and ignored `runsError`/`candError`. | Added `sanitizeSearchQuery()` (bounds length to 100 chars, strips PostgREST metacharacters `\\,"'().*`, escapes `%` and `_`), preserved `.eq('employer_id', user.id)` + RLS scoping, and returned HTTP `500` on `runsError` or `candError`. | **TEST-VERIFIED** (`V11SecurityRepairs.test.js` + `ApiAuthorizationCharacterization.test.js`) |

*Note on evidence boundaries:* We do not claim a cross-tenant exploit from string interpolation alone, an open redirect without demonstration, or absence of database-at-rest encryption from unwrapped column writes.

---

## 2. Scanner Availability & Boundaries

- **Unavailable SAST / Secret Scanners (`NOT VERIFIED`):** `semgrep`, `codeql`, `coderabbit`, `gitleaks`, `trivy`, `osv-scanner`, `snyk`, and `bandit` are not installed in this environment.
- **Dependency Vulnerability Audit (`NOT VERIFIED`):** `npm --prefix apps/web audit --json` failed offline (`ENOTFOUND registry.npmjs.org`).
- **Deterministic Local Check:** Static route/sink/secret inspection ran across `51` API routes, `34` lib modules, and `29` SQL migrations (recorded in `STEP_V10_SOURCE_ALIGNMENT_AND_SECURITY_AUDIT_REPORT.md`); this is not equivalent to Semgrep/CodeQL/CodeRabbit/Gitleaks coverage.

---

## 3. Auth0 Migration Design (Design Only — Not Implemented in `v11`)

### 3.1 Affected Component Inventory
- **UI & Client Routing:** `apps/web/app/auth/**` (signup, signin, recovery, resend), `apps/web/components/ProtectedRoute.jsx`, `apps/web/lib/auth.js` (client session helpers).
- **Middleware & Route Handlers:** No `apps/web/middleware.js` currently exists; all `51` routes under `apps/web/app/api/**` use `createSupabaseServerClient` (`apps/web/lib/supabaseServer.js`) or `requireUser` / `authenticateServerRequest` (`apps/web/lib/serverAuth.js`).
- **Database Schema, RLS & Storage (`supabase/migrations/20260803..20260823`):**
  - `public.profiles.id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE` (`20260803000001`).
  - `auth.uid()` and `auth.users` email lookups in RLS policies & helper functions (`20260804000001`, `20260803000003`), `organization_memberships.user_id`, `hiring_runs.employer_id`, `candidate_profiles` (`candidate_profiles_id_fkey` already decoupled from `auth.users` in `20260817000001`), and `SECURITY DEFINER` RPCs (`complete_screening_session_transactional`, `record_pre_evaluation_decision_transactional`, `datavertex_reserve_credits`, `shortlist_candidate_from_provider_transactional`).
  - Private storage bucket `candidate_resumes` RLS policies.

### 3.2 Preserving Internal UUIDs & Identity Mapping
- **Constraint:** Auth0 `sub` values are non-UUID strings (e.g. `auth0|...`, `google-oauth2|...`), whereas Genome's PostgreSQL schema, `profiles.id`, `organization_memberships.user_id`, and `auth.uid()` expect `UUID`.
- **Recommended Pattern:** Preserve internal `UUID` user IDs via a trusted `public.auth_identities (id UUID, provider TEXT, subject TEXT, user_id UUID NOT NULL, email_verified BOOLEAN, UNIQUE(provider, subject))` mapping table (service-role managed).
- **Supabase Integration Options:**
  1. **Supabase Third-Party Auth (Auth0 OIDC) + UUID Claim:** Per official Supabase Auth0 documentation, Auth0 strips non-namespaced claims from Access Tokens, so an Auth0 Post-Login Action injects `role: 'authenticated'` into the **ID Token** (`RS256`), and Supabase verifies the Auth0 OIDC discovery JWKS (`[auth.third_party.auth0]` / Dashboard). To preserve UUIDs without rewriting every `UUID` column to `TEXT`, inject a verified `app_user_id` UUID claim in the Auth0 Post-Login Action (or resolve `auth_identities` server-side via a `current_app_user_id()` SQL helper replacing raw `auth.uid()` in RLS policies).
  2. **Server-Side BFF Session + Minted Short-Lived Supabase JWT (Recommended for minimal RLS churn):** `@auth0/nextjs-auth0` (v4 `Auth0Client` + `middleware.ts`) handles browser login/logout/callback; server routes verify the Auth0 session, resolve/provision the internal `UUID` via `auth_identities`, and mint or bind a Supabase-compatible JWT with `sub = internal_uuid` and `role = 'authenticated'` (or execute RLS-scoped queries via `service_role` only after server-side `getVerifiedOrgMembership` checks).

### 3.3 Conflicts with Existing `/auth` Routes
- `@auth0/nextjs-auth0` v4 mounts `/auth/login`, `/auth/logout`, `/auth/callback`, and `/auth/profile` in `middleware.ts` by default, which collides with Genome's existing `apps/web/app/auth/` page (`GET /auth`) and `apps/web/app/api/auth/*` routes.
- **Resolution:** Either mount Auth0 routes under a distinct prefix (e.g. `/api/auth0/login`, `/api/auth0/callback`) during dual-run, or retire `apps/web/app/auth/page.jsx` and `/api/auth/signin`, `/api/auth/signup`, `/api/auth/resend-verification`, `/api/auth/confirm` at cutover.

### 3.4 Provisioning, Account Linking, Invites & Role Revocation
- **Provisioning & Existing-Account Migration:** On first Auth0 login, require `email_verified === true` before linking to an existing `profiles` row by verified email; never auto-link unverified emails. Store `(provider='auth0', subject=sub, user_id=existing_uuid)` in `auth_identities`.
- **Organization Invitations & Role Revocation:** Keep `organization_memberships` and `organization_invites` in PostgreSQL as the source of truth for RBAC (`owner`, `admin`, `recruiter`, `hiring_manager`, `auditor`, `viewer`) and `membership_status`. Revoking a member's `membership_status` immediately blocks server routes (`getVerifiedOrgMembership`) without waiting for Auth0 token expiry.

### 3.5 Cutover, Rollback & Required Environment Variable Names
- **Cutover:** (1) Deploy `auth_identities` migration + dual-read `serverAuth.js`; (2) Enable Auth0 tenant + Post-Login Action (`RS256` ID token `role: 'authenticated'`); (3) Migrate/link pilot users; (4) Retire `/api/auth/signin`, `/api/auth/signup`, `/api/auth/resend-verification`, `/api/auth/confirm`.
- **Rollback:** Keep Supabase Auth `auth.users` rows intact during pilot; toggle auth feature flag back to Supabase Auth without data loss.
- **Required Environment Variable Names (values omitted):** `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`, `APP_BASE_URL`, `AUTH0_AUDIENCE` (if using API access tokens).

---

## 4. Verification Summary & Readiness by Scope

- **Guarded Disposable Verification (`Run ID: 20261122T121331Z_11248`):** `PASSED` (`exit_code: 0`, `cleanup_status: "clean"`):
  - Step 5: Applied all forward migrations including `20260823000001_revoke_profiles_token_select.sql`; invariants `1|1|0|0|1` confirmed.
  - Step 6a: `21` test files, `190` tests passed (includes `V11SecurityRepairs.test.js` and `VitestDiscoveryContract.test.js` = `68` suites).
  - Step 6b: `6` test files, `61` tests passed.
  - Step 7: ESLint `0` errors; Webpack build `13.2s`, `51/51` static pages.
  - Step 8: Real PDF upload/parse/download/generate & pre-eval serialization passed.
  - Step 9: Playwright `39` passed, `2` skipped (`42.8s`).
- **Direct Disposable DB Privilege Check (`54422`):** `SET LOCAL ROLE authenticated; SELECT gmail_refresh_token FROM public.profiles` -> `SQLSTATE 42501: permission denied`.

| Scope | Assessment | Blocking Gates |
|---|---|---|
| **V11 Bounded Security Repairs** | **TEST-VERIFIED** (controlled Vitest + disposable PostgreSQL) | Independent review of `v11` candidate |
| **Local Synthetic Demo** | **VERIFIED** (`20261122T121331Z_11248`) | Live SMTP/providers gated (`CAREERTWIN_DRY_RUN_EMAIL=true`) |
| **Hosted Demo** | **NOT VERIFIED** | Hosting topology, `V6-R1` shared cooldown/budget (or Auth0 cutover), live SMTP/DB |
| **Design-Partner Pilot** | **NOT VERIFIED** | Above + SAST/secret CLI scan (`semgrep`/`gitleaks`), CodeRabbit on authorized remote branch, Auth0 implementation if chosen |
| **Real-Company Data / Production** | **NOT VERIFIED** | All above + live provider & cross-tenant acceptance |

**Founder Decisions Required:** (1) Authorize remote branch push for CodeRabbit + CI SAST/secret scan; (2) Choose Auth0 vs. Supabase Auth + shared `V6-R1` store before hosted pilot; (3) Approve `v11` security repairs via independent review.
