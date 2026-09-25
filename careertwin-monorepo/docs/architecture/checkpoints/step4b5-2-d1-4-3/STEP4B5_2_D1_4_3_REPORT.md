# Step 4B5.2-D1.4.3 — Final Pre-Deployment Authorization Blockers Report

**Date:** 2026-08-05  
**Baseline Commit:** `9220b98` — docs(security): final local authorization invariants and deployment-readiness verification  
**Corrective Commit:** `fix(database): close final staging authorization blockers`  
**Local PostgreSQL:** `postgresql://postgres:postgres@127.0.0.1:54332/postgres`  
**Docker Version:** 29.6.2  

---

## 1. Baseline & Runtime Verification

| Verification Item | Result |
|---|---|
| Git commit baseline | `9220b98` confirmed |
| Git remote | None — no remote configured |
| Working tree | Clean |
| Docker Desktop | Running, engine version 29.6.2 |
| `npx supabase db reset` | Completed successfully from zero |
| Schema linting (`npx supabase db lint`) | 0 schema errors |
| Test suite (`npm exec --offline vitest run`) | **19/19 test files passed, 221/221 tests passed (0 failed)** |
| ESLint (`npm exec --offline eslint -- .`) | **0 errors**, 3 pre-existing warnings |
| Production build (`npm run build`) | **Passed (green)** |

---

## 2. Full Test Suite Discrepancy Resolution

The test suite discrepancy reported in Step D1.4.2 was caused by running Vitest at the monorepo root where path alias `@` did not resolve to `apps/web/`.

**Resolution:**
The canonical test command is executed within `apps/web`:
```bash
cd apps/web && npm exec --offline vitest run
```
- **Exact Test File Count:** 19
- **Exact Test Count:** 221
- **Failed Test Files:** 0
- **Failed Tests:** 0

---

## 3. Non-Exposed Security Schema & Helper Function Refactoring

Four authorization helper functions were removed from the `public` schema and re-implemented inside a dedicated `security` schema:

- `security.is_org_member(p_org_id UUID)`
- `security.has_org_role(p_org_id UUID, p_roles TEXT[])`
- `security.is_hiring_run_member(p_hiring_run_id UUID)`
- `security.is_session_member(p_session_id UUID)`

### Function Hardening Characteristics
1. **No arbitrary user ID parameters:** `p_user_id` parameter was removed. All functions derive caller identity internally using `auth.uid()`.
2. **Search Path Security:** Configured with `SET search_path = ''` to prevent search-path injection attacks.
3. **RPC Exposure Prevention:** PostgREST only exposes the `public` schema. Functions residing in `security` cannot be called via `/rest/v1/rpc/*`.
4. **Privilege Revocation:** `EXECUTE` revoked from `PUBLIC` (covering `anon`). Granted exclusively to `authenticated` for RLS policy evaluation and `service_role`.

---

## 4. Profile Identity Integrity Enforcement

Profile creation and updates are hardened at both the RLS policy layer and PostgreSQL column-privilege layer:

- **`profiles_self_insert` Policy:**
  ```sql
  WITH CHECK (
      auth.uid() = id
      AND email = security.current_user_email()
  )
  ```
- **Column Privilege Hardening:**
  - `INSERT` granted to `authenticated` ONLY for `(id, email, name, company)`.
  - `created_at` and `updated_at` use database defaults (`NOW()`).
  - `role`, `gmail_connected`, `gmail_email`, and `gmail_refresh_token` are excluded from client `INSERT` and `UPDATE` grants.
  - `UPDATE` granted to `authenticated` ONLY for `(name, company, updated_at)`.
- **Identity Mismatch Denial:** Inserting a profile with `id != auth.uid()` or `email != GoTrue email` is rejected by RLS (HTTP 403 / 400).

---

## 5. Candidate Screening Session Mutation Denial

Direct candidate `UPDATE` access on `screening_sessions` has been removed:

- Candidates receive **SELECT-only** access to their own screening sessions (`screening_sessions_select`).
- Candidates have **zero UPDATE policy**. Any attempt by a candidate to update `candidate_id`, `hiring_run_id`, `status`, `started_at`, or `completed_at` is denied by RLS.
- Organization workflow roles (`owner`, `admin`, `recruiter`, `hiring_manager`) retain restricted UPDATE privileges for `(candidate_id, status, completed_at)`. Column UPDATE for `hiring_run_id`, `id`, and `started_at` is revoked from `authenticated`.

---

## 6. Owner Invariant Adversarial Coverage

All five owner invariant edge cases are enforced by RLS policies and validated by automated tests with post-operation database state assertions:

1. **Admin Owner Creation Denial:** Admin cannot insert any membership with `membership_role = 'owner'`. Database state confirmed: row count remains 0.
2. **Admin Self-Promotion Denial:** Admin cannot update their membership role to `owner`. Database state confirmed: `membership_role` remains `'admin'`.
3. **Admin Owner Demotion/Removal Denial:** Admin cannot demote or delete the owner membership. Database state confirmed: owner row exists and `membership_role` remains `'owner'`.
4. **Admin Owner Suspension Denial:** Admin cannot update owner `membership_status` to `'suspended'`. Database state confirmed: `membership_status` remains `'active'`.
5. **Cross-Organization Admin Denial:** Non-member or admin of Org A cannot add, modify, or delete memberships in Org B. Database state confirmed: 0 rows modified.
6. **Membership Key Mutation Denial:** Admin cannot modify `organization_id` or `user_id` on an existing membership. Column update revoked. Database state confirmed: membership remains in original organization.

---

## 7. Migration & Verification Artifacts Created

1. **Migration:** `supabase/migrations/20260804000001_staging_authorization_blockers.sql`
2. **Security Test Suite:** `apps/web/__tests__/security/StagingAuthorizationBlockers.test.js`
3. **Checkpoint Documentation:**
   - `docs/architecture/checkpoints/step4b5-2-d1-4-3/STEP4B5_2_D1_4_3_REPORT.md`
   - `docs/architecture/checkpoints/step4b5-2-d1-4-3/STEP4B5_2_D1_4_3_EVIDENCE.md`

---

## 8. Invariants & Scope Compliance

- Zero production application code files modified.
- Zero API-route files modified.
- Zero server-auth-helper files modified.
- Zero remote Supabase project references or credentials used.
- Zero real user data used.
- Zero deployments, Git remotes, or pushes performed.

---

## 9. Readiness Declaration

**State A:** Final authorization blockers are corrected and the migration package is ready for isolated remote staging deployment.
