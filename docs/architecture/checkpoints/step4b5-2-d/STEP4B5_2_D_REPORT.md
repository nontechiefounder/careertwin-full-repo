# Step 4B5.2-D Report (Supabase Staging Environment & Security Migration Roadmap)

**Date:** August 3, 2026  
**Task:** Design Isolated Supabase Staging Environment, Source-Controlled Schema Adoption Plan, and Ordered Security Migration Package  
**Status:** COMPLETED — Architectural roadmap and migration design complete. Zero production source code modified, zero live database connections made.

---

## 1. Executive Summary

Step 4B5.2-D defines the comprehensive architectural design for cloning the 11-table operational Supabase data model into an isolated staging environment (`careertwin-staging-pilot`) using **synthetic data only**.

The roadmap establishes an ordered 10-stage security migration package (D1 through D10) to remediate critical cross-tenant vulnerabilities (such as the `candidates` `USING true` RLS policy), introduce invitation-token authentication for candidate screening, implement durable idempotency, establish immutable decision auditing, and secure integration credentials.

---

## 2. Baseline Verification

- **Branch:** `antigravity/step4b2-frontend-parity`
- **HEAD Commit:** `fefc31e` (`docs(security): correct hosted schema reconciliation evidence`)
- **Working Tree:** Clean
- **Git Remote:** None
- **Package Manifest Hashes:** `package.json` and `package-lock.json` match baseline SHA256
- **In-Memory Credential Scan:** 0 documentation matches, 0 test-source matches
- **ESLint Output:** 0 errors, 3 image warnings remaining (W07, W08, W09 — all `@next/next/no-img-element`)
- **Vitest Test Suite:** 15 test files, 158 / 158 tests passed (100% green)
- **Next.js Production Build:** Exit code 0 (21 page routes, 28 API route files, 30 HTTP method handlers)

---

## 3. Staging Environment Architecture & Isolation

- **Project Recommendation:** Separate, dedicated Supabase project (`careertwin-staging-pilot`).
- **Account & Org Separation:** Dedicated staging project within developer organization with strict credential isolation (separate project URL, anon key, service-role key, and JWT secret).
- **Region & Naming:** `us-east-1`, `careertwin-staging-pilot`.
- **Credential Custody:** Environment variables stored in git-ignored `.env.staging`. No credentials committed to source control.
- **Data Boundary:** Strictly restricted to synthetic mock datasets. Real candidate or employer data is **PROHIBITED**.
- **Spending Controls:** Cap API rate limits, cap database storage, set spend alerts at $20 threshold.

---

## 4. Source-Controlled Schema Adoption Strategy

1. **Baseline Migration:** `supabase/migrations/00001_initial_schema.sql` (Representing the 11 operational hosted tables).
2. **Forward-Only Migrations:** Numbered SQL migration files (`00002_...sql`, `00003_...sql`).
3. **TypeScript Contracts:** Generated contract types `apps/web/types/supabase.ts` via `supabase gen types typescript`.
4. **Drift Detection:** Automated CLI drift checks `supabase db diff --local`.
5. **Synthetic Seed Data:** `supabase/seed.sql` containing synthetic test fixtures only.

---

## 5. Ordered Security Migration Package (D1 through D10)

| Stage | Migration File | Target Tables / Additive Structures | Key Security Objective |
|---|---|---|---|
| **D1** | `00001_initial_schema.sql` | 11 Operational Baseline Tables | Establishes baseline schema source control. |
| **D2** | `00002_candidate_rls_remediation.sql` | `candidates`, `candidate_profiles` | Drops `USING true` on `candidates`; enforces employer owner and candidate self RLS. |
| **D3** | `00003_candidate_identity_chain.sql` | `candidates`, `proof_profiles` | Adds `candidates.user_id UUID REFERENCES profiles(id)`; index `ix_candidates_user_id`. |
| **D4** | `00004_employer_ownership.sql` | `hiring_runs`, `sourcing_sessions` | Adds explicit `WITH CHECK (auth.uid() = employer_id)` to prevent cross-employer insertion. |
| **D5** | `00005_screening_invitations.sql` | New `screening_invitations` table | Adds 256-bit token hash storage (`invitation_token_hash`), TTL, revocation, one-time cookie exchange. |
| **D6** | `00006_idempotency_records.sql` | New `idempotency_records` table | Adds durable idempotency storage with `(employer_id, route_action, idempotency_key_hash)` unique constraint. |
| **D7** | `00007_decision_audit_events.sql` | New `decision_audit_events` table | Creates append-only decision audit log with `prevent_audit_mutation` trigger. |
| **D8** | `00008_integration_credentials.sql` | New `integration_credentials` table | Migrates `gmail_refresh_token` out of `profiles` into server-only encrypted storage (`USING (false)`). |
| **D9** | `00009_organizations_and_memberships.sql` | `organizations`, `organization_memberships` | (Optional) Introduces multi-tenant organization structures. |
| **D10** | `00010_trust_packets_and_evidence.sql` | `trust_packets`, `evidence_refs`, `claims` | (Future) Adopts Alembic fine-grained evidence graph and immutable Trust Packets. |

