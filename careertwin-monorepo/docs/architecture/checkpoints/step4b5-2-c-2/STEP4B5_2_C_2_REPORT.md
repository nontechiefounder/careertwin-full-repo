# Step 4B5.2-C.2 Report (Three-Way Schema & API Contract Reconciliation)

**Date:** August 3, 2026  
**Task:** Read-Only Three-Way Reconciliation of Hosted Supabase Schema, Next.js API Handlers, and Alembic Baseline  
**Status:** COMPLETED — Comprehensive architectural reconciliation establishing the 11-table hosted Supabase database as the operational baseline. Zero production source code modified, zero database writes executed.

---

## 1. Executive Summary

Step 4B5.2-C.2 executed an authoritative read-only three-way reconciliation comparing:
1. **The Hosted Supabase Schema Representation (Operational Baseline):** 11 active database tables (`profiles`, `candidate_profiles`, `proof_profiles`, `hiring_runs`, `sourcing_sessions`, `candidates`, `screening_sessions`, `screening_answers`, `screening_summaries`, `activity_events`, `scheduled_emails`).
2. **Current Next.js API Handlers:** 28 route-handler files and 30 HTTP method handlers (`apps/web/app/api/`).
3. **The Alembic Baseline:** 17 evidence & trust tables (`0001_initial_schema.py`, `0002_tenant_rls_and_audit.py`), serving as future domain-model references.

This reconciliation confirms that **all candidate screening tables (`screening_sessions`, `screening_answers`, `screening_summaries`) exist in the hosted Supabase database**, resolving previous schema ambiguity and confirming that candidate screening API handlers (Batch B5.2.3) map directly to active hosted tables.

---

## 2. Baseline Verification

- **Branch:** `antigravity/step4b2-frontend-parity`
- **HEAD Commit:** `2c74bdf` (`docs(security): verify migration and API contract compatibility`)
- **Working Tree:** Clean
- **Git Remote:** None
- **Package Manifest Hashes:** `package.json` and `package-lock.json` match baseline SHA256
- **In-Memory Credential Scan:** 0 documentation matches, 0 test-source matches
- **ESLint Output:** 0 errors, 3 image warnings remaining (W07, W08, W09 — all `@next/next/no-img-element`)
- **Vitest Test Suite:** 15 test files, 158 / 158 tests passed (100% green)
- **Next.js Production Build:** Exit code 0 (21 page routes, 28 API route files, 30 HTTP method handlers)

---

## 3. Operational Hosted Supabase Baseline Inventory (11 Tables)

| Hosted Supabase Table | Primary Key | Key Foreign Keys & Attributes | RLS Policy & Ownership Status | Next.js API Route Handler Mapping |
|---|---|---|---|---|
| `profiles` | `id UUID` | `email`, `full_name`, `role`, `created_at` | `auth.uid() = id` (User Self) | `GET /api/auth/me`, `/api/candidate/profile` |
| `candidate_profiles` | `id UUID` | `user_id FK(profiles)`, `headline`, `skills`, `resume_url` | Broad `SELECT`/`INSERT` (Requires tightening) | `GET/POST /api/candidate/profile` |
| `proof_profiles` | `id UUID` | `candidate_id FK`, `proof_data JSONB`, `synthesized_at` | `auth.uid() = candidate_profiles.id` | `GET/POST /api/candidate/proof-profile/[candidateId]` |
| `hiring_runs` | `id UUID` | `employer_id FK(profiles)`, `role_title`, `status`, `created_at` | `employer_id` ownership (Needs strict `WITH CHECK`) | `GET/POST /api/employer/hiring-runs`, `shortlist` |
| `sourcing_sessions` | `id UUID` | `employer_id FK(profiles)`, `search_params JSONB`, `created_at` | `employer_id` ownership (Needs strict `WITH CHECK`) | `GET/POST /api/employer/sourcing-sessions` |
| `candidates` | `id UUID` | `hiring_run_id FK`, `candidate_id FK(profiles)`, `status`, `notes` | **`USING true / WITH CHECK true` (CRITICAL LEAK)** | `GET /api/candidate/status/[candidateId]`, `packets` |
| `screening_sessions` | `id UUID` | `candidate_id FK`, `hiring_run_id FK`, `status`, `started_at` | `candidate_id` ownership (Needs invitation tokens) | `GET/POST /api/candidate/screening-sessions/[sessionId]` |
| `screening_answers` | `id UUID` | `session_id FK`, `question_id`, `answer_text`, `created_at` | `session_id` ownership (Needs invitation tokens) | `POST /api/candidate/screening-sessions/[sessionId]/answer` |
| `screening_summaries` | `id UUID` | `session_id FK`, `candidate_id FK`, `summary_json`, `score` | `session_id` / employer view | `POST /api/candidate/screening-sessions/[sessionId]/complete` |
| `activity_events` | `id UUID` | `actor_id FK`, `action`, `entity_type`, `entity_id`, `metadata` | Employer/Admin read-only (Needs write integration) | Employer decision logging (Unintegrated in POST action) |
| `scheduled_emails` | `id UUID` | `recipient_email`, `template_id`, `payload JSONB`, `sent_at` | System internal queue | Email notification background worker |

