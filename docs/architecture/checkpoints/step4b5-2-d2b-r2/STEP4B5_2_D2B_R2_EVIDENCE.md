# Step 4B5.2-D2B-R2 — Evidence File

**Date:** 2026-08-06  
**Baseline Commit:** `bcc4653`  
**Target Project:** `headwayos-secondary` (`phli...xskd`), Region: `ap-northeast-2`  

---

## E1. Local Baseline Verification Log

```bash
$ git branch --show-current
antigravity/step4b2-frontend-parity

$ git log -n 1 --oneline
bcc4653 docs(database): reinitialize CareerTWiN staging schema

$ git status --short
 M apps/web/__tests__/security/StagingAuthorizationBlockers.test.js

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

## E3. Local Database Reset & Catalog Verification Log

```bash
$ npx supabase db reset --local
Resetting local database...
Seeding data from supabase/seed.sql...
Finished supabase db reset on branch antigravity/step4b2-frontend-parity.
```

---

## E4. Exact Local vs Remote Catalog Comparison Script Output Log

```bash
$ python3 compare_psql.py
=== CATEGORY MATCH MATRIX ===
tables       | Match: True  | Local:  13 | Remote:  13
columns      | Match: True  | Local: 111 | Remote: 111
pks          | Match: True  | Local:  14 | Remote:  14
uniques      | Match: True  | Local:   5 | Remote:   5
fks          | Match: True  | Local:  18 | Remote:  18
checks       | Match: True  | Local:   2 | Remote:   2
rls_tables   | Match: True  | Local:  13 | Remote:  13
policies     | Match: True  | Local:  23 | Remote:  23
sec_funcs    | Match: True  | Local:   5 | Remote:   5
func_acls    | Match: True  | Local:   5 | Remote:   5
table_privs  | Match: False | Local: 117 | Remote: 142
col_privs    | Match: False | Local: 544 | Remote: 698
```

---

## E5. Linked Database Lint Execution Log

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

## E6. Quality Gate Logs

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
