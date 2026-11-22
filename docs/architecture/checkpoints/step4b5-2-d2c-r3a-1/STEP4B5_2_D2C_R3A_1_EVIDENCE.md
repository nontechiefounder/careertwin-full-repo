# Step 4B5.2-D2C-R3A.1 — Evidence File

**Date:** 2026-08-10  
**Baseline Commit:** `8fba190b5e379dfd1f42199ca3c40885959b479e`  
**Branch:** `antigravity/step4b2-frontend-parity`  
**Target Project:** `headwayos-secondary` (masked ref: `phli...xskd`), Region: `ap-northeast-2`  

---

## E1. Pre-Execution Repository Gate Verification

```bash
$ git branch --show-current
antigravity/step4b2-frontend-parity

$ git rev-parse HEAD
8fba190b5e379dfd1f42199ca3c40885959b479e

$ git status --short
(no output — clean working tree)

$ git remote -v
(no output — zero Git remotes configured)
```

---

## E2. Scenario Inventory & State Proof Method Mapping

| Subtest / Scenario Category | Operation / Target Path | Permitted / Denied | Code-Level State Proof Method | Remotely Executable (Publishable Key + User JWT) |
| :--- | :--- | :--- | :--- | :--- |
| **1. Auth Verification** | Password login + `/auth/v1/user` check | Permitted | Non-null session + email identity match | Yes |
| **2. Fixture Inventory** | `profiles` GET + relationship check | Permitted | `res.status === 200` & row count `1` | Yes |
| **3. Org Memberships** | Alpha Owner GET Alpha Org | Permitted | `res.status === 200` & row count `1` | Yes |
| **3. Org Memberships** | Beta Owner GET Alpha Org | Denied | `res.status === 200` & row count `0` | Yes |
| **3. Org Memberships** | Recruiter POST Membership | Denied | Verified Absence Proof (`0` before & `0` after) | Yes |
| **3. Org Memberships** | Recruiter PATCH Membership | Denied | Verified Hash Equality (`hashBefore === hashAfter`) | Yes |
| **3. Org Memberships** | Recruiter DELETE Membership | Denied | Verified Existence Proof (`hashBefore === hashAfter`) | Yes |
| **3. Org Memberships** | Auditor POST / PATCH / DELETE | Denied | Verified Absence Proof & Hash Equality | Yes |
| **3. Org Memberships** | Cross-Org PATCH (Alpha <-> Beta) | Denied | Verified Hash Equality (`hashBefore === hashAfter`) | Yes |
| **4. Profiles** | Own Profile GET / PATCH | Permitted | `res.status === 200` / `204` | Yes |
| **4. Profiles** | Cross-User Profile PATCH | Denied | Verified Hash Equality (`hashBefore === hashAfter`) | Yes |
| **4. Profiles** | Protected Columns (`role`, `gmail_*`) | Denied | Verified Hash Equality (`hashBefore === hashAfter`) | Yes |
| **5. Hiring Runs** | Alpha Owner GET / Beta Owner GET | Permitted / Denied | Row count `1` (permitted) / `0` (denied) | Yes |
| **5. Hiring Runs** | Auditor PATCH Hiring Run | Denied | Verified Hash Equality (`hashBefore === hashAfter`) | Yes |
| **6. Sourcing Sessions** | Alpha Owner GET / Beta Owner GET | Permitted / Denied | Row count `1` (permitted) / `0` (denied) | Yes |
| **6. Sourcing Sessions** | Auditor / Candidate PATCH Sourcing | Denied | Verified Hash Equality (`hashBefore === hashAfter`) | Yes |
| **7. Candidates** | Candidate 1 GET Candidate 1 Record | Permitted | Row count `1` | Yes |
| **7. Candidates** | Candidate 1 GET Candidate 2 Record | Denied | Row count `0` | Yes |
| **7. Candidates** | Candidate 2 GET Candidate 1 Record | Denied | Row count `0` | Yes |
| **7. Candidates** | Alpha Employer GET Beta Candidate | Denied | Row count `0` | Yes |
| **7. Candidates** | Beta Employer GET Alpha Candidate | Denied | Row count `0` | Yes |
| **7. Candidates** | Candidate PATCH Status/Fit | Denied | Verified Hash Equality (`hashBefore === hashAfter`) | Yes |
| **8. Screening Sessions** | Candidate 1 GET / Candidate 2 GET | Permitted / Denied | Row count `1` (permitted) / `0` (denied) | Yes |
| **8. Screening Sessions** | Candidate 1 PATCH Protected Fields | Denied | Verified Hash Equality (`hashBefore === hashAfter`) | Yes |
| **8. Screening Answers** | Candidate 1 POST / GET Answer 1 | Permitted | Row count `1` & ID match after POST | Yes |
| **8. Screening Answers** | Candidate 2 POST Cross Answer | Denied | Verified Absence Proof (`0` before & `0` after) | Yes |
| **8. Screening Answers** | Candidate 1 DELETE Answer 1 | Denied | Verified Existence Proof (`hashBefore === hashAfter`) | Yes |
| **9. Activity Events** | Client POST Activity Event | Denied | Verified Absence Proof (`0` before & `0` after) | Yes |
| **9. Activity Events** | Positive Tenant Read Isolation | Permitted (Blocked) | **Case B Boundary**: Client POST disabled by RLS | **No** (Requires Server Worker Fixture) |
| **10. Scheduled Emails** | Client GET / POST / PATCH / DELETE | Denied | Schema-valid payload absence & 403 proof | Yes |
| **11. Anonymous Matrix** | 13 Public Tables SELECT | Denied | `res.status === 200` & row count `0` / `403` | Yes |