---

## 4. Three-Way Reconciliation Analysis

### A. Hosted Supabase Schema vs Next.js API Handlers
- **Screening Endpoints (Batch B5.2.3):** `/api/candidate/screening-sessions/[sessionId]` (GET, start, answer, complete) map **directly** to hosted `screening_sessions`, `screening_answers`, and `screening_summaries` tables.
- **Candidate Ownership Endpoints (Batch B5.2.2):** `/api/candidate/status/[candidateId]` and `/proof-profile/[candidateId]` map to `candidates`, `candidate_profiles`, and `proof_profiles`. Ownership can be derived via `auth.uid() = candidate_profiles.id` and `candidates.candidate_id`.
- **Employer Endpoints (Batch B5.2.1):** `/api/employer/packets/[extractionId]` (GET, generate, action) map to `candidates`, `hiring_runs`, and `proof_profiles`. `extractionId` filters `candidates.id`.

### B. Hosted Supabase Schema vs Alembic Baseline
- The Alembic migration files (`0001_initial_schema.py`, `0002_tenant_rls_and_audit.py`) define formal evidence graph entities (`evidence_refs`, `claims`, `claim_edges`, `requirement_matches`, `trust_packets`, `model_runs`, `audit_events`).
- **Role:** Alembic structures serve as **future domain-model specifications** for fine-grained evidence provenance and immutable Trust Packets, but are not currently deployed in the operational Supabase environment.

---

## 5. Critical Vulnerabilities & Additive Gap Inventory

1. **Overly Permissive Candidate RLS Policy (CRITICAL):** Hosted `candidates` table currently has `USING true` and `WITH CHECK true` policies, allowing any authenticated user to view or modify candidate records across tenants. Must be restricted to employer owner and candidate self.
2. **Broad Candidate Profile Access:** `candidate_profiles` allows broad `SELECT` and `INSERT` access to authenticated users without validating user ID matching.
3. **Missing Invitation Token Fields:** `screening_sessions` lacks `invitation_token_hash`, `expires_at`, `revoked_at` fields needed for invitation-based access control.
4. **Missing Multi-Tenant Organization Structure:** `organizations` and `organization_memberships` tables are absent from the hosted schema; ownership relies on individual `employer_id` user UUIDs.
5. **Missing Durable Idempotency Storage:** `idempotency_records` table is absent, leaving `POST .../packets/[extractionId]/generate` and `action` vulnerable to duplicate execution.
6. **Unintegrated Decision Audit Logging:** `activity_events` exists in hosted Supabase, but Next.js API route handlers (`POST .../action`) do NOT write audit events during decision status updates.
7. **Gmail Refresh Token Security:** Integration refresh tokens in `profiles` require server-only encrypted storage.

---

## 6. Founder Review Request

Three-way reconciliation of the hosted Supabase schema, Next.js API contracts, and Alembic baseline is complete. Request founder review and approval.
