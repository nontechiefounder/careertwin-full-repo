# Step 4B5.2-C.1 Report (Hosted Schema & API Contract Reconciliation)

**Date:** August 3, 2026  
**Task:** Reconcile Hosted/Alembic Database Schema Definitions with CareerTWiN API Contracts  
**Status:** COMPLETED — Full architectural reconciliation of backend migration schemas (`0001_initial_schema.py`, `0002_tenant_rls_and_audit.py`) against Next.js API handlers (`apps/web/app/api/`). Zero production source code modified.

---

## 1. Executive Summary

Step 4B5.2-C.1 performed an authoritative reconciliation between the core backend Alembic/PostgreSQL database schema definitions (`0001_initial_schema.py` and `0002_tenant_rls_and_audit.py`) and the 28 API route handlers in `apps/web/app/api/`.

The reconciliation identified exact entity alignments (`organizations`, `users`, `roles`, `candidates`, `documents`, `trust_packets`, `audit_events`), mapped foreign key relationship chains, and specified the required additive migration columns (`candidates.user_id`, `screening_sessions.invitation_token_hash`, `idempotency_records`) needed before route authorization migration.

---

## 2. Baseline Verification

- **Branch:** `antigravity/step4b2-frontend-parity`
- **HEAD Commit:** `c4ca4a5` (`docs(security): reconcile database schema source of truth`)
- **Working Tree:** Clean
- **Git Remote:** None
- **Package Manifest Hashes:** `package.json` and `package-lock.json` match baseline SHA256
- **In-Memory Credential Scan:** 0 documentation matches, 0 test-source matches
- **ESLint Output:** 0 errors, 3 image warnings remaining (W07, W08, W09 — all `@next/next/no-img-element`)
- **Vitest Test Suite:** 15 test files, 158 / 158 tests passed (100% green)
- **Next.js Production Build:** Exit code 0 (21 page routes, 28 API handler paths)

---

## 3. Schema & API Route Mapping Table

| Backend Schema Table | Primary Key | Key Foreign Keys & Attributes | Corresponding API Route Handlers | Reconciliation Findings & Action Items |
|---|---|---|---|---|
| `organizations` | `id UUID` | `name`, `created_at` | Multi-tenant tenant boundary | Authoritative org boundary for all tenant tables (`org_id`). |
| `users` | `id UUID` | `org_id`, `email`, `role`, `active` | `POST /api/auth/signin`, `signup`, `GET /api/auth/me` | Core identity table. `candidates` table requires `user_id UUID REFERENCES users(id)` for candidate account ownership. |
| `roles` | `id UUID` | `org_id`, `title`, `description`, `status` | `GET/POST /api/employer/hiring-runs`, `shortlist` | Maps to hiring roles. `hiring_runs` in API matches `roles` entity. |
| `candidates` | `id UUID` | `org_id`, `role_id`, `external_reference` | `GET/POST /api/candidate/profile`, `/status/[candidateId]`, `/proof-profile/[candidateId]` | Requires additive column `user_id UUID REFERENCES users(id)` to support `ACCOUNT_AUTHENTICATED` candidate access. |
| `documents` | `id UUID` | `org_id`, `candidate_id`, `sha256`, `scan_status` | File upload & document extraction | ClamAV quarantine & Docling parsing storage entity. |
| `trust_packets` | `id UUID` | `org_id`, `role_id`, `candidate_id`, `packet JSONB`, `version`, `released` | `GET/POST /api/employer/packets/[extractionId]` | `extractionId` in API routes maps to `trust_packets` candidate packet version. |
| `audit_events` | `id UUID` | `org_id`, `actor_id`, `action`, `object_type`, `object_id`, `before`, `after` | All mutation endpoints | Enforces append-only trigger `prevent_audit_event_mutation()`. |

---

## 4. Required Additive Migration Specifications

To support the approved access models without breaking existing contracts:

1. **Candidate Account Ownership:**
   ```sql
   ALTER TABLE candidates ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL;
   CREATE INDEX ix_candidates_user_id ON candidates(user_id);
   ```
2. **Screening Invitation Credential Storage:**
   ```sql
   CREATE TABLE screening_invitations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
     candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
     role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
     session_id UUID NOT NULL,
     invitation_token_hash TEXT NOT NULL UNIQUE,
     token_version INT NOT NULL DEFAULT 1,
     issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     expires_at TIMESTAMPTZ NOT NULL,
     revoked_at TIMESTAMPTZ,
     status VARCHAR(40) NOT NULL DEFAULT 'active',
     created_by_user_id UUID NOT NULL REFERENCES users(id)
   );
   CREATE INDEX ix_screening_invitations_hash ON screening_invitations(invitation_token_hash);
   ```
3. **Durable Idempotency Storage:**
   ```sql
   CREATE TABLE idempotency_records (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
     actor_user_id UUID NOT NULL REFERENCES users(id),
     route_action VARCHAR(100) NOT NULL,
     idempotency_key_hash TEXT NOT NULL,
     request_fingerprint TEXT NOT NULL,
     status VARCHAR(40) NOT NULL DEFAULT 'processing',
     response_payload JSONB,
     resource_reference_id UUID,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     expires_at TIMESTAMPTZ NOT NULL,
     CONSTRAINT uq_idempotency_org_action_key UNIQUE (org_id, route_action, idempotency_key_hash)
   );
   ```

---

## 5. RLS Policy Enforcement Verification

`0002_tenant_rls_and_audit.py` enforces tenant isolation across all tenant-owned tables via PostgreSQL RLS:
```sql
CREATE POLICY tenant_isolation ON "{table}"
  USING (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid)
  WITH CHECK (org_id = nullif(current_setting('app.current_org_id', true), '')::uuid);
```
downstream API handlers using `authenticateServerRequest(request)` will set `app.current_org_id` inside the database transaction context.

---

## 6. Founder Review Request

Reconciliation between the core database schema definitions and CareerTWiN API contracts is complete. Request founder review and approval.
