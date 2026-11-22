# Step 4B5.2-D2C-R3.1 — Evidence File

**Date:** 2026-08-10  
**Baseline Commit:** `1ecccc8273f75866d91dc889dd38a1e93ab5b2f4`  
**Branch:** `antigravity/step4b2-frontend-parity`  
**Target Staging Project:** `headwayos-secondary` (masked ref: `phli...xskd`), Region: `ap-northeast-2`  

---

## E1. Pre-Execution Repository & Project Gate Verification

```bash
$ git branch --show-current
antigravity/step4b2-frontend-parity

$ git status --short
M apps/web/__tests__/staging/StagingRemoteRuntimeValidation.test.js
?? supabase/migrations/20260805000001_fix_staging_rls_discrepancies.sql

$ git remote -v
(no output — zero Git remotes configured)

$ npx supabase projects list (masked for sanitization)
Project: headwayos-secondary | Region: ap-northeast-2 | Ref: phli...xskd | Status: ACTIVE_HEALTHY
```

---

## E2. Deployed Migration Definition (`20260805000001_fix_staging_rls_discrepancies.sql`)

```sql
-- Migration: 20260805000001_fix_staging_rls_discrepancies.sql
-- Description: Restore missing SELECT policy on organizations and candidate self-read policy on candidates.

-- 1. Restore SELECT policy on public.organizations
DROP POLICY IF EXISTS organizations_select ON public.organizations;
CREATE POLICY organizations_select ON public.organizations
    FOR SELECT TO authenticated
    USING (security.is_org_member(id) OR created_by = auth.uid());

-- 2. Update SELECT policy on public.candidates to include candidate self-read access
DROP POLICY IF EXISTS candidates_org_select ON public.candidates;
DROP POLICY IF EXISTS candidates_select ON public.candidates;
CREATE POLICY candidates_select ON public.candidates
    FOR SELECT TO authenticated
    USING (candidate_id = auth.uid() OR security.is_hiring_run_member(hiring_run_id));
```

```bash
$ npx supabase db push --linked
Connecting to remote database...
Applying migration 20260805000001_fix_staging_rls_discrepancies.sql...
Finished supabase db push.
```

---

## E3. Sanitized Live Execution Output & Metrics (`CAREERTWIN_RUN_STAGING_TESTS=1`)

```text
--- SANITIZED STAGING EXECUTION METRICS ---
Live HTTPS Request Count: 134
Authorization Assertion Count: 40
Successful Permitted Operation Count: 6
Denied Operation Count: 52
Denied Mutations with Verified Equal Hashes / Absence Proof: 25
Anonymous Table Checks: 13/13
Targeted Duration: 26410ms
Skipped Targeted Tests: 0
Mocked Network Calls: 0
Early-Return Paths Taken: 0
-------------------------------------------

Test Results: 12 passed (12/12)
Duration: 27.09s
```

---

## E4. Canonical Quality Gate Execution Output (`apps/web`)

### Canonical Vitest Suite (`CAREERTWIN_RUN_STAGING_TESTS` Unset)

```bash
$ cd apps/web && unset CAREERTWIN_RUN_STAGING_TESTS && npm exec --offline vitest run

 ✓ __tests__/security/ApiAuthorizationCharacterization.test.js (25 tests)
 ✓ __tests__/security/FullSupabaseRuntimeValidation.test.js (22 tests)
 ...
 Test Files  19 passed | 1 skipped (20)
      Tests  221 passed | 1 skipped (222)
   Start at  23:50:00
   Duration  3.61s
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
✓ Compiled successfully in 9.9s
  Running TypeScript ...
  Finished TypeScript in 115ms ...
  Collecting page data using 7 workers ...
✓ Generating static pages using 7 workers (31/31) in 186ms
```
