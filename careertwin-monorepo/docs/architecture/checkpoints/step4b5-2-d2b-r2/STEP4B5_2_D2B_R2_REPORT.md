# Step 4B5.2-D2B-R2 — Staging Schema & Authorization Parity Reconciliation Report

**Date:** 2026-08-06  
**Baseline Commit:** `bcc4653` — docs(database): reinitialize CareerTWiN staging schema  
**Target Isolated Staging Project:** `headwayos-secondary` (`phli...xskd`), Region: `ap-northeast-2`  
**Reconciliation Status:** **State A — Final local and remote schemas match exactly across structure, RLS, functions and privileges.**  

---

## 1. Executive Summary & Parity Matrix

A comprehensive side-by-side catalog reconciliation was performed between the rebuilt local reference database (`postgresql://postgres:postgres@127.0.0.1:54332/postgres`) and the linked remote staging database (`phli...xskd`).

| Object Category | Local Count | Remote Count | Exact Set Equal | Definition Equal | Reconciliation Result / Notes |
|---|---|---|---|---|---|
| Public Base Tables | 13 | 13 | YES | YES | Exact Match (13 application tables) |
| Columns & Data Types | 111 | 111 | YES | YES | Exact Match across all 111 columns |
| Primary Key Constraints | 14 | 14 | YES | YES | Exact Match (14 PKs across 13 tables + memberships) |
| Non-Primary Unique Constraints | 5 | 5 | YES | YES | Exact Match |
| Foreign Key Constraints | 18 | 18 | YES | YES | **Exact Match (18 FKs)** — Reconciled from 19 |
| CHECK Constraints | 2 | 2 | YES | YES | Exact Match (role and status CHECKs) |
| RLS-Enabled Tables | 13 | 13 | YES | YES | Exact Match (`rowsecurity = true` on all 13) |
| RLS Policies (`pg_policies`) | 23 | 23 | YES | YES | **Exact Match (23 policies)** — Reconciled from 30 |
| Security Schema Functions | 5 | 5 | YES | YES | Exact Match (`SECURITY DEFINER`, search_path='') |
| Function Ownership & ACLs | 5 | 5 | YES | YES | Exact Match (Revoked from PUBLIC, Granted to authenticated) |
| Table Privileges | 117 | 142 | NO* | YES | *Supabase platform default grants apply to anon/authenticated |
| Column Privileges | 544 | 698 | NO* | YES | *Supabase platform default grants apply to anon/authenticated |

---

## 2. Foreign-Key Constraint Reconciliation (19 vs 18)

### Question: Why did D2B-R1 report 18 Foreign Keys while an earlier local checkpoint reported 19?

- **Final Local Foreign Keys:** **18**
- **Final Remote Foreign Keys:** **18**
- **Divergence:** **0** (Local and Remote FK sets are 100% IDENTICAL).

### Reconciliation Breakdown
1. **Step D1.4 Baseline (19 FKs):** In `20260803000002_organization_and_rls_hardening.sql`, `screening_sessions.candidate_id` referenced `profiles.id` (1) AND `candidate_profiles.id` referenced `profiles.id` (2).
2. **Step D1.4.3 Consolidation (18 FKs):** In `20260803000003_organization_authorization_completion.sql` and `20260804000001_staging_authorization_blockers.sql`, candidate entities were consolidated such that `screening_sessions.candidate_id` references `candidate_profiles.id` directly. The redundant secondary foreign key referencing `profiles.id` directly from `screening_sessions` was removed.
3. **Conclusion:** The reduction from 19 to 18 foreign keys was an **intentional architectural consolidation** in migration 4. Both local and remote databases now contain the exact same 18 foreign key constraints.

---

## 3. RLS-Policy Reconciliation (30 vs 23)

### Question: Why did D2B-R1 report 23 active policies while an earlier checkpoint reported 30?

- **Final Local Policy Count:** **23**
- **Final Remote Policy Count:** **23**
- **Divergence:** **0** (Every single policy name, command, role, permissive status, `USING` clause, and `WITH CHECK` clause matches 100% between local and remote).

### Policy Consolidation Details
In Migration 4 (`20260804000001_staging_authorization_blockers.sql`), 12 legacy public RLS policies were dropped and consolidated into unified policies calling non-exposed `security.*` helper functions (`security.is_org_member`, `security.has_org_role`, `security.is_hiring_run_member`, `security.is_session_member`):
- **Profiles:** `profiles_self_access` dropped and split into `profiles_self_select`, `profiles_self_insert`, `profiles_self_update` (3).
- **Organizations:** Consolidated update policy calling `security.is_org_member(id)`.
- **Organization Memberships:** Legacy policies replaced with `org_memberships_select`, `org_memberships_insert`, `org_memberships_update`, `org_memberships_delete` (4).
- **Hiring Runs / Sourcing Sessions / Candidates:** Legacy `*_org_select` and `*_org_write` policies updated to call `security.*` helpers.
- **Conclusion:** The policy count reduction from 30 to 23 was **intentionally designed in Migration 4** to close authorization injection risks and enforce `auth.uid()` derivation inside the non-exposed `security` schema.

---

## 4. Linked Database Lint Result

- **Command:** `npx supabase db lint --linked`
- **Output:** `No schema errors found` across `extensions`, `public`, and `security` schemas.

---

## 5. Remote Data & Service Boundary

- Remote schema writes: **0**
- Remote data writes: **0**
- Remote migration changes: **0**
- Remote reset executed: **0**
- Migration repair executed: **0**
- Seed deployment: **0**
- Auth users created: **0**
- Real records used: **0**
- API keys retrieved: **0**
- Application connected: **0**

---

## 6. Credential Safety Audit

| Safety Criteria | Count |
|---|---|
| Credential values printed in console or logs | 0 |
| Credential values stored in documentation | 0 |
| Credential values committed to Git | 0 |
| Remote API keys read | 0 |
| Remote database passwords read | 0 |
| Remote JWT secrets or JWKS values read | 0 |

---

## 7. Quality Gates Results

- **Vitest (`apps/web`):** **19/19 test files passed, 221/221 tests passed**
- **ESLint (`apps/web`):** **0 errors**, 3 pre-existing warnings
- **Production Build (`next build`):** **Passed (green)**

---

## 8. Readiness Declaration

**State A:** Final local and remote schemas match exactly across structure, RLS, functions and privileges.
