# Step 4B5.2-D1.4.2 — Evidence File

**Date:** 2026-08-03
**Baseline Commit:** `2fd3496`
**Local PostgreSQL:** `postgresql://postgres:postgres@127.0.0.1:54332/postgres`

---

## E1. Git and Docker State

```
$ git log -n 3 --oneline
2fd3496 feat(database): enforce adversarial organization-role boundaries and SECURITY DEFINER search path
766b85b feat(database): harden organization-aware Supabase authorization
a2d15d7 test(database): complete Supabase Auth and RLS validation

$ git remote -v
(no output — no remote configured)

$ git status --short
(no output — clean working tree)

$ docker info --format '{{.ServerVersion}}'
29.6.2
```

---

## E2. Schema Counts After db Reset

```sql
-- Tables
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
-- Result: 13

-- Primary Key constraints
SELECT COUNT(*) FROM information_schema.table_constraints
WHERE constraint_schema = 'public' AND constraint_type = 'PRIMARY KEY';
-- Result: 13

-- Foreign Key constraints
SELECT COUNT(*) FROM information_schema.table_constraints
WHERE constraint_schema = 'public' AND constraint_type = 'FOREIGN KEY';
-- Result: 19

-- Unique constraints
SELECT COUNT(*) FROM information_schema.table_constraints
WHERE constraint_schema = 'public' AND constraint_type = 'UNIQUE';
-- Result: 4

-- RLS-enabled tables
SELECT COUNT(*) FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true;
-- Result: 13

-- Active policies
SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public';
-- Result: 30
```

---

## E3. Schema CREATE Privilege Evidence

```sql
SELECT nspacl FROM pg_namespace WHERE nspname = 'public';
```

**Result:**
```
{pg_database_owner=UC/pg_database_owner,
 =U/pg_database_owner,
 postgres=U/pg_database_owner,
 anon=U/pg_database_owner,
 authenticated=U/pg_database_owner,
 service_role=U/pg_database_owner}
```

```sql
SELECT
  has_schema_privilege('anon', 'public', 'CREATE') AS anon_can_create,
  has_schema_privilege('anon', 'public', 'USAGE') AS anon_can_use,
  has_schema_privilege('authenticated', 'public', 'CREATE') AS auth_can_create,
  has_schema_privilege('authenticated', 'public', 'USAGE') AS auth_can_use;
```

**Result:**
```
 anon_can_create | anon_can_use | auth_can_create | auth_can_use
-----------------+--------------+-----------------+--------------
 f               | t            | f               | t
```

---

## E4. Authorization Function Definitions (pg_get_functiondef)

### is_org_member

```sql
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_memberships
        WHERE organization_id = p_org_id
          AND user_id = p_user_id
          AND membership_status = 'active'
    );
$function$
```

**Owner:** postgres | **SECURITY DEFINER:** YES | **Volatility:** STABLE
**search_path config:** `{search_path=public, pg_temp}`

---

### has_org_role

```sql
CREATE OR REPLACE FUNCTION public.has_org_role(p_org_id uuid, p_user_id uuid, p_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_memberships
        WHERE organization_id = p_org_id
          AND user_id = p_user_id
          AND membership_status = 'active'
          AND membership_role = ANY(p_roles)
    );
$function$
```

**Owner:** postgres | **SECURITY DEFINER:** YES | **Volatility:** STABLE
**search_path config:** `{search_path=public, pg_temp}`

---

### is_hiring_run_member

```sql
CREATE OR REPLACE FUNCTION public.is_hiring_run_member(p_hiring_run_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.hiring_runs h
        WHERE h.id = p_hiring_run_id
          AND (
            h.employer_id = p_user_id
            OR (h.org_id IS NOT NULL AND public.is_org_member(h.org_id, p_user_id))
          )
    );
$function$
```

**Owner:** postgres | **SECURITY DEFINER:** YES | **Volatility:** STABLE
**search_path config:** `{search_path=public, pg_temp}`

---

### is_session_member

```sql
CREATE OR REPLACE FUNCTION public.is_session_member(p_session_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.screening_sessions s
        WHERE s.id = p_session_id
          AND (
            s.candidate_id = p_user_id
            OR public.is_hiring_run_member(s.hiring_run_id, p_user_id)
          )
    );
$function$
```

**Owner:** postgres | **SECURITY DEFINER:** YES | **Volatility:** STABLE
**search_path config:** `{search_path=public, pg_temp}`

---

## E5. Column-Level Grant Evidence

### profiles — INSERT grant (authenticated)

```
company, created_at, email, id, name, updated_at
```

Protected (NOT in INSERT grant): `role, gmail_connected, gmail_email, gmail_refresh_token`

### profiles — UPDATE grant (authenticated)

```
company, name, updated_at
```

Protected (NOT in UPDATE grant): `role, email, gmail_connected, gmail_email, gmail_refresh_token, id, created_at`

### screening_sessions — UPDATE grant (authenticated)

```
candidate_id, completed_at, status
```

Protected (NOT in UPDATE grant): `hiring_run_id, id, started_at`

---

## E6. Check Constraint Definitions

```sql
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.organization_memberships'::regclass
  AND contype = 'c'
ORDER BY conname;
```

**Results:**

| Constraint | Definition |
|---|---|
| `organization_memberships_membership_role_check` | `CHECK ((membership_role = ANY (ARRAY['owner', 'admin', 'recruiter', 'hiring_manager', 'auditor'])))` |
| `organization_memberships_membership_status_check` | `CHECK ((membership_status = ANY (ARRAY['active', 'invited', 'suspended', 'removed'])))` |

### Runtime Validation (superuser context)

```
NOTICE: PASS: membership_role check constraint correctly rejects invalid value
NOTICE: PASS: membership_status check constraint correctly rejects invalid value
```

