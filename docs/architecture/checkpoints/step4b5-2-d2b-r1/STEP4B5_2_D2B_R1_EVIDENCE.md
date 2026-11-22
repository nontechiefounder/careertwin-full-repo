# Step 4B5.2-D2B-R1 — Evidence File

**Date:** 2026-08-05  
**Baseline Commit:** `6ce429f`  
**Target Project:** `headwayos-secondary` (`phli...xskd`), Region: `ap-northeast-2`  

---

## E1. Local Baseline Verification Log

```bash
$ git branch --show-current
antigravity/step4b2-frontend-parity

$ git log -n 1 --oneline
6ce429f docs(database): verify isolated staging migration preflight

$ git status --short
(no output — clean working tree)

$ git remote -v
(no output — zero Git remotes configured)

$ docker info --format '{{.ServerVersion}}'
29.6.2
```

---

## E2. Linked Project Verification Log

```bash
$ npx supabase projects list
{"projects":[{"id":"phli...xskd","ref":"phli...xskd","name":"headwayos-secondary","region":"ap-northeast-2","status":"ACTIVE_HEALTHY","linked":true}]}
```

---

## E3. Sanitized Pre-Reset Schema Inventory Log

```sql
-- Query: Pre-reset public table listing
table_name
---------------------
_JobSkills, cities, companies, countries, job_data_100_sample, job_sources, jobs, leads, locations, refresh_runs, roles, skills, states
(13 rows)

table_count | function_count | policy_count | trigger_count
-------------+----------------+--------------+---------------
         13 |              1 |            0 |             0
```

---

## E4. Final Pre-Reset Dry-Run Log

```bash
$ npx supabase db push --linked --dry-run
DRY RUN: migrations will *not* be pushed to the database.
Would push these migrations:
 • 20260803000001_operational_schema_baseline.sql
 • 20260803000002_organization_and_rls_hardening.sql
 • 20260803000003_organization_authorization_completion.sql
 • 20260804000001_staging_authorization_blockers.sql
{"upToDate":false,"dryRun":true,"migrations":["20260803000001_operational_schema_baseline.sql","20260803000002_organization_and_rls_hardening.sql","20260803000003_organization_authorization_completion.sql","20260804000001_staging_authorization_blockers.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
```

---

## E5. Executed Database Reset Execution Log

```bash
$ npx supabase db reset --linked --no-seed --yes
Initialising login role...
Do you want to reset the remote database? [y/N] y
Resetting remote database...
Applying migration 20260803000001_operational_schema_baseline.sql...
Applying migration 20260803000002_organization_and_rls_hardening.sql...
Applying migration 20260803000003_organization_authorization_completion.sql...
Applying migration 20260804000001_staging_authorization_blockers.sql...
{"target":"remote","version":"","message":"Reset remote database."}
```

---

## E6. Post-Reset Remote Migration History Log

```bash
$ npx supabase migration list --linked
Connecting to remote database...
{"migrations":[
  {"local":"20260803000001","remote":"20260803000001","time":"2026-08-03 00:00:01"},
  {"local":"20260803000002","remote":"20260803000002","time":"2026-08-03 00:00:02"},
  {"local":"20260803000003","remote":"20260803000003","time":"2026-08-03 00:00:03"},
  {"local":"20260804000001","remote":"20260804000001","time":"2026-08-04 00:00:01"}
],"message":"Migrations listed"}
```

---

## E7. Linked Database Lint Log

```bash
$ npx supabase db lint --linked
Initialising login role...
Connecting to remote database...
Linting schema: extensions
Linting schema: public
Linting schema: security

No schema errors found
{"results":[],"message":"db lint"}
```

---

## E8. Post-Reset Schema Verification SQL Logs

```sql
-- 1. Public Tables (13 rows)
activity_events, candidate_profiles, candidates, hiring_runs, organization_memberships, organizations, profiles, proof_profiles, scheduled_emails, screening_answers, screening_sessions, screening_summaries, sourcing_sessions

-- 2. RLS Status (All 13 tables: rowsecurity = true)
tablename | rowsecurity
all 13 tables | t

-- 3. Security Helper Functions (security schema)
current_user_email | DEFINER
has_org_role       | DEFINER
is_hiring_run_member| DEFINER
is_org_member      | DEFINER
is_session_member  | DEFINER

-- 4. Public Auth Helpers Count
public_auth_helpers: 0

-- 5. Row Counts Across All Application Tables
activity_events: 0, candidate_profiles: 0, candidates: 0, hiring_runs: 0, org_memberships: 0, organizations: 0, profiles: 0, proof_profiles: 0, scheduled_emails: 0, screening_answers: 0, screening_sessions: 0, screening_summaries: 0, sourcing_sessions: 0

-- 6. Foreign Key Constraints Count
18 foreign key constraints verified
```

---

## E9. Quality Gate Logs

```bash
# Vitest (19/19 files, 221/221 tests pass)
Test Files  19 passed (19)
     Tests  221 passed (221)

# ESLint (0 errors, 3 warnings)
✖ 3 problems (0 errors, 3 warnings)

# Production Build
✓ Compiled successfully in 10.0s
✓ Generating static pages using 7 workers (31/31)
```
