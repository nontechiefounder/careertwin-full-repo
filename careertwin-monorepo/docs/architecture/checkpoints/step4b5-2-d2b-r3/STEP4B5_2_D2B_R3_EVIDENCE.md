# Step 4B5.2-D2B-R3 — Evidence File

**Date:** 2026-08-06  
**Baseline Commit:** `531681b`  
**Target Project:** `headwayos-secondary` (`phli...xskd`), Region: `ap-northeast-2`  

---

## E1. Local Baseline Verification Log

```bash
$ git branch --show-current
antigravity/step4b2-frontend-parity

$ git log -n 1 --oneline
531681b docs(database): verify staging schema parity

$ git status --short
(no output — clean working tree)

$ git remote -v
(no output — zero Git remotes configured)

$ docker info --format '{{.ServerVersion}}'
29.6.2
```

---

## E2. Commit `531681b` Diff Audit Log

```bash
$ git show 531681b --stat
 apps/web/__tests__/security/StagingAuthorizationBlockers.test.js  |   8 +-
 docs/architecture/checkpoints/step4b5-2-d2b-r2/STEP4B5_2_D2B_R2_EVIDENCE.md  | 100 +++++
 docs/architecture/checkpoints/step4b5-2-d2b-r2/STEP4B5_2_D2B_R2_REPORT.md    | 109 +++++

$ git show 531681b apps/web/__tests__/security/StagingAuthorizationBlockers.test.js
- headers: { apikey: anonKey, Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
+ headers: { apikey: anonKey, Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
```

---

## E3. PostgreSQL Effective Security Boundary Catalog Assertions Log

```sql
SELECT
  has_column_privilege('authenticated', 'public.profiles', 'id', 'INSERT') AS prof_ins_id,
  has_column_privilege('authenticated', 'public.profiles', 'role', 'INSERT') AS prof_ins_role,
  has_column_privilege('authenticated', 'public.profiles', 'name', 'UPDATE') AS prof_upd_name,
  has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') AS prof_upd_role,
  has_column_privilege('authenticated', 'public.profiles', 'gmail_refresh_token', 'UPDATE') AS prof_upd_gmail_tok,
  has_table_privilege('authenticated', 'public.profiles', 'INSERT') AS prof_tbl_ins,
  has_table_privilege('authenticated', 'public.profiles', 'UPDATE') AS prof_tbl_upd,
  has_table_privilege('authenticated', 'public.candidate_profiles', 'DELETE') AS cand_prof_del,
  has_table_privilege('authenticated', 'public.screening_sessions', 'INSERT') AS ss_ins,
  has_table_privilege('authenticated', 'public.screening_sessions', 'DELETE') AS ss_del,
  has_column_privilege('authenticated', 'public.screening_sessions', 'hiring_run_id', 'UPDATE') AS ss_upd_hr,
  has_table_privilege('authenticated', 'public.screening_answers', 'DELETE') AS sa_del,
  has_table_privilege('anon', 'public.activity_events', 'INSERT') AS ae_anon_ins,
  has_table_privilege('authenticated', 'public.activity_events', 'INSERT') AS ae_auth_ins,
  has_table_privilege('anon', 'public.scheduled_emails', 'SELECT') AS se_anon_sel,
  has_table_privilege('authenticated', 'public.scheduled_emails', 'SELECT') AS se_auth_sel,
  has_function_privilege('public', 'security.is_org_member(uuid)', 'EXECUTE') AS fn_pub_exec,
  has_function_privilege('anon', 'security.is_org_member(uuid)', 'EXECUTE') AS fn_anon_exec,
  has_function_privilege('authenticated', 'security.is_org_member(uuid)', 'EXECUTE') AS fn_auth_exec,
  has_schema_privilege('public', 'public', 'CREATE') AS sch_pub_create,
  has_schema_privilege('authenticated', 'security', 'CREATE') AS sch_sec_auth_create;

-- Output (Both Local & Remote):
prof_ins_id: t | prof_ins_role: f
prof_upd_name: t | prof_upd_role: f | prof_upd_gmail_tok: f
prof_tbl_ins: f | prof_tbl_upd: f
cand_prof_del: f | ss_ins: f | ss_del: f | ss_upd_hr: f | sa_del: f
ae_anon_ins: f | ae_auth_ins: f | se_anon_sel: f | se_auth_sel: f
fn_pub_exec: f | fn_anon_exec: f | fn_auth_exec: t
sch_pub_create: f | sch_sec_auth_create: f
```

---

## E4. Linked Database Lint Log

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

## E5. Quality Gate Execution Logs

```bash
# Vitest (19/19 files, 221/221 tests pass)
Test Files  19 passed (19)
     Tests  221 passed (221)

# ESLint (0 errors, 3 warnings)
✖ 3 problems (0 errors, 3 warnings)

# Production Build
✓ Compiled successfully in 10.4s
✓ Generating static pages using 7 workers (31/31)
```
