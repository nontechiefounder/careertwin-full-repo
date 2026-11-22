# Step 4B5.2-B Report (Authorization Data-Model and RLS Readiness Verification)

**Date:** August 2, 2026  
**Task:** Verify Authorization Data-Model, Database Schema, and RLS Readiness Before Route Migration  
**Status:** COMPLETED — Comprehensive read-only audit of database definitions, resource relationship chains, and authorization field readiness. Zero production source code modified.

---

## 1. Executive Summary

Step 4B5.2-B executed a repository-wide read-only audit to determine whether the database schema, foreign key relationships, indexes, and RLS policies required by the approved sensitive-route access models currently exist.

The audit revealed that **core authorization tables (`organizations`, `organization_memberships`, `invitation_tokens`, `idempotency_records`) do not exist in repository definitions**, and existing tables (`candidates`, `hiring_runs`) lack mandatory tenant and user columns (`org_id`, `user_id`). Consequently, **Migration Readiness Decision C** was established: core authorization schema definitions and migrations must precede API route authorization migration.

---

## 2. Baseline Verification

- **Branch:** `antigravity/step4b2-frontend-parity`
- **HEAD Commit:** `064b031` (`docs(security): define sensitive route access models`)
- **Working Tree:** Clean
- **Git Remote:** None
- **Package Manifest Hashes:** `package.json` and `package-lock.json` match baseline SHA256
- **In-Memory Credential Scan:** 0 documentation matches, 0 test-source matches
- **ESLint Output:** 0 errors, 3 image warnings remaining (W07, W08, W09 — all `@next/next/no-img-element`)
- **Vitest Test Suite:** 15 test files, 158 / 158 tests passed (100% green)
- **Next.js Production Build:** Exit code 0 (21 page routes, 28 API handler paths)

---

## 3. Inventory of Database Definitions

| Table / Record Type | Status in Repository | Defining File | Notes |
|---|---|---|---|
| `organizations` | **ABSENT** | None | 0 DDL definitions, 0 SQL files |
| `organization_memberships` | **ABSENT** | None | Referenced only in design docs |
| `candidates` | **REFERENCED ONLY** | None | Queried in API routes, 0 DDL definitions |
| `hiring_runs` | **REFERENCED ONLY** | None | Queried in API routes, 0 DDL definitions |
| `candidate_extractions` | **ABSENT** | None | 0 DDL definitions, 0 API table references |
| `screening_sessions` | **REFERENCED ONLY** | None | Queried in API routes, 0 DDL definitions |
| `screening_answers` | **REFERENCED ONLY** | None | Queried in API routes, 0 DDL definitions |
| `screening_summaries` | **REFERENCED ONLY** | None | Queried in API routes, 0 DDL definitions |
| `idempotency_records` | **ABSENT** | None | 0 DDL definitions, 0 table queries |
| `audit_records` | **ABSENT** | None | 0 DDL definitions |

---

## 4. Authorization Field Verification

| Required Authorization Field | Status | Required Action |
|---|---|---|
| `candidates.user_id` | **MISSING** | Migration required (`ALTER TABLE candidates ADD COLUMN user_id UUID ...`) |
| `candidates.org_id` | **MISSING** | Migration required (`ALTER TABLE candidates ADD COLUMN org_id UUID ...`) |
| `candidates.hiring_run_id` | **REFERENCED ONLY** | Confirm foreign key constraint & index in DDL |
| `hiring_runs.org_id` | **MISSING** | Migration required (`ALTER TABLE hiring_runs ADD COLUMN org_id UUID ...`) |
| `hiring_runs.employer_id` | **REFERENCED ONLY** | Legacy column present; must transition to `org_id` |
| `organization_memberships.org_id` | **MISSING** | Table & column migration required |
| `organization_memberships.user_id` | **MISSING** | Table & column migration required |
| `organization_memberships.role` | **MISSING** | Table & column migration required |
| `organization_memberships.status` | **MISSING** | Table & column migration required |
| `screening_sessions.candidate_id` | **REFERENCED ONLY** | Confirm foreign key constraint & index in DDL |
| `screening_sessions.hiring_run_id` | **REFERENCED ONLY** | Confirm foreign key constraint & index in DDL |
| `screening_sessions.invitation_token_hash` | **MISSING** | Migration required on `screening_sessions` or new table |
| `screening_sessions.expires_at` | **MISSING** | Migration required |
| `screening_sessions.revoked_at` | **MISSING** | Migration required |
| `screening_sessions.status` | **REFERENCED ONLY** | Confirm enum constraints |
| `idempotency_records` fields | **MISSING** | New table migration required |

