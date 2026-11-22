# Step 4B5.2-D1.4 — Organization-Aware RLS & Client Privilege Hardening Report

## Executive Summary

Step 4B5.2-D1.4 implements organization-aware Row-Level Security (RLS), column-level privilege hardening, and auditor read-only boundaries on the local disposable Supabase stack (`careertwin-local-baseline`). 

All authorization weaknesses identified during Step D1.3-R2.1 have been systematically remediated locally without modifying any production Next.js API routes or contacting any remote Supabase project.

---

## Key Achievements

1. **Minimum Organization Model Implemented**:
   - Created `organizations` table (`id`, `name`, `created_by`, `created_at`, `updated_at`).
   - Created `organization_memberships` table (`organization_id`, `user_id`, `membership_role`, `membership_status`).
   - Added `org_id` column and foreign key constraint to `hiring_runs`.

2. **Security Definer SQL Helper Functions**:
   - Implemented `is_org_member(p_org_id, p_user_id)`.
   - Implemented `has_org_role(p_org_id, p_user_id, p_roles)`.
   - Implemented `is_hiring_run_member(p_hiring_run_id, p_user_id)`.
   - Implemented `is_session_member(p_session_id, p_user_id)`.

3. **Column-Level Privilege Hardening on `profiles`**:
   - Split `profiles_self_access` into `profiles_self_select`, `profiles_self_insert`, and `profiles_self_update`.
   - Revoked general `UPDATE` on `profiles` from `anon` and `authenticated`.
   - Explicitly granted `UPDATE (name, company, updated_at)` to `authenticated`.
   - Verified that client attempts to update `role`, `gmail_connected`, `gmail_email`, or `gmail_refresh_token` return `403 Forbidden` / column privilege errors and leave database state unaltered.

4. **Activity Events Scoped Tenant Isolation**:
   - Replaced permissive `USING (true)` policy with `is_session_member(session_id, auth.uid())`.
   - Verified that Org Beta members retrieve 0 rows when attempting cross-tenant access to Org Alpha events.
   - Revoked `INSERT, UPDATE, DELETE` on `activity_events` from client roles.

5. **Screening Sessions & Answers Hardening**:
   - Restricted `screening_sessions` to candidate self-select/update and org member select/update. Candidate update prohibits reassigning `candidate_id` or `hiring_run_id`.
   - Revoked `INSERT` and `DELETE` on `screening_sessions` from client roles.
   - Restricted `screening_answers` to session candidate SELECT, INSERT, UPDATE, and session member SELECT. Revoked `DELETE` from client roles.

6. **Auditor Read-Only Boundary**:
   - Organization members with `membership_role = 'auditor'` can read hiring runs, candidates, and activity events, but client writes are blocked by table-level privilege revocations and RLS check policies.

7. **Scheduled Emails Boundary**:
   - `scheduled_emails` remains 100% inaccessible to PostgREST client roles via `REVOKE ALL`.

---

## Local Verification Summary

- **Local Disposable Stack:** Operational on `http://127.0.0.1:54331` (PostgreSQL `127.0.0.1:54332`).
- **Database Lint (`npx supabase db lint`):** No schema errors found (`{"results":[],"message":"db lint"}`).
- **Vitest Security Suite (`FullSupabaseRuntimeValidation.test.js`):** 13/13 tests passing.
- **Full Vitest Suite:** 191/191 tests passing (100% green).
- **ESLint:** 0 errors, 3 warnings (unchanged).
- **Next.js Production Build:** Green.
- **Remote Environment Contact:** ZERO.
