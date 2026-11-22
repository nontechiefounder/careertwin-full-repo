# Step 4B5.2-D1.4 — Organization-Aware RLS & Evidence Log

## 1. Database Inventory & Constraints

### Public Tables (13 Tables)
- `activity_events`
- `candidate_profiles`
- `candidates`
- `hiring_runs`
- `organization_memberships`
- `organizations`
- `profiles`
- `proof_profiles`
- `scheduled_emails`
- `screening_answers`
- `screening_sessions`
- `screening_summaries`
- `sourcing_sessions`

### Primary Key Constraints (13 Constraints)
- `activity_events_pkey`
- `candidate_profiles_pkey`
- `candidates_pkey`
- `hiring_runs_pkey`
- `organization_memberships_pkey`
- `organizations_pkey`
- `profiles_pkey`
- `proof_profiles_pkey`
- `scheduled_emails_pkey`
- `screening_answers_pkey`
- `screening_sessions_pkey`
- `screening_summaries_pkey`
- `sourcing_sessions_pkey`

### Non-Primary UNIQUE Constraints (4 Constraints)
- `candidate_profiles_email_key`
- `profiles_email_key`
- `uq_screening_answers_session_question`
- `screening_summaries_session_id_key`

### Foreign Key Constraints (19 Constraints)
- `activity_events_session_id_fkey`
- `candidate_profiles_id_fkey`
- `candidates_candidate_id_fkey`
- `candidates_hiring_run_id_fkey`
- `hiring_runs_employer_id_fkey`
- `hiring_runs_org_id_fkey`
- `organization_memberships_organization_id_fkey`
- `organization_memberships_user_id_fkey`
- `organizations_created_by_fkey`
- `profiles_id_fkey`
- `proof_profiles_candidate_id_fkey`
- `scheduled_emails_candidate_id_fkey`
- `scheduled_emails_employer_id_fkey`
- `screening_answers_session_id_fkey`
- `screening_sessions_candidate_id_fkey`
- `screening_sessions_hiring_run_id_fkey`
- `screening_summaries_session_id_fkey`
- `sourcing_sessions_employer_id_fkey`
- `sourcing_sessions_hiring_run_id_fkey`

### Row-Level Security Status
- All 13 public application tables have `rowsecurity = true` in PostgreSQL catalog.

### Active RLS Policies (20 Policies)
- `activity_events`: `activity_events_select` (SELECT)
- `candidate_profiles`: `candidate_profiles_self_access` (ALL)
- `candidates`: `candidates_org_owner` (ALL), `candidates_self_access` (SELECT)
- `hiring_runs`: `hiring_runs_org_owner` (ALL)
- `organization_memberships`: `org_memberships_admin_all` (ALL), `org_memberships_select` (SELECT), `org_memberships_insert` (INSERT), `org_memberships_update` (UPDATE), `org_memberships_delete` (DELETE)
- `organizations`: `organizations_select` (SELECT), `organizations_insert` (INSERT)
- `profiles`: `profiles_self_select` (SELECT), `profiles_self_insert` (INSERT), `profiles_self_update` (UPDATE)
- `proof_profiles`: `proof_profiles_candidate_self` (SELECT)
- `screening_answers`: `screening_answers_select` (SELECT), `screening_answers_insert` (INSERT), `screening_answers_update` (UPDATE)
- `screening_sessions`: `screening_sessions_candidate_select` (SELECT), `screening_sessions_candidate_update` (UPDATE), `screening_sessions_org_select` (SELECT), `screening_sessions_org_update` (UPDATE)
- `screening_summaries`: `screening_summaries_select` (SELECT)
- `sourcing_sessions`: `sourcing_sessions_org_owner` (ALL)
- `scheduled_emails`: 0 policies (`REVOKE ALL`)

---

## 2. Table-by-Table Authorization Matrix

