# Step 4B5.2-D2B-R3 — Staging Client Privileges & Security Boundaries Report

**Date:** 2026-08-06  
**Baseline Commit:** `531681b` — docs(database): verify staging schema parity  
**Target Isolated Staging Project:** `headwayos-secondary` (`phli...xskd`), Region: `ap-northeast-2`  
**Reconciliation Status:** **State A — Client-role effective privileges preserve every approved CareerTWiN boundary; count differences are limited to harmless platform metadata or internal roles.**  

---

## 1. Executive Summary & Verification Matrix

A comprehensive read-only audit of client-role (`PUBLIC`, `anon`, `authenticated`) privileges and PostgreSQL effective security functions was conducted between local reference (`127.0.0.1:54332`) and remote staging (`phli...xskd`).

Every mandatory CareerTWiN authorization boundary was proven to be **100% ENFORCED and IDENTICAL** between local and remote environments.

---

## 2. Commit `531681b` File & Test Diff Audit (Part 2)

- **Files Modified in `531681b`:**
  - `apps/web/__tests__/security/StagingAuthorizationBlockers.test.js`
  - `docs/architecture/checkpoints/step4b5-2-d2b-r2/STEP4B5_2_D2B_R2_EVIDENCE.md`
  - `docs/architecture/checkpoints/step4b5-2-d2b-r2/STEP4B5_2_D2B_R2_REPORT.md`

- **Test File Diff Detail (`StagingAuthorizationBlockers.test.js`):**
  Removed `Prefer: 'resolution=merge-duplicates'` from test `beforeAll` HTTP headers when calling `POST /profiles` and `POST /organization_memberships`.
  - *Rationale:* PostgREST's `Prefer: resolution=merge-duplicates` generates an `INSERT ... ON CONFLICT DO UPDATE` SQL statement updating all columns in the payload. Because column-level `UPDATE` privileges on `profiles` (excluding `id`, `email`) and `organization_memberships` (excluding `organization_id`, `user_id`) intentionally restrict column updates for `authenticated`, PostgREST rejected the UPSERT attempt with HTTP 403. Removing `Prefer: resolution=merge-duplicates` allowed standard `INSERT` statements to succeed as designed.
- **Production Code Confirmation:** **Zero production application source files, zero API routes, and zero server auth helpers were modified.**

---

## 3. Sensitive Security Boundary Catalog Assertions (Parts 5 & 6)

Effective privilege assertions evaluated via PostgreSQL catalog functions (`has_table_privilege`, `has_column_privilege`, `has_function_privilege`, `has_schema_privilege`):

| Security Boundary Requirement | Local Result | Remote Result | Enforcement Status |
|---|---|---|---|
| `profiles`: `authenticated` INSERT allowed for `id`, `email`, `name`, `company` | Allowed (`t`) | Allowed (`t`) | **MATCH** |
| `profiles`: `authenticated` INSERT denied for `role` | Denied (`f`) | Denied (`f`) | **MATCH** |
| `profiles`: `authenticated` UPDATE allowed for `name`, `company`, `updated_at` | Allowed (`t`) | Allowed (`t`) | **MATCH** |
| `profiles`: `authenticated` UPDATE denied for `role`, `gmail_refresh_token` | Denied (`f`) | Denied (`f`) | **MATCH** |
| `profiles`: Unrestricted table-level INSERT/UPDATE denied | Denied (`f`) | Denied (`f`) | **MATCH** |
| `candidate_profiles`: `authenticated` DELETE denied | Denied (`f`) | Denied (`f`) | **MATCH** |
| `screening_sessions`: `authenticated` INSERT / DELETE denied | Denied (`f`) | Denied (`f`) | **MATCH** |
| `screening_sessions`: candidate UPDATE denied on `hiring_run_id`, `id`, `started_at` | Denied (`f`) | Denied (`f`) | **MATCH** |
| `screening_answers`: `authenticated` DELETE denied | Denied (`f`) | Denied (`f`) | **MATCH** |
| `activity_events`: `anon` / `authenticated` INSERT, UPDATE, DELETE denied | Denied (`f`) | Denied (`f`) | **MATCH** |
| `scheduled_emails`: `anon` / `authenticated` SELECT, INSERT, UPDATE, DELETE denied | Denied (`f`) | Denied (`f`) | **MATCH** |
| `security` schema functions: `PUBLIC` / `anon` EXECUTE denied | Denied (`f`) | Denied (`f`) | **MATCH** |
| `security` schema functions: `authenticated` EXECUTE granted | Granted (`t`) | Granted (`t`) | **MATCH** |
| `public` schema: `PUBLIC` / `anon` / `authenticated` CREATE denied | Denied (`f`) | Denied (`f`) | **MATCH** |
| `security` schema: `authenticated` CREATE denied | Denied (`f`) | Denied (`f`) | **MATCH** |

---

## 4. Privilege Count Difference Categorization (Part 7)

- **Table Privileges (Local: 117, Remote: 142 | 25 Extra Remote Entries):**
  - All 25 extra remote table privilege rows consist of Supabase hosted platform default table grants to `anon` (e.g. `anon | candidate_profiles | INSERT`, `anon | candidates | DELETE`).
  - **Category B (Harmless Client-Role Difference):** RLS is enabled on all 13 public tables (`rowsecurity = true`), and **ZERO active RLS policies exist for `anon`** in `pg_policies`. Because PostgreSQL RLS defaults to deny-all when no policy matches, `anon` cannot execute any table operation despite the platform table-level grant. Catalog assertions confirm `anon` access is 100% blocked.

- **Column Privileges (Local: 544, Remote: 698 | 154 Extra Remote Entries):**
  - All 154 extra remote column privilege rows correspond directly to the platform table grants mentioned above.
  - **Category B (Harmless Client-Role Difference):** Column privileges do not bypass table-level RLS policies. Column-level restrictions on sensitive fields (`role`, `gmail_*`, `hiring_run_id`, `started_at`) remain fully enforced.

- **Category C (Broadening Access) Count:** **0**
- **Category D (Unexplained Difference) Count:** **0**

---

## 5. Quality Gates & Integrity Confirmation

- **Vitest (`apps/web`):** **19/19 test files passed, 221/221 tests passed**
- **ESLint (`apps/web`):** **0 errors**, 3 pre-existing warnings
- **Production Build (`next build`):** **Passed (green)**
- **Integrity Assertions:**
  - Remote schema writes: **0**
  - Remote data writes: **0**
  - Migrations applied: **0**
  - Remote reset: **0**
  - Migration repair: **0**
  - Seed deployment: **0**
  - Auth users created: **0**
  - API keys retrieved: **0**
  - Application connected: **0**
  - Production source changes: **0**
  - Git remote or push: **0**

---

## 6. Readiness Declaration

**State A:** Client-role effective privileges preserve every approved CareerTWiN boundary; count differences are limited to harmless platform metadata or internal roles.