---

## E7. Full Active Policy Listing (30 policies)

```
tablename                 | policyname                          | cmd
--------------------------+-------------------------------------+--------
activity_events           | activity_events_select              | SELECT
candidate_profiles        | candidate_profiles_self_insert      | INSERT
candidate_profiles        | candidate_profiles_self_select      | SELECT
candidate_profiles        | candidate_profiles_self_update      | UPDATE
candidates                | candidates_org_select               | SELECT
candidates                | candidates_org_write                | ALL
candidates                | candidates_self_access              | SELECT
hiring_runs               | hiring_runs_org_select              | SELECT
hiring_runs               | hiring_runs_org_write               | ALL
organization_memberships  | org_memberships_delete              | DELETE
organization_memberships  | org_memberships_insert              | INSERT
organization_memberships  | org_memberships_select              | SELECT
organization_memberships  | org_memberships_update              | UPDATE
organizations             | organizations_insert                | INSERT
organizations             | organizations_select                | SELECT
organizations             | organizations_update                | UPDATE
profiles                  | profiles_self_insert                | INSERT
profiles                  | profiles_self_select                | SELECT
profiles                  | profiles_self_update                | UPDATE
proof_profiles            | proof_profiles_candidate_self       | SELECT
screening_answers         | screening_answers_insert            | INSERT
screening_answers         | screening_answers_select            | SELECT
screening_answers         | screening_answers_update            | UPDATE
screening_sessions        | screening_sessions_candidate_select | SELECT
screening_sessions        | screening_sessions_candidate_update | UPDATE
screening_sessions        | screening_sessions_org_select       | SELECT
screening_sessions        | screening_sessions_org_write        | UPDATE
screening_summaries       | screening_summaries_select          | SELECT
sourcing_sessions         | sourcing_sessions_org_select        | SELECT
sourcing_sessions         | sourcing_sessions_org_write         | ALL
```

---

## E8. Security Test Suite Output

```
$ npx vitest run apps/web/__tests__/security/FullSupabaseRuntimeValidation.test.js

  ASSERT 1.1: GoTrue Signup API creates user and issues valid access token         PASS  1ms
  ASSERT 1.2: GoTrue Password Grant verifies credentials and issues token          PASS  70ms
  ASSERT 1.3: GoTrue token verification via /auth/v1/user returns matching identity PASS  17ms
  ASSERT 1.4: PostgREST resolves GoTrue JWT subject through auth.uid() claim       PASS  2ms
  ASSERT 1.5: Absent authentication header returns zero protected rows             PASS  2ms
  ASSERT 1.6: Malformed JWT header returns 401 Unauthorized                        PASS  1ms
  ASSERT 1.7: Forged JWT signature returns 401 Unauthorized                        PASS  2ms
  ASSERT 2.1: Direct profile creation with approved fields succeeds                PASS  77ms
  ASSERT 2.2: Profile creation attempting to insert role column is DENIED          PASS  77ms
  ASSERT 2.3: Profile creation attempting to insert gmail integration fields DENIED PASS  81ms
  ASSERT 2.4: Approved profile field update succeeds and database state reflects   PASS  3ms
  ASSERT 3.1: Nonmember CANNOT read memberships from another organization          PASS  2ms
  ASSERT 3.2: Nonmember CANNOT add themselves to another organization              PASS  2ms
  ASSERT 3.3: Recruiter CANNOT add or remove organization members                  PASS  3ms
  ASSERT 3.4: Recruiter CANNOT promote themselves to owner or admin                PASS  2ms
  ASSERT 3.5: Admin CANNOT promote themselves to owner or demote/remove the owner  PASS  3ms
  ASSERT 3.6: Suspended member loses all organization resource access              PASS  2ms
  ASSERT 4.1: Owner, Admin, Recruiter can write hiring runs; Auditor is READ-ONLY  PASS  3ms
  ASSERT 4.2: Candidate update to screening session fields is DENIED               PASS  2ms
  ASSERT 4.3: Candidate Answer operations - own insert/update; DELETE denied       PASS  6ms
  ASSERT 4.4: Candidate Profiles - own select/insert/update; DELETE denied         PASS  5ms
  ASSERT 4.5: Anonymous client retrieves ZERO protected rows across all 13 tables  PASS  12ms

 Test Files  1 passed (1)
      Tests  22 passed (22)
   Duration  1.69s
```

---

## E9. ESLint Output

```
$ npx eslint . --ext .js,.jsx,.ts,.tsx

3 problems (0 errors, 3 warnings)
```

Three pre-existing warnings in NaiveShell.jsx, MarketingFooter.jsx, and MarketingNav.jsx
regarding <img> vs next/image. No errors. No change from prior step.

---

## E10. Production Build Output (tail)

```
$ npx next build

Route (app)                              Size
...
o /compare
o /contact
o /employer
f /employer/brief/[id]
o /employer/chat
o /employer/intake
o /employer/integrations
f /employer/packet/[extractionId]
o /employer/profile
f /employer/shortlist/[roleId]
f /employer/sourcing-session/[id]
o /pricing
o /privacy
o /terms

o  (Static)   prerendered as static content
f  (Dynamic)  server-rendered on demand

Build completed successfully.
```

---

## E11. Files Changed in This Step

Zero. Step 4B5.2-D1.4.2 is a read-only audit and documentation step.

No migration files were created.
No application source files were modified.
No test files were modified.
Only these two checkpoint documents were added:

- docs/architecture/checkpoints/step4b5-2-d1-4-2/STEP4B5_2_D1_4_2_REPORT.md
- docs/architecture/checkpoints/step4b5-2-d1-4-2/STEP4B5_2_D1_4_2_EVIDENCE.md
