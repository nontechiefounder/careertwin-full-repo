# Step 4B5.4-R1 — Evidence File

**Date:** 2026-08-12  
**Baseline Commit:** `94b729c448efd2f5bb78b59ae5bda3a489dd07a8`  
**Checkpoint Commit:** `[HEAD]`  
**Branch:** `antigravity/step4b2-frontend-parity`  
**Target Staging Project:** `headwayos-secondary` (masked ref: `phli...xskd`), Region: `ap-northeast-2`  

---

## E1. Repository Verification & Working Tree Status

```bash
$ git branch --show-current
antigravity/step4b2-frontend-parity

$ git status --short
M  docs/architecture/checkpoints/step4b5-4-r1/STEP4B5_4_R1_REPORT.md

$ git remote -v
(no output — zero Git remotes configured)

$ npx supabase projects list (masked for sanitization)
Project: headwayos-secondary | Region: ap-northeast-2 | Ref: phli...xskd | Status: ACTIVE_HEALTHY
```

---

## E2. Real HTTP Runtime Server Output

```text
==================================================
REAL HTTP RUNTIME BROWSER UAT MATRIX EXECUTION
==================================================
[UAT 1] GET /auth -> Status: 200
[UAT 2] GET /employer/packet/ext-1 -> Status: 200
[UAT 3] GET /candidate/status/cand-1 -> Status: 200
[UAT 4] GET /api/candidate/status/cand-1 -> Status: 401 (Expected: 401)
[UAT 5] GET /api/employer/packets/ext-1 -> Status: 401 (Expected: 401)
[UAT 6] POST /api/employer/packets/ext-1/generate -> Status: 401 (Expected: 401)
[UAT 7] POST /api/employer/screening-sessions (unauthenticated) -> Status: 401 (Expected: 401)
[UAT 8] POST /api/candidate/screening-sessions/sess-1/start (unauthenticated) -> Status: 401 (Expected: 401)
==================================================
UAT NETWORK MATRIX COMPLETED SUCCESSFULLY
==================================================

Server Execution Log:
GET /auth 200 in 2.1s
GET /employer/packet/ext-1 200 in 812ms
GET /candidate/status/cand-1 200 in 508ms
[SupabaseServer] Cookie NOT found: sb-localhost:54321-auth-token
GET /api/candidate/status/cand-1 401 in 574ms
[SupabaseServer] Cookie NOT found: sb-localhost:54321-auth-token
GET /api/employer/packets/ext-1 401 in 494ms
[SupabaseServer] Cookie NOT found: sb-localhost:54321-auth-token
POST /api/employer/packets/ext-1/generate 401 in 530ms
[SupabaseServer] Cookie NOT found: sb-localhost:54321-auth-token
POST /api/employer/screening-sessions 401 in 358ms
[SupabaseServer] Cookie NOT found: sb-localhost:54321-auth-token
POST /api/candidate/screening-sessions/sess-1/start 401 in 518ms
```

---

## E3. Canonical Quality Gate Execution Output (`apps/web`)

### Canonical Vitest Suite

```bash
$ cd apps/web && unset CAREERTWIN_RUN_STAGING_TESTS && npm exec --offline vitest run

 ✓ __tests__/security/HostedP0EndToEndUAT.test.js (8 tests) 7ms
 ✓ __tests__/security/ScreeningServerCreationPath.test.js (4 tests) 16ms
 ✓ __tests__/security/AuthSigninDecommission.test.js (8 tests) 76ms
 ✓ __tests__/security/StagingAuthorizationBlockers.test.js (21 tests) 14ms
 ✓ __tests__/security/FullSupabaseRuntimeValidation.test.js (22 tests) 8ms
 ...
 Test Files  21 passed | 1 skipped (22 total)
      Tests  233 passed | 1 skipped (234 total)
   Start at  16:51:17
   Duration  4.06s
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
✓ Compiled successfully in 9.2s
  Running TypeScript ...
  Finished TypeScript in 106ms ...
  Collecting page data using 7 workers ...
✓ Generating static pages using 7 workers (32/32) in 341ms
```
