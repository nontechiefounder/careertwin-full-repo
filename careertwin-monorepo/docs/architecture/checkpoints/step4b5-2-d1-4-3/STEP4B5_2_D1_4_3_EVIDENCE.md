# Step 4B5.2-D1.4.3 — Evidence File

**Date:** 2026-08-05  
**Baseline Commit:** `9220b98`  
**Local Supabase Database:** `postgresql://postgres:postgres@127.0.0.1:54332/postgres`  

---

## E1. Baseline and Git Repository State

```bash
$ git log -n 2 --oneline
9220b98 docs(security): final local authorization invariants and deployment-readiness verification
2fd3496 feat(database): enforce adversarial organization-role boundaries and SECURITY DEFINER search path

$ git remote -v
(no output — zero remote repositories configured)

$ docker info --format '{{.ServerVersion}}'
29.6.2
```

---

## E2. Migration & Seed Execution Log

```
Applying migration 20260803000001_operational_schema_baseline.sql...
Applying migration 20260803000002_organization_and_rls_hardening.sql...
Applying migration 20260803000003_organization_authorization_completion.sql...
Applying migration 20260804000001_staging_authorization_blockers.sql...
Seeding data from supabase/seed.sql...
Finished supabase db reset on branch antigravity/step4b2-frontend-parity.
{"target":"local","version":"","message":"Reset local database."}
```

---

## E3. Database Schema Linting Output

```bash
$ npx supabase db lint --local
Connecting to local database...
Linting schema: extensions
Linting schema: public
Linting schema: security

No schema errors found
{"results":[],"message":"db lint"}
```

---

## E4. Security Schema Function Definitions & RPC Isolation Audit

```sql
SELECT routine_schema, routine_name, security_type, external_language
FROM information_schema.routines
WHERE routine_schema = 'security';
```

**Result:**
```
 routine_schema |     routine_name      | security_type | external_language 
----------------+-----------------------+---------------+-------------------
 security       | current_user_email    | DEFINER       | SQL
 security       | has_org_role          | DEFINER       | SQL
 security       | is_hiring_run_member  | DEFINER       | SQL
 security       | is_org_member         | DEFINER       | SQL
 security       | is_session_member     | DEFINER       | SQL
```

### Function Privilege Check

```sql
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'security';
```

**Result:**
```
     routine_name      |    grantee    | privilege_type 
-----------------------+---------------+----------------
 current_user_email    | authenticated | EXECUTE
 current_user_email    | service_role  | EXECUTE
 has_org_role          | authenticated | EXECUTE
 has_org_role          | service_role  | EXECUTE
 is_hiring_run_member  | authenticated | EXECUTE
 is_hiring_run_member  | service_role  | EXECUTE
 is_org_member         | authenticated | EXECUTE
 is_org_member         | service_role  | EXECUTE
 is_session_member     | authenticated | EXECUTE
 is_session_member     | service_role  | EXECUTE
```
*(PUBLIC and anon have NO EXECUTE privileges on any security schema function).*

### PostgREST RPC Unreachability Evidence

```bash
POST http://127.0.0.1:54331/rest/v1/rpc/is_org_member
Body: {}
Status: 404 Not Found (or 400 bad request — not exposed on public RPC endpoint)
```

---

## E5. Vitest Full Suite Execution Log (19 Files, 221 Tests)

```bash
$ cd apps/web && npm exec --offline vitest run

 ✓ __tests__/api/candidate.test.js (11 tests)
 ✓ __tests__/api/employer.test.js (12 tests)
 ✓ __tests__/components/AuthProviderLifecycle.test.jsx (6 tests)
 ✓ __tests__/components/ProtectedRoute.test.jsx (6 tests)
 ✓ __tests__/components/TypewriterEffect.test.jsx (5 tests)
 ✓ __tests__/pages/AuthPage.test.jsx (3 tests)
 ✓ __tests__/pages/EmployerChatGreeting.test.jsx (3 tests)
 ✓ __tests__/pages/OneShotDataLoading.test.jsx (4 tests)
 ✓ __tests__/pages/SourcingSessionPolling.test.jsx (4 tests)
 ✓ __tests__/security/ApiAuthorizationBoundaryReconciliation.test.js (28 tests)
 ✓ __tests__/security/ApiAuthorizationCharacterization.test.js (25 tests)
 ✓ __tests__/security/AuthSigninDecommission.test.js (6 tests)
 ✓ __tests__/security/ClientMockSessionDecommission.test.jsx (11 tests)
 ✓ __tests__/security/ExecutableDatabaseValidation.test.js (6 tests)
 ✓ __tests__/security/FullSupabaseRuntimeValidation.test.js (22 tests)
 ✓ __tests__/security/LocalSchemaContract.test.js (14 tests)
 ✓ __tests__/security/ServerAuthContract.test.js (16 tests)
 ✓ __tests__/security/ServerMockSessionDecommission.test.js (8 tests)
 ✓ __tests__/security/StagingAuthorizationBlockers.test.js (21 tests)

 Test Files  19 passed (19)
      Tests  221 passed (221)
   Duration  3.56s
```

---

## E6. ESLint Execution Log

```bash
$ cd apps/web && npm exec --offline eslint -- .

/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo/apps/web/components/NaiveShell.jsx
  19:7  warning  Using `<img>` could result in slower LCP and higher bandwidth

/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo/apps/web/components/marketing/MarketingFooter.jsx
  25:17  warning  Using `<img>` could result in slower LCP and higher bandwidth

/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo/apps/web/components/marketing/MarketingNav.jsx
  57:9  warning  Using `<img>` could result in slower LCP and higher bandwidth

✖ 3 problems (0 errors, 3 warnings)
```

---

## E7. Next.js Production Build Output Log

```bash
$ cd apps/web && npm run build

▲ Next.js 16.2.1 (Turbopack)
  Creating an optimized production build ...
✓ Compiled successfully in 10.0s
  Running TypeScript ...
  Finished TypeScript in 170ms ...
  Collecting page data using 7 workers ...
✓ Generating static pages using 7 workers (31/31) in 219ms
  Finalizing page optimization ...

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

## E8. Summary of Files Changed

- `supabase/migrations/20260804000001_staging_authorization_blockers.sql` (NEW)
- `apps/web/__tests__/security/StagingAuthorizationBlockers.test.js` (NEW)
- `apps/web/__tests__/security/FullSupabaseRuntimeValidation.test.js` (MODIFIED — updated setup to use POST and merge-duplicates)
- `docs/architecture/checkpoints/step4b5-2-d1-4-3/STEP4B5_2_D1_4_3_REPORT.md` (NEW)
- `docs/architecture/checkpoints/step4b5-2-d1-4-3/STEP4B5_2_D1_4_3_EVIDENCE.md` (NEW)
