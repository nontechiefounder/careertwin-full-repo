# Step 4B5.2-D2C-R2 — Evidence File

**Date:** 2026-08-10  
**Baseline Commit:** `e12d3c46312d2098d8fbddaebe90e267ca683667`  
**Target Project:** `headwayos-secondary` (masked ref: `phli...xskd`), Region: `ap-northeast-2`  

---

## E1. Pre-Execution Repository Gate Verification

```bash
$ git branch --show-current
antigravity/step4b2-frontend-parity

$ git rev-parse HEAD
e12d3c46312d2098d8fbddaebe90e267ca683667

$ git status --short
(no output — clean working tree)

$ git remote -v
(no output — zero Git remotes configured)

$ docker ps --format "{{.Names}} ({{.Status}})"
supabase_studio_careertwin-local-baseline (healthy)
supabase_pg_meta_careertwin-local-baseline (healthy)
supabase_storage_careertwin-local-baseline (healthy)
supabase_realtime_careertwin-local-baseline (healthy)
supabase_inbucket_careertwin-local-baseline (healthy)
supabase_auth_careertwin-local-baseline (healthy)
supabase_kong_careertwin-local-baseline (healthy)
supabase_analytics_careertwin-local-baseline (healthy)
supabase_db_careertwin-local-baseline (healthy)
```

---

## E2. Linked Remote Project Gate Verification

```bash
$ SUPABASE_ACCESS_TOKEN="[REDACTED]" npx supabase projects list --output json
[
  {
    "id": "phliezryayjzflvdxskd",
    "ref": "phliezryayjzflvdxskd",
    "name": "headwayos-secondary",
    "region": "ap-northeast-2",
    "status": "ACTIVE_HEALTHY",
    "linked": true
  }
]
```

---

## E3. Confirm Email Precondition

> Founder confirmed Confirm Email ON before D2C-R2 execution.

---

## E4. Synthetic Identity Authentication Results

| Actor Category | Attempted Endpoint | HTTP Status | GoTrue Error Code | Result |
| :--- | :--- | :--- | :--- | :--- |
| **Alpha Owner** | `POST /auth/v1/token?grant_type=password` | `400` | `invalid_credentials` | Denied |
| **Alpha Recruiter** | `POST /auth/v1/token?grant_type=password` | `400` | `invalid_credentials` | Denied |
| **Alpha Auditor** | `POST /auth/v1/token?grant_type=password` | `400` | `invalid_credentials` | Denied |
| **Beta Owner** | `POST /auth/v1/token?grant_type=password` | `400` | `invalid_credentials` | Denied |
| **Candidate One** | `POST /auth/v1/token?grant_type=password` | `400` | `invalid_credentials` | Denied |
| **Candidate Two** | `POST /auth/v1/token?grant_type=password` | `400` | `invalid_credentials` | Denied |

*Signup fallback (`POST /auth/v1/signup`) returned HTTP `429 over_email_send_rate_limit` due to active Confirm Email requirement.*

---

## E5. Anonymous RLS Verification (13 Public Application Tables)

| Table Name | Header (`apikey`) | Authorization Header | HTTP Status | Returned Rows | Security Outcome |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `organizations` | Present | None | `200` | `0` | Denied Access (RLS Filtered) |
| `organization_memberships` | Present | None | `200` | `0` | Denied Access (RLS Filtered) |
| `hiring_runs` | Present | None | `200` | `0` | Denied Access (RLS Filtered) |
| `profiles` | Present | None | `200` | `0` | Denied Access (RLS Filtered) |
| `candidates` | Present | None | `200` | `0` | Denied Access (RLS Filtered) |
| `candidate_profiles` | Present | None | `200` | `0` | Denied Access (RLS Filtered) |
| `proof_profiles` | Present | None | `200` | `0` | Denied Access (RLS Filtered) |
| `sourcing_sessions` | Present | None | `200` | `0` | Denied Access (RLS Filtered) |
| `screening_sessions` | Present | None | `200` | `0` | Denied Access (RLS Filtered) |
| `screening_answers` | Present | None | `200` | `0` | Denied Access (RLS Filtered) |
| `screening_summaries` | Present | None | `200` | `0` | Denied Access (RLS Filtered) |
| `activity_events` | Present | None | `200` | `0` | Denied Access (RLS Filtered) |
| `scheduled_emails` | Present | None | `403` | N/A | Denied Access (403 Forbidden) |

---

## E6. Canonical Quality Gate Execution Output

### Ordinary Vitest Suite (`CAREERTWIN_RUN_STAGING_TESTS` Unset)

```bash
$ cd apps/web && unset CAREERTWIN_RUN_STAGING_TESTS && npm exec --offline vitest run

 ✓ __tests__/security/ApiAuthorizationCharacterization.test.js (25 tests)
 ✓ __tests__/security/FullSupabaseRuntimeValidation.test.js (22 tests)
 ...
 Test Files  19 passed | 1 skipped (20)
      Tests  221 passed | 1 skipped (222)
   Start at  17:59:53
   Duration  5.41s
```

### ESLint (`apps/web`)

```bash
$ cd apps/web && npm exec --offline eslint -- .
✖ 3 problems (0 errors, 3 warnings)
```

### Next.js Production Build (`apps/web`)

```bash
$ cd apps/web && npm run build
▲ Next.js 16.2.1 (Turbopack)
✓ Compiled successfully in 10.9s
  Running TypeScript ...
  Finished TypeScript in 118ms ...
  Collecting page data using 7 workers ...
✓ Generating static pages using 7 workers (31/31) in 236ms
```
