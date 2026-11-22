# Step 4B5.2-D2C-R3.2 — Evidence File

**Date:** 2026-08-10  
**Baseline Commit:** `653feb3b9f4efa3a5bcf76e0758f3416a67d1ca3`  
**Branch:** `antigravity/step4b2-frontend-parity`  
**Target Staging Project:** `headwayos-secondary` (masked ref: `phli...xskd`), Region: `ap-northeast-2`  

---

## E1. Process Discrepancy Record & Pre-Execution Repository Verification

```bash
# Process Discrepancy Note:
# In Step 4B5.2-D2C-R3.1, the captured pre-execution git status was not clean prior to commit creation.
# This historical event is recorded here directly without altering git history.

$ git branch --show-current
antigravity/step4b2-frontend-parity

$ git status --short
M apps/web/__tests__/staging/StagingRemoteRuntimeValidation.test.js
?? docs/architecture/checkpoints/step4b5-2-d2c-r3-2/

$ git remote -v
(no output — zero Git remotes configured)

$ npx supabase projects list (masked for sanitization)
Project: headwayos-secondary | Region: ap-northeast-2 | Ref: phli...xskd | Status: ACTIVE_HEALTHY
```

---

## E2. Sanitized Live Execution Output & Metrics (`CAREERTWIN_RUN_STAGING_TESTS=1`)

```text
DEFERRED/BLOCKED — legitimate server-originated screening-session fixture required.

--- SANITIZED STAGING EXECUTION METRICS ---
Live HTTPS Request Count: 126
Authorization Assertion Count: 40
Successful Permitted Operation Count: 6
Expected Permitted Operation Count: 6
Denied Operation Count: 50
Denied Mutations with Verified Equal Hashes / Absence Proof: 24
Anonymous Table Checks: 13/13
Targeted Duration: 23945ms
Skipped Targeted Tests: 0
Mocked Network Calls: 0
Early-Return Paths Taken: 0
-------------------------------------------

Test Results: 12 passed (12/12)
Duration: 24.87s
```

---

## E3. Canonical Quality Gate Execution Output (`apps/web`)

### Canonical Vitest Suite (`CAREERTWIN_RUN_STAGING_TESTS` Unset)

```bash
$ cd apps/web && unset CAREERTWIN_RUN_STAGING_TESTS && npm exec --offline vitest run

 ✓ __tests__/security/ApiAuthorizationCharacterization.test.js (25 tests)
 ✓ __tests__/security/FullSupabaseRuntimeValidation.test.js (22 tests)
 ...
 Test Files  19 passed | 1 skipped (20)
      Tests  221 passed | 1 skipped (222)
   Start at  01:59:30
   Duration  3.81s
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
✓ Compiled successfully in 8.6s
  Running TypeScript ...
  Finished TypeScript in 130ms ...
  Collecting page data using 7 workers ...
✓ Generating static pages using 7 workers (31/31) in 270ms
```
