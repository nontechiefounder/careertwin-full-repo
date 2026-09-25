# Step 4B5.2-D2A — Evidence File

**Date:** 2026-08-05  
**Baseline Commit:** `721766e`  
**Local Database:** `postgresql://postgres:postgres@127.0.0.1:54332/postgres`  

---

## E1. Local Baseline Verification Log

```bash
$ git branch --show-current
antigravity/step4b2-frontend-parity

$ git log -n 1 --oneline
721766e docs(database): verify isolated staging migration preflight

$ git status --short
(no output — clean working tree)

$ git remote -v
(no output — zero Git remotes configured)

$ docker info --format '{{.ServerVersion}}'
29.6.2
```

---

## E2. Linked Project Verification & Remote Migration History Log

```bash
$ npx supabase projects list
{"projects":[{"id":"phli...xskd","ref":"phli...xskd","name":"headwayos-secondary","region":"ap-northeast-2","status":"ACTIVE_HEALTHY","linked":true}]}

$ npx supabase migration list --linked
Connecting to remote database...
{"migrations":[
  {"local":"20260803000001","remote":"","time":"2026-08-03 00:00:01"},
  {"local":"20260803000002","remote":"","time":"2026-08-03 00:00:02"},
  {"local":"20260803000003","remote":"","time":"2026-08-03 00:00:03"},
  {"local":"20260804000001","remote":"","time":"2026-08-04 00:00:01"}
],"message":"Migrations listed"}
```

---

## E3. Remote Dry-Run Execution Log

```bash
$ npx supabase db push --linked --dry-run
DRY RUN: migrations will *not* be pushed to the database.
Initialising login role...
Connecting to remote database...
Would push these migrations:
 • 20260803000001_operational_schema_baseline.sql
 • 20260803000002_organization_and_rls_hardening.sql
 • 20260803000003_organization_authorization_completion.sql
 • 20260804000001_staging_authorization_blockers.sql
{"upToDate":false,"dryRun":true,"migrations":["20260803000001_operational_schema_baseline.sql","20260803000002_organization_and_rls_hardening.sql","20260803000003_organization_authorization_completion.sql","20260804000001_staging_authorization_blockers.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
```

---

## E4. Vitest Quality Gate Execution Log (19 Files, 221 Tests)

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
   Duration  5.32s
```

---

## E5. ESLint Quality Gate Execution Log

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

## E6. Next.js Production Build Output Log

```bash
$ cd apps/web && npm run build

▲ Next.js 16.2.1 (Turbopack)
  Creating an optimized production build ...
✓ Compiled successfully in 9.2s
  Running TypeScript ...
  Finished TypeScript in 157ms ...
  Collecting page data using 7 workers ...
✓ Generating static pages using 7 workers (31/31) in 172ms
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

## E7. Files Created / Updated

- `docs/architecture/checkpoints/step4b5-2-d2a/STEP4B5_2_D2A_REPORT.md` (UPDATED)
- `docs/architecture/checkpoints/step4b5-2-d2a/STEP4B5_2_D2A_EVIDENCE.md` (UPDATED)