---

## E3. Scheduled Emails Schema-Valid Payload Verification

```sql
-- DDL Verification from migration 20260803000001_operational_schema_baseline.sql
CREATE TABLE IF NOT EXISTS scheduled_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    candidate_id UUID REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    sequence_day INTEGER,
    scheduled_for TIMESTAMPTZ,
    subject TEXT,
    body TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    error_details TEXT,
    sent_at TIMESTAMPTZ
);
REVOKE ALL ON scheduled_emails FROM anon, authenticated;
```

*Payload Schema Proof*: The test payload `{ id, employer_id: alphaOwner.id, candidate_id: candOne.id, sequence_day: 1, subject: 'Follow-up Email', body: 'Body text', status: 'pending' }` matches all column names, types (`UUID`, `INT`, `TEXT`), and FK constraints. Denial is strictly due to `REVOKE ALL` client privilege revocation.

---

## E4. Canonical Quality Gate Execution Output (`apps/web`)

### Vitest Suite (`CAREERTWIN_RUN_STAGING_TESTS` Unset)

```bash
$ cd apps/web && unset CAREERTWIN_RUN_STAGING_TESTS && npm exec --offline vitest run

 ✓ __tests__/security/ApiAuthorizationCharacterization.test.js (25 tests)
 ✓ __tests__/security/FullSupabaseRuntimeValidation.test.js (22 tests)
 ...
 Test Files  19 passed | 1 skipped (20)
      Tests  221 passed | 1 skipped (222)
   Start at  19:45:35
   Duration  4.88s
```

### ESLint Audit (`apps/web`)

```bash
$ cd apps/web && npm exec --offline eslint -- .
推 3 problems (0 errors, 3 warnings)
```

### Next.js Production Build (`apps/web`)

```bash
$ cd apps/web && npm run build
▲ Next.js 16.2.1 (Turbopack)
✓ Compiled successfully in 11.9s
  Running TypeScript ...
  Finished TypeScript in 265ms ...
  Collecting page data using 7 workers ...
✓ Generating static pages using 7 workers (31/31) in 188ms
```
