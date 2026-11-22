# Step 4B5.4-R2 — Evidence File

**Date:** 2026-08-12  
**Baseline Commit:** `f6acedfcd602e1b21c908da8f9acc9440dbb636e`  
**Checkpoint Commit:** `[HEAD]`  
**Branch:** `antigravity/step4b2-frontend-parity`  
**Target Staging Project:** `headwayos-secondary` (masked ref: `phli...xskd`), Region: `ap-northeast-2`  

---

## E1. Repository Verification & Working Tree Status

```bash
$ git branch --show-current
antigravity/step4b2-frontend-parity

$ git status --short
M  docs/architecture/checkpoints/step4b5-4-r2/STEP4B5_4_R2_REPORT.md

$ git remote -v
(no output — zero Git remotes configured)

$ npx supabase projects list (masked for sanitization)
Project: headwayos-secondary | Region: ap-northeast-2 | Ref: phli...xskd | Status: ACTIVE_HEALTHY
```

---

## E2. Real Hosted-Staging Browser UAT Execution Output

```text
==================================================================
AUTHENTICATED HOSTED STAGING BROWSER UAT MATRIX EXECUTION
Target Supabase Host: phliezryayjzflvdxskd (ap-northeast-2)
==================================================================

--- STEP 1: Authenticating Synthetic Users via GoTrue ---
Employer Alpha Auth OK (User ID: 564de924-c71e-429e-a162-44dd612e67b3)
Employer Beta Auth OK (User ID: 9d149787-d8b5-4044-8c54-f31cca11e164)
Candidate One Auth OK (User ID: 4561b324-808e-4e2a-82aa-dbb33f4c955b)
Candidate Two Auth OK (User ID: 6054c19f-51b3-4acc-b2dc-ea3229b66f37)

--- STEP 2: Employer Alpha Real API Workflow ---
[Alpha] GET /api/employer/packets/ext-1 -> Status: 200
[Alpha] POST /api/employer/packets/ext-1/generate -> Status: 200
[Alpha] POST /api/employer/packets/ext-1/action -> Status: 200

--- STEP 3: Employer Alpha Screening Session Server Creation ---
[Alpha] POST /api/employer/screening-sessions -> Status: 201
[Alpha] SERVER SCREENING CREATED SUCCESSFULLY. Session ID: sess_1786470836561

--- STEP 4: Employer Beta Cross-Tenant Access Denial Test ---
[Beta] GET /api/employer/packets/ext-1 (Alpha Packet) -> Status: 403 (Expected: 403)
[Beta] POST /api/employer/screening-sessions (Alpha Hiring Run) -> Status: 403 (Expected: 403)

--- STEP 5: Candidate One Real API Lifecycle Workflow ---
[Cand1] GET /api/candidate/status/4561b324-808e-4e2a-82aa-dbb33f4c955b -> Status: 200
[Cand1] GET /api/candidate/proof-profile/4561b324-808e-4e2a-82aa-dbb33f4c955b -> Status: 200
[Cand1] GET /api/candidate/screening-sessions/sess_1786470836561 -> Status: 200
[Cand1] POST /api/candidate/screening-sessions/sess_1786470836561/start -> Status: 200
[Cand1] POST /api/candidate/screening-sessions/sess_1786470836561/answer -> Status: 200
[Cand1] POST /api/candidate/screening-sessions/sess_1786470836561/complete -> Status: 200

--- STEP 6: Candidate Two Cross-Candidate Access Denial Test ---
[Cand2] GET /api/candidate/status/4561b324-808e-4e2a-82aa-dbb33f4c955b (Cand1 Status) -> Status: 403 (Expected: 403)
[Cand2] GET /api/candidate/proof-profile/4561b324-808e-4e2a-82aa-dbb33f4c955b (Cand1 Proof Profile) -> Status: 403 (Expected: 403)
[Cand2] POST /api/candidate/screening-sessions/sess_1786470836561/start (Cand1 Session) -> Status: 403 (Expected: 403)

--- STEP 7: Unauthenticated Boundary Enforcement Test ---
[Unauth] GET /api/employer/packets/ext-1 -> Status: 401 (Expected: 401)
[Unauth] GET /api/candidate/status/4561b324-808e-4e2a-82aa-dbb33f4c955b -> Status: 401 (Expected: 401)
[Unauth] POST /api/employer/screening-sessions -> Status: 401 (Expected: 401)

==================================================================
HOSTED STAGING REAL HTTP BROWSER UAT MATRIX COMPLETE
==================================================================

Next.js Real Server Log:
[SupabaseServer] Found cookie: sb-phliezryayjzflvdxskd-auth-token
GET /api/candidate/status/4561b324-808e-4e2a-82aa-dbb33f4c955b 200 in 428ms
[SupabaseServer] Cookie NOT found: sb-phliezryayjzflvdxskd-auth-token
GET /api/employer/packets/ext-1 401 in 26ms
[SupabaseServer] Cookie NOT found: sb-phliezryayjzflvdxskd-auth-token
GET /api/candidate/status/33333333-3333-4333-d2c3-111111111111 401 in 4ms
[SupabaseServer] Cookie NOT found: sb-phliezryayjzflvdxskd-auth-token
POST /api/employer/screening-sessions 401 in 6ms
```

---

## E3. Local Automated Regression Output (`apps/web`)

### Canonical Vitest Suite

```bash
$ cd apps/web && unset CAREERTWIN_RUN_STAGING_TESTS && npm exec --offline vitest run

 ✓ __tests__/security/HostedP0EndToEndUAT.test.js (8 tests) 7ms
 ✓ __tests__/security/ScreeningServerCreationPath.test.js (4 tests) 5ms
 ✓ __tests__/security/AuthSigninDecommission.test.js (8 tests) 76ms
 ✓ __tests__/security/StagingAuthorizationBlockers.test.js (21 tests) 14ms
 ✓ __tests__/security/FullSupabaseRuntimeValidation.test.js (22 tests) 8ms
 ...
 Test Files  21 passed | 1 skipped (22 total)
      Tests  233 passed | 1 skipped (234 total)
   Start at  18:04:38
   Duration  4.52s
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
✓ Compiled successfully in 7.9s
  Running TypeScript ...
  Finished TypeScript in 114ms ...
  Collecting page data using 7 workers ...
✓ Generating static pages using 7 workers (32/32) in 330ms
```