| Table | Operation | Authenticated Target User | Cross-Tenant User | Anonymous User | Enforcement Mechanism |
|---|---|---|---|---|---|
| `organizations` | SELECT | 200 OK (Own Org) | Filtered (0 rows) | Filtered (0 rows) | RLS `is_org_member()` |
| `organization_memberships` | SELECT | 200 OK (Own Org) | Filtered (0 rows) | Filtered (0 rows) | RLS `is_org_member()` |
| `profiles` | SELECT | 200 OK (Own Profile) | Filtered (0 rows) | Filtered (0 rows) | RLS `auth.uid() = id` |
| `profiles` | UPDATE (company) | 204 No Content | Filtered (0 rows) | 401 Unauthorized | RLS + Column Grant |
| `profiles` | UPDATE (role) | 403 / 404 Error | 403 / 404 Error | 401 Unauthorized | Revoked Column Privilege |
| `profiles` | UPDATE (gmail_*) | 403 / 404 Error | 403 / 404 Error | 401 Unauthorized | Revoked Column Privilege |
| `candidate_profiles` | SELECT | 200 OK (Own Profile) | Filtered (0 rows) | Filtered (0 rows) | RLS `auth.uid() = id` |
| `hiring_runs` | SELECT | 200 OK (Org Member) | Filtered (0 rows) | Filtered (0 rows) | RLS `is_org_member()` |
| `sourcing_sessions` | SELECT | 200 OK (Org Member) | Filtered (0 rows) | Filtered (0 rows) | RLS `is_hiring_run_member()` |
| `candidates` | SELECT | 200 OK (Org Member) | Filtered (0 rows) | Filtered (0 rows) | RLS `is_hiring_run_member()` |
| `proof_profiles` | SELECT | 200 OK (Candidate) | Filtered (0 rows) | Filtered (0 rows) | RLS `candidate_id = auth.uid()` |
| `screening_sessions` | SELECT | 200 OK (Candidate/Org) | Filtered (0 rows) | Filtered (0 rows) | RLS `is_hiring_run_member()` |
| `screening_sessions` | INSERT | 403 Forbidden | 403 Forbidden | 401 Unauthorized | Revoked Table Privilege |
| `screening_sessions` | DELETE | 403 Forbidden | 403 Forbidden | 401 Unauthorized | Revoked Table Privilege |
| `screening_answers` | SELECT | 200 OK (Session Member) | Filtered (0 rows) | Filtered (0 rows) | RLS `is_session_member()` |
| `screening_answers` | DELETE | 403 Forbidden | 403 Forbidden | 401 Unauthorized | Revoked Table Privilege |
| `screening_summaries` | SELECT | 200 OK (Session Member) | Filtered (0 rows) | Filtered (0 rows) | RLS `is_session_member()` |
| `screening_summaries` | INSERT | 403 Forbidden | 403 Forbidden | 401 Unauthorized | Revoked Table Privilege |
| `activity_events` | SELECT | 200 OK (Session Member) | Filtered (0 rows) | Filtered (0 rows) | RLS `is_session_member()` |
| `activity_events` | INSERT | 403 Forbidden | 403 Forbidden | 401 Unauthorized | Revoked Table Privilege |
| `scheduled_emails` | ALL | 403 Forbidden | 403 Forbidden | 401 Unauthorized | Revoked Table Privilege |

---

## 3. Verification Command Output Logs

```bash
# Database Linting
$ npx supabase db lint
Connecting to local database...
Linting schema: extensions
Linting schema: public
No schema errors found
{"results":[],"message":"db lint"}

# Vitest Security Suite
$ npm exec --offline vitest run __tests__/security/FullSupabaseRuntimeValidation.test.js
✓ __tests__/security/FullSupabaseRuntimeValidation.test.js (13 tests) 659ms
Test Files  1 passed (1)
     Tests  13 passed (13)

# Full Vitest Suite
$ npm exec --offline vitest run
Test Files  18 passed (18)
     Tests  191 passed (191)

# ESLint
$ npm run lint
3 problems (0 errors, 3 warnings)

# Production Build
$ npm run build
✓ Compiled successfully
```
