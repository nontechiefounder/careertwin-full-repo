# Step 4B5.2-C.1.1 Report (Alembic Migration Provenance, Identity Compatibility, RLS & Contract Mapping)

**Date:** August 3, 2026  
**Task:** Read-Only Verification of Migration Provenance, Supabase Identity Compatibility, RLS Semantics, and Exact API Contract Mapping  
**Status:** COMPLETED — Comprehensive read-only audit of Alembic migration files, identity bridge absence, RLS semantics, and route handler queries. Zero production source code modified, zero database connections made.

---

## 1. Executive Summary

Step 4B5.2-C.1.1 performed an exhaustive, read-only architectural analysis of the two repository migration files (`0001_initial_schema.py` and `0002_tenant_rls_and_audit.py`) located under `migrations/versions/`.

The investigation established **Readiness Decision C: Migrations are useful baseline designs but are not proven as the deployed Supabase schema.** Key findings include:
1. **Target Architecture Disconnect:** The Alembic migrations target an independent Python/SQLAlchemy backend (`backend-starter-readonly`), not Supabase PostgREST or Supabase Auth.
2. **Missing Identity Bridge:** No foreign key or trigger bridges `auth.users.id` to `public.users.id` or `candidates.user_id`. Candidate and employer ownership authorization remains blocked until a bridge is defined.
3. **RLS Incompatibility:** The migration RLS policies rely on `current_setting('app.current_org_id')`, which standard Supabase PostgREST HTTP queries do not set automatically.
4. **Missing Screening Schema:** Screening tables (`screening_sessions`, `screening_answers`, `screening_summaries`) are completely absent from the Alembic migrations, blocking candidate screening authorization (Batch B5.2.3).

---

## 2. Baseline Verification

- **Branch:** `antigravity/step4b2-frontend-parity`
- **HEAD Commit:** `8632ce6` (`docs(security): reconcile schema with API contracts`)
- **Working Tree:** Clean
- **Git Remote:** None
- **Package Manifest Hashes:** `package.json` and `package-lock.json` match baseline SHA256
- **In-Memory Credential Scan:** 0 documentation matches, 0 test-source matches
- **ESLint Output:** 0 errors, 3 image warnings remaining (W07, W08, W09 — all `@next/next/no-img-element`)
- **Vitest Test Suite:** 15 test files, 158 / 158 tests passed (100% green)
- **Next.js Production Build:** Exit code 0 (21 page routes, 28 API route files, 30 HTTP method handlers)

---

## 3. Migration Provenance & Target Determination

| Attribute | `0001_initial_schema.py` | `0002_tenant_rls_and_audit.py` |
|---|---|---|
| **Relative Path** | `migrations/versions/0001_initial_schema.py` | `migrations/versions/0002_tenant_rls_and_audit.py` |
| **SHA-256 Hash** | `d755ae9b4077be4b7c480df17496bd6345d8e94e7cb24fbfc42296210532a029` | `c8c7ecc487c42bfcd2fea53e885afbdf83d966a49665ba1004edb1a1e029fd72` |
| **Revision ID** | `"0001"` (Down: `None`) | `"0002"` (Down: `"0001"`) |
| **Git Commit** | `4d4a618578c8cba7ec7b532074f0f8ae36923f46` | `4d4a618578c8cba7ec7b532074f0f8ae36923f46` |
| **Commit Message** | `baseline: CareerTWiN Gemini structured adapter and auth remediation` | `baseline: CareerTWiN Gemini structured adapter and auth remediation` |
| **Source Package** | `backend-starter-readonly` (Python 3.12 / Alembic) | `backend-starter-readonly` (Python 3.12 / Alembic) |
| **Target Database** | Independent Python/SQLAlchemy PostgreSQL | Independent Python/SQLAlchemy PostgreSQL |
| **Classification** | **Useful baseline design; unproven on Supabase** | **Useful baseline design; unproven on Supabase** |

---

## 4. Supabase Auth Identity Bridge Analysis

- **References to `auth.users`:** None in Alembic migration source.
- **Identity Fields in `users`:** `id` (UUID PK default `gen_random_uuid()`), `org_id`, `email`, `password_hash`, `role`, `active`.
- **Identity Bridge Assessment:** No bridge exists linking `auth.users.id` (returned by `authenticateServerRequest(request)`) to `public.users.id` or `candidates.user_id`.
- **Impact:** Candidate and employer resource ownership checks cannot be performed directly against `auth.users.id` without creating an explicit `auth_user_id` column or synchronization trigger. Ownership authorization remains **BLOCKED**.

---

## 5. Organization Membership Model & Domain Terminology

