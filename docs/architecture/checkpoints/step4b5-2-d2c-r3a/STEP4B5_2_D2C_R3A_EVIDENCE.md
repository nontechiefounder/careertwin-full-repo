# Step 4B5.2-D2C-R3A — Evidence File

**Date:** 2026-08-10  
**Baseline Commit:** `0e9893a3d21e960169452ee4b89febee95369bed`  
**Branch:** `antigravity/step4b2-frontend-parity`  
**Target Project:** `headwayos-secondary` (masked ref: `phli...xskd`), Region: `ap-northeast-2`  

---

## E1. Pre-Execution Repository Gate Verification

```bash
$ git branch --show-current
antigravity/step4b2-frontend-parity

$ git rev-parse HEAD
0e9893a3d21e960169452ee4b89febee95369bed

$ git status --short
(no output — clean working tree)

$ git remote -v
(no output — zero Git remotes configured)
```

---

## E2. Schema-Valid Negative Mutation Payload Inventory

| Table Name | Operation Attempted | Target Payload / Condition | Schema Validity Justification | Planned Authorization Denial Enforcement |
| :--- | :--- | :--- | :--- | :--- |
| `organization_memberships` | `POST` (Recruiter/Auditor) | `{ organization_id, user_id, membership_role, membership_status }` | All columns exist on table (`UUID`, `TEXT`); role enum string is valid. | RLS policy `org_memberships_insert` restricts INSERT to owner/admin roles. |
| `organization_memberships` | `PATCH` (Recruiter/Auditor) | `{ membership_role: 'owner' }` | `membership_role` is a valid updatable TEXT column. | RLS policy `org_memberships_update` checks caller has owner/admin role. |
| `organization_memberships` | `DELETE` (Recruiter/Auditor) | Target membership row ID | Deletes valid existing membership row. | RLS policy `org_memberships_delete` requires caller owner/admin role. |
| `profiles` | `PATCH` (Cross-user) | `{ name: 'Hacked Name' }` | `name` is a valid TEXT column on `profiles`. | RLS policy `profiles_self_update` requires `auth.uid() = id`. |
| `profiles` | `PATCH` (Protected columns) | `{ role: 'admin' }`, `{ gmail_connected: true }`, `{ gmail_email: 'att@ex.com' }`, `{ gmail_refresh_token: 'tok' }` | All 4 columns exist in schema migration `20260803000001`. | `REVOKE UPDATE ON profiles` + `GRANT UPDATE (name, company, updated_at)` blocks column access. |
| `hiring_runs` | `PATCH` (Auditor) | `{ role_title: 'Hacked Title' }` | `role_title` is a valid TEXT column on `hiring_runs`. | RLS policy `hiring_runs_org_write` requires employer or owner/admin/recruiter org role. |
| `sourcing_sessions` | `PATCH` (Auditor/Candidate) | `{ status: 'archived' }` | `status` is a valid TEXT column on `sourcing_sessions`. | RLS policy `sourcing_sessions_org_write` requires employer or owner/admin/recruiter org role. |
| `candidates` | `PATCH` (Candidate) | `{ status: 'hired', fit_score: 10.0 }` | `status` (TEXT) and `fit_score` (DOUBLE PRECISION) exist on `candidates`. | Candidate has zero UPDATE policy on `candidates` (`candidates_org_write` requires employer role). |
| `screening_sessions` | `PATCH` (Candidate) | `{ candidate_id }`, `{ hiring_run_id }`, `{ status }`, `{ started_at }`, `{ completed_at }` | All 5 columns exist in `screening_sessions` schema. | `screening_sessions_org_update` allows UPDATE only to org workflow roles. Candidates have 0 UPDATE policy. |
| `screening_answers` | `POST` (Cross-session) | `{ id, session_id: crossSessionId, question_index: 1, answer_text }` | All columns match table schema (`UUID`, `INT`, `TEXT`). | RLS policy `screening_answers_session_owner` requires `session.candidate_id = auth.uid()`. |
| `screening_answers` | `DELETE` (Candidate) | Target answer row ID | Deletes valid existing answer row. | `screening_answers` policy allows SELECT/INSERT only for session candidate. DELETE is denied. |
| `activity_events` | `POST` (Client) | `{ session_id, event_type: 'custom', title: 'T', description: 'D' }` | All columns exist in migration `20260803000001`. | `activity_events` policy/grants restrict client writes. |
| `scheduled_emails` | `ALL` (Client) | `{ employer_id, candidate_id, subject, body }` | All columns match schema migration `20260803000001`. | `REVOKE ALL ON scheduled_emails FROM anon, authenticated` revokes client access completely. |

---

## E3. Canonical Quality Gate Execution Output (`apps/web`)

### Vitest Suite (`CAREERTWIN_RUN_STAGING_TESTS` Unset)

```bash
$ cd apps/web && unset CAREERTWIN_RUN_STAGING_TESTS && npm exec --offline vitest run

 ✓ __tests__/security/ApiAuthorizationCharacterization.test.js (25 tests)
 ✓ __tests__/security/FullSupabaseRuntimeValidation.test.js (22 tests)
 ...
 Test Files  19 passed | 1 skipped (20)
      Tests  221 passed | 1 skipped (222)
   Start at  18:45:17
   Duration  4.42s
```

### ESLint Audit (`apps/web`)

```bash
$ cd apps/web && npm exec --offline eslint -- .
✖ 3 problems (0 errors, 3 warnings)
```

### Next.js Production Build (`apps/web`)

```bash
$ cd apps/web && npm run build
▲ Next.js 16.2.1 (Turbopack)
✓ Compiled successfully in 10.5s
  Running TypeScript ...
  Finished TypeScript in 125ms ...
  Collecting page data using 7 workers ...
✓ Generating static pages using 7 workers (31/31) in 778ms
```