---

## 5. Resource Relationship Chains & RLS Status

- **Chain A (`extractionId` -> `candidate` -> `hiring_run` -> `organization`):** **BROKEN**. `hiring_runs` has no `org_id` column, and `organizations` table does not exist.
- **Chain B (`candidateId` -> authenticated user):** **BROKEN**. `candidates` has no `user_id` foreign key.
- **Chain C (`sessionId` -> `candidate` -> `hiring_run` -> `organization`):** **BROKEN**. Missing `org_id` and `organizations` table.
- **Row-Level Security (RLS) Status:** **NOT EVIDENCED / NO MIGRATIONS OR POLICIES PRESENT**. Zero PostgreSQL `CREATE POLICY` statements exist in repository code.

---

## 6. Service-Role Bootstrap Decision & Authorization Helper Contract

- **Service-Role Bootstrap Decision:** **Option C (Dedicated Server-Only Authorization Helper)**.
  - *Option D (General service role before authorization)* is classified as **UNSAFE** because it bypasses tenant isolation before access validation.
- **Employer Authorization Helper Contract (`authorizeEmployerResource`):**
  ```javascript
  authorizeEmployerResource({ client, userId, resourceType, resourceId, action })
  ```
  - **Success Return:** `{ ok: true, authorized: true, orgId, membershipId, authoritativeRole, resourceId }`
  - **Failure Status Semantics:** `UNAUTHENTICATED` (401), `RESOURCE_NOT_FOUND` (404), `INSUFFICIENT_PERMISSIONS` (403), `INFRASTRUCTURE_ERROR` (503).

---

## 7. Data Models Design (Proposed)

### Candidate Account Linking Model
- Candidate accounts must be linked via `candidates.user_id` during invitation redemption or explicit onboarding.
- **Account Takeover Protection:** Matching email address alone MUST NOT automatically link candidate records without verified invitation token redemption or email confirmation proof.

### Invitation Token Data Model
- High-entropy random token (`crypto.randomBytes(32)` -> 256 bits).
- Stored as SHA-256 or HMAC-SHA256 hash (`invitation_token_hash`).
- Columns: `id`, `invitation_token_hash`, `token_version`, `candidate_id`, `hiring_run_id`, `session_id`, `org_id`, `issued_at`, `expires_at`, `revoked_at`, `used_at`, `status`, `created_by_user_id`.
- Transport: One-time token exchange link converting query-string token into a scoped, HttpOnly session cookie.

### Idempotency Data Model
- Table: `idempotency_records`
- Columns: `id`, `org_id`, `actor_user_id`, `route_action`, `idempotency_key_hash`, `request_fingerprint`, `status`, `response_payload`, `resource_reference_id`, `created_at`, `expires_at`.
- Unique Constraint: `(org_id, route_action, idempotency_key_hash)`.

---

## 8. Migration Readiness Decision & Recommended Implementation Order

### Migration Readiness Decision
**C. Core authorization schema and RLS are missing; migration design must precede route changes.**

### Proposed Implementation Order
1. **Schema Migrations & DDL:** Create `organizations`, `organization_memberships`, `invitation_tokens`, `idempotency_records`; add `org_id` and `user_id` columns to `candidates` and `hiring_runs`.
2. **RLS Policies & RPCs:** Apply PostgreSQL RLS policies and security-definer helper functions.
3. **Authorization Helpers:** Implement `authorizeEmployerResource` and `verifyInvitationToken` in `apps/web/lib/`.
4. **Helper Unit & Denial Tests:** Add unit test suite verifying 401, 403, 404, 503 outcomes.
5. **Batch B5.2.1 Route Migration:** Migrate packet GET, generate, and action routes (with LLM provider gating and idempotency).
6. **Batch B5.2.2 Route Migration:** Migrate candidate status and proof-profile routes.
7. **Batch B5.2.3 Route Migration:** Migrate candidate screening session routes with invitation-token validation.

---

## 9. Founder Review Request

Step 4B5.2-B database definition inventory, authorization field audit, relationship chain verification, RLS readiness assessment, and migration readiness decision are complete. Request founder review and approval.