---

## 6. Target RLS Model

- **`profiles`:** `auth.uid() = id` (User Self).
- **`candidate_profiles`:** `auth.uid() = id` (Candidate Self) OR employer owner of linked candidate.
- **`proof_profiles`:** `auth.uid() = candidate_id` (Candidate Self) OR employer owner via linked candidate hiring run.
- **`hiring_runs`:** `auth.uid() = employer_id` (Employer Owner).
- **`sourcing_sessions`:** `auth.uid() = employer_id` (Employer Owner).
- **`candidates`:** Employer owner via `hiring_runs.employer_id` OR candidate self via `candidate_id = auth.uid()` / `user_id = auth.uid()`.
- **`screening_sessions`:** Candidate self OR recruiter owner OR verified valid invitation token bearer.
- **`screening_answers` / `screening_summaries`:** Linked `screening_sessions` owner or employer owner.
- **`activity_events` / `decision_audit_events`:** Read-only for employer owner; system append-only.
- **`scheduled_emails` / `integration_credentials`:** Server-only / worker execution (`USING (false)` for clients).

---

## 7. Security Infrastructure Designs

### A. Invitation Access Model
- Dedicated `screening_invitations` table.
- 256-bit random entropy (`crypto.randomBytes(32)`).
- SHA-256 or HMAC-SHA256 hash storage (`invitation_token_hash`). Plaintext token NEVER stored.
- 7-day TTL (`expires_at`), revocable (`revoked_at`).
- One-time link exchange converts query token into a scoped, HttpOnly, SameSite=Strict session cookie.

### B. Idempotency Model
- Table `idempotency_records` with unique constraint `(employer_id, route_action, idempotency_key_hash)`.
- Database `INSERT ON CONFLICT DO NOTHING`. If `status === 'processing'`, concurrent requests return 409 Conflict.
- Persists response payload for 24-hour TTL.

### C. Decision Audit Model
- `activity_events` remains the session activity feed.
- New `decision_audit_events` table records formal, append-only decision events (`actor_id`, `candidate_id`, `hiring_run_id`, `action`, `before_state`, `after_state`, `reason`).
- PostgreSQL trigger prevents UPDATE or DELETE.

### D. Integration Credentials Storage
- `gmail_refresh_token` migrated out of `profiles` into `integration_credentials`.
- AES-256-GCM server-side envelope encryption.
- Client PostgREST access blocked via `USING (false)`.

---

## 8. Implementation Batches & Technical Risk Assessment

1. **Batch 1 (Baseline & Staging Setup):** Low Risk.
2. **Batch 2 (RLS Negative Test Suite):** Low Risk.
3. **Batch 3 (RLS Remediation Migrations D1-D4):** Medium Risk (Restricts previously open tables).
4. **Batch 4 (Server Authorization Helpers):** Medium Risk.
5. **Batch 5 (Employer Packet Routes Migration):** Medium Risk.
6. **Batch 6 (Candidate Proof & Status Routes Migration):** Medium Risk.
7. **Batch 7 (Candidate Screening Invitation Routes Migration):** High Risk (New invitation token flow).
8. **Batch 8 (Idempotency & Audit Integration):** Medium Risk.
9. **Batch 9 (OAuth Staging Configuration):** Low Risk (Identity entry only).
10. **Batch 10 (Authenticated Browser UAT):** Low Risk (Synthetic testing).

---

## 9. Founder Review Request

Step 4B5.2-D staging architecture, schema adoption plan, and ordered security migration package design are complete. Request founder review and approval.