### Organization Model
- The Alembic migrations define `users.org_id` + `users.role` (Single-organization model).
- `organization_memberships` table is **ABSENT** from the migration files.
- **Recommendation:** Adopt the founder's preferred multi-tenant architecture (`users`, `organizations`, `organization_memberships`). Requires an additive migration to introduce `organization_memberships`.

### Domain Terminology & Naming
- **`roles` Table Meaning:** Represents **Hiring / Job Roles** (e.g. "Senior Backend Engineer"), NOT access control roles! Access roles are string enum values stored on `users.role` (`'employer_admin'`, `'recruiter'`).
- **`hiring_runs` Entity:** Absent from Alembic migrations. A distinct `hiring_runs` table is required to track recruitment campaign runs separate from static job role definitions.

---

## 6. Ten-Route Query & Compatibility Matrix

*(Covering the 28 API route-handler paths and 30 HTTP method handlers)*

| # | Route & Method | Current Query Target | Current Filter | Migration Target | Compatibility Classification |
|---|---|---|---|---|---|
| 1 | `GET /api/candidate/status/[candidateId]` | `candidates` | `id = candidateId` | `candidates` | `MISSING_SCHEMA` (Missing `user_id` & screening tables) |
| 2 | `GET /api/candidate/proof-profile/[candidateId]` | `candidates` | `id = candidateId` | `candidates` | `COMPATIBLE_WITH_ADDITIVE_COLUMN` (Needs `user_id`) |
| 3 | `POST /api/candidate/proof-profile/[candidateId]/generate` | `candidates` | `id = candidateId` | `candidates` | `COMPATIBLE_WITH_ADDITIVE_COLUMN` (Needs `user_id` & LLM gate) |
| 4 | `GET /api/candidate/screening-sessions/[sessionId]` | `screening_sessions` | `id = sessionId` | None (Absent) | `MISSING_SCHEMA` (`screening_sessions` table missing) |
| 5 | `POST /api/candidate/screening-sessions/[sessionId]/start` | `screening_sessions` | `id = sessionId` | None (Absent) | `MISSING_SCHEMA` (`screening_sessions` table missing) |
| 6 | `POST /api/candidate/screening-sessions/[sessionId]/answer` | `screening_answers` | `session_id` | None (Absent) | `MISSING_SCHEMA` (`screening_answers` table missing) |
| 7 | `POST /api/candidate/screening-sessions/[sessionId]/complete` | `screening_sessions` | `id = sessionId` | None (Absent) | `MISSING_SCHEMA` (`screening_sessions` table missing) |
| 8 | `GET /api/employer/packets/[extractionId]` | `candidates` | `id = extractionId` | `trust_packets` | `REQUIRES_VIEW_OR_ADAPTER` (`extractionId` refers to candidate ID) |
| 9 | `POST /api/employer/packets/[extractionId]/generate` | `candidates`, `hiring_runs` | `id = extractionId` | `trust_packets` | `REQUIRES_ROUTE_REWRITE` (Writes to `trust_packets` via auth gate) |
| 10 | `POST /api/employer/packets/[extractionId]/action` | `candidates` | `id = extractionId` | `trust_packets` | `COMPATIBLE_WITH_ADDITIVE_COLUMN` (Needs org auth & audit event) |

---

## 7. RLS Policy Semantics & PostgREST Compatibility

- **Migration Policy Definition:**
  ```sql
  CREATE POLICY tenant_isolation ON "{table}"
    USING (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
    WITH CHECK (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid);
  ```
- **PostgREST Compatibility Issue:** Standard Supabase PostgREST client calls do NOT automatically set `app.current_org_id`.
- **Security-Definer RPC Requirement:** `authorizeEmployerResource` must orchestrate user-scoped RLS queries or execute a security-definer RPC that accepts `userId` and `resourceId` and validates authorization inside PostgreSQL.

---

## 8. Audit Controls Verification

- **Trigger Protection:** `0002_tenant_rls_and_audit.py` creates `audit_events_append_only` trigger on `audit_events` preventing `UPDATE` and `DELETE`.
- **API Route Gap:** None of the current Next.js API route handlers write to `audit_events` during candidate decision packet actions (`POST .../action`). Audit logging is currently **UNIMPLEMENTED in API handler code**.

---

## 9. Readiness Decision

**C. Migrations are useful baseline designs but are not proven as the deployed Supabase schema.**

- **Rationale:** The Alembic migrations provide strong domain models for evidence, claims, and trust packets, but lack the Supabase Auth identity bridge, screening tables, multi-tenant membership, and PostgREST-compatible RLS policies required by the frontend API contracts.

---

## 10. Founder Review Request

Step 4B5.2-C.1.1 read-only verification is complete. Request founder review and approval.
