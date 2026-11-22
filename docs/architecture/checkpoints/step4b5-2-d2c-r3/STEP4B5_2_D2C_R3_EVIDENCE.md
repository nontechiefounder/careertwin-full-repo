# Step 4B5.2-D2C-R3 — Evidence File

**Date:** 2026-08-10  
**Baseline Commit:** `f4ed476e69c5fb44704e05a430aaabba6e89ade4`  
**Branch:** `antigravity/step4b2-frontend-parity`  
**Target Staging Project:** `headwayos-secondary` (masked ref: `phli...xskd`), Region: `ap-northeast-2`  

---

## E1. Pre-Execution Repository & Project Gate Verification

```bash
$ git branch --show-current
antigravity/step4b2-frontend-parity

$ git rev-parse HEAD
f4ed476e69c5fb44704e05a430aaabba6e89ade4

$ git status --short
(no output — clean working tree)

$ git remote -v
(no output — zero Git remotes configured)

$ npx supabase projects list --output json
[
  {
    "id": "phliezryayjzflvdxskd",
    "linked": true,
    "name": "headwayos-secondary",
    "ref": "phliezryayjzflvdxskd",
    "region": "ap-northeast-2",
    "status": "ACTIVE_HEALTHY"
  }
]
```

---

## E2. Sanitized Live Execution Output & Metrics (`CAREERTWIN_RUN_STAGING_TESTS=1`)

```text
--- SANITIZED STAGING EXECUTION METRICS ---
Live HTTPS Request Count: 123
Authorization Assertion Count: 40
Successful Permitted Operation Count: 4
Denied Operation Count: 44
Denied Mutations with Verified Equal Hashes / Absence Proof: 20
Anonymous Table Checks: 13/13
Targeted Duration: 25166ms
Skipped Targeted Tests: 0
Mocked Network Calls: 0
Early-Return Paths Taken: 0
-------------------------------------------

Test Results: 10 passed, 2 failed
Duration: 25.95s
```

---

## E3. RLS Schema Discrepancy & Root Cause Analysis

### Discrepancy 1: `organizations` Table Missing `SELECT` Policy
- **Observed Behavior**: `GET /rest/v1/organizations?id=eq.00000000-0000-4000-d2c0-000000000001` returns `200 []` for all authenticated users.
- **Root Cause**:
  In migration `20260803000002_organization_and_rls_hardening.sql`, policy `organizations_select` was created:
  `CREATE POLICY organizations_select ON organizations FOR SELECT TO authenticated USING (is_org_member(id, auth.uid()) OR created_by = auth.uid());`
  In migration `20260804000001_staging_authorization_blockers.sql`, execution of:
  `DROP FUNCTION IF EXISTS public.is_org_member(UUID, UUID) CASCADE;`
  automatically dropped policy `organizations_select` due to `CASCADE`. Migration `20260804000001` recreated `organizations_update`, but omitted recreating `organizations_select`.
- **Database `pg_policies` State**: `organizations` table has `INSERT` and `UPDATE` policies, but `0` `SELECT` policies. In PostgreSQL RLS, default deny blocks all client SELECTs when no SELECT policy exists.

---

## E4. Quality Gate Execution Output (`apps/web`)

### Canonical Vitest Suite (`CAREERTWIN_RUN_STAGING_TESTS` Unset)

```bash
$ cd apps/web && unset CAREERTWIN_RUN_STAGING_TESTS && npm exec --offline vitest run

 ✓ __tests__/security/ApiAuthorizationCharacterization.test.js (25 tests)
 ✓ __tests__/security/FullSupabaseRuntimeValidation.test.js (22 tests)
 ...
 Test Files  19 passed | 1 skipped (20)
      Tests  221 passed | 1 skipped (222)
   Start at  22:34:32
   Duration  4.16s
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
✓ Compiled successfully in 9.3s
  Running TypeScript ...
  Finished TypeScript in 263ms ...
  Collecting page data using 7 workers ...
✓ Generating static pages using 7 workers (31/31) in 358ms
```
