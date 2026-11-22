# Step 4B5.2-C.2.1 Report (Corrected Hosted Supabase Schema Representation & Reconciliation)

**Date:** August 3, 2026  
**Task:** Read-Only Correction of Hosted Schema Inventory, Relationships, RLS Evidence, and Route Mappings  
**Status:** COMPLETED — Evidence-grounded documentation correction reflecting the literal 11-table hosted Supabase schema representation (`SCHEMA.md` and schema diagram). Zero production source code modified, zero database connections made.

---

## 1. Executive Summary

Step 4B5.2-C.2.1 performed a strict, evidence-grounded correction of the hosted Supabase database reconciliation. Using literal evidence from `SCHEMA.md` and the supplied hosted schema diagram, this report corrects previous field assumptions, explicitly classifies relationship evidence levels, and inventories confirmed RLS vulnerabilities versus unevidenced policy areas.

The analysis confirms **Readiness Decision B: Tables match current APIs, but authorization and RLS remediation are required first.** The 11 hosted application tables provide direct coverage for Next.js API handlers (including candidate screening sessions), but critical RLS vulnerabilities (such as `candidates` `USING true / WITH CHECK true`) and missing authorization infrastructure (invitation tokens, organization memberships, idempotency) must be remediated prior to route migration.

---

## 2. Baseline Verification

- **Branch:** `antigravity/step4b2-frontend-parity`
- **HEAD Commit:** `bd0d37b` (`docs(security): perform three-way schema and API reconciliation`)
- **Working Tree:** Clean
- **Git Remote:** None
- **Package Manifest Hashes:** `package.json` and `package-lock.json` match baseline SHA256
- **In-Memory Credential Scan:** 0 documentation matches, 0 test-source matches
- **ESLint Output:** 0 errors, 3 image warnings remaining (W07, W08, W09 — all `@next/next/no-img-element`)
- **Vitest Test Suite:** 15 test files, 158 / 158 tests passed (100% green)
- **Next.js Production Build:** Exit code 0 (21 page routes, 28 API route files, 30 HTTP method handlers)

---

## 3. Literal 11-Table Hosted Schema Inventory

*(Directly transcribed from `SCHEMA.md`; no Alembic or UI-inferred fields added)*

| Table Name | Exact Documented Fields | Key Constraints & Attributes | Primary Evidence Source |
|---|---|---|---|
| `profiles` | `id`, `email`, `full_name`, `role`, `created_at`, `gmail_refresh_token` | `id` PK; `gmail_refresh_token` requires server-only protection | `SCHEMA.md` |
| `candidate_profiles` | `id`, `created_at` | `id` PK; candidate self-identity uses `candidate_profiles.id = auth.uid()` | `SCHEMA.md` |
| `proof_profiles` | `id`, `candidate_id`, `created_at` | `id` PK; `candidate_id` FK reference to candidate identity | `SCHEMA.md` |
| `hiring_runs` | `id`, `employer_id`, `role_title`, `status`, `created_at` | `id` PK; `employer_id` FK reference to `profiles.id` | `SCHEMA.md` |
| `sourcing_sessions` | `id`, `employer_id`, `status`, `created_at` | `id` PK; `employer_id` FK reference to `profiles.id` | `SCHEMA.md` |
| `candidates` | `id`, `hiring_run_id`, `candidate_id`, `status`, `created_at` | `id` PK; `hiring_run_id` FK, `candidate_id` FK | `SCHEMA.md` |
| `screening_sessions` | `id`, `candidate_id`, `hiring_run_id`, `status`, `started_at`, `completed_at` | `id` PK; `candidate_id` FK, `hiring_run_id` FK | `SCHEMA.md` |
| `screening_answers` | `id`, `session_id`, `question_index`, `answer_text`, `created_at` | `id` PK; `session_id` FK; uses `question_index` (not `question_id`) | `SCHEMA.md` |
| `screening_summaries` | `id`, `session_id`, `summary_text`, `technical_score`, `communication_score`, `created_at` | `id` PK; `session_id` FK; documents `summary_text`, scores | `SCHEMA.md` |
| `activity_events` | `id`, `session_id`, `event_type`, `title`, `description`, `timestamp` | `id` PK; `session_id` FK; operational event feed | `SCHEMA.md` |
| `scheduled_emails` | `id`, `employer_id`, `candidate_id`, `sequence_day`, `scheduled_for`, `subject`, `body`, `status`, `created_at`, `error_details`, `sent_at` | `id` PK; `employer_id` FK, `candidate_id` FK | `SCHEMA.md` |

---

## 4. Relationship Evidence Classifications

| Relationship Path | Evidence Level | Rationale & Evidence Source |
|---|---|---|
| `auth.users.id` -> `profiles.id` | `CONFIRMED_IN_SCHEMA_TEXT` | Documented self-access policy `auth.uid() = id` in `SCHEMA.md`. |
| `auth.users.id` -> `hiring_runs.employer_id` | `VISUALLY_INDICATED_IN_DIAGRAM` | Relationship line in schema diagram; `employer_id` policy expression. |
| `candidate_profiles.id` -> `candidates.candidate_id` | `VISUALLY_INDICATED_IN_DIAGRAM` | Diagram relationship line; API queries filter candidate profile identity. |
| `candidate_profiles.id` -> `proof_profiles.candidate_id` | `VISUALLY_INDICATED_IN_DIAGRAM` | Diagram relationship line; proof profile lookup by candidate ID. |
| `candidate_profiles.id` -> `screening_sessions.candidate_id` | `VISUALLY_INDICATED_IN_DIAGRAM` | Diagram relationship line; screening session lookup by candidate ID. |
| `hiring_runs.id` -> `candidates.hiring_run_id` | `VISUALLY_INDICATED_IN_DIAGRAM` | Diagram relationship line; candidate list filtering by hiring run ID. |
| `hiring_runs.id` -> `screening_sessions.hiring_run_id` | `VISUALLY_INDICATED_IN_DIAGRAM` | Diagram relationship line; screening session context. |
| `screening_sessions.id` -> `screening_answers.session_id` | `VISUALLY_INDICATED_IN_DIAGRAM` | Diagram relationship line; Q&A lookup by session ID. |
| `screening_sessions.id` -> `screening_summaries.session_id` | `VISUALLY_INDICATED_IN_DIAGRAM` | Diagram relationship line; summary lookup by session ID. |

---

## 5. Exact RLS Policy Inventory & Security Findings

### A. Documented RLS Policies (Primary Evidence from `SCHEMA.md`)
1. **`candidates` (CRITICAL VULNERABILITY):** Authenticated ALL policy uses `USING true` and `WITH CHECK true`. *Confirmed vulnerability — permits arbitrary cross-tenant access to candidate records.*
2. **`candidate_profiles` (HIGH RISK):** Authenticated `SELECT` and `INSERT` policies use broad expressions (`true`). *Confirmed vulnerability — permits unchecked candidate profile reads/writes.*
3. **`profiles` (SECURE):** Self-access policy `auth.uid() = id`. *Confirmed self-access policy.*
4. **`hiring_runs` (EMPLOYER OWNERSHIP):** `employer_id`-based ownership expression `auth.uid() = employer_id`. *Requires exact `WITH CHECK` verification.*
5. **`sourcing_sessions` (EMPLOYER OWNERSHIP):** `employer_id`-based ownership expression `auth.uid() = employer_id`.

### B. Unverified RLS Policy Areas
- **Tables Marked `RLS/POLICY STATUS UNKNOWN FROM SUPPLIED REPRESENTATION`:** `proof_profiles`, `screening_sessions`, `screening_answers`, `screening_summaries`, `activity_events`, `scheduled_emails`. No RLS policies are explicitly documented for these tables in `SCHEMA.md`.

---

## 6. Ten-Handler Compatibility Matrix

*(Covering 28 API route-handler paths and 30 HTTP method handlers)*

| # | Route Path & HTTP Method | Current Query Target | Filter & Writes | Compatibility Classification | Direct Evidence & Rationale |
|---|---|---|---|---|---|
| 1 | `GET /api/candidate/status/[candidateId]` | `candidates` | `id = candidateId` | `MISSING_SCHEMA`, `RLS_CRITICAL` | `candidates` table lacks owner link; RLS uses `USING true`. |
| 2 | `GET /api/candidate/proof-profile/[candidateId]` | `proof_profiles` | `candidate_id = candidateId` | `TABLE_EXISTS_BUT_AUTHORIZATION_MISSING` | Table exists; candidate ownership & RLS status UNKNOWN. |
| 3 | `POST /api/candidate/proof-profile/[candidateId]/generate` | `proof_profiles` | Writes proof profile JSON | `TABLE_EXISTS_BUT_AUTHORIZATION_MISSING`, `REQUIRES_ROUTE_REWRITE` | Writes via candidate contract; requires auth & LLM gate. |
| 4 | `GET /api/candidate/screening-sessions/[sessionId]` | `screening_sessions` | `id = sessionId` | `DIRECT_TABLE_MATCH`, `TABLE_EXISTS_BUT_AUTHORIZATION_MISSING` | Table exists; invitation token fields missing, RLS UNKNOWN. |
| 5 | `POST /api/candidate/screening-sessions/[sessionId]/start` | `screening_sessions` | Updates `status = 'started'` | `DIRECT_TABLE_MATCH`, `TABLE_EXISTS_BUT_AUTHORIZATION_MISSING` | Table exists; needs invitation token verification. |
| 6 | `POST /api/candidate/screening-sessions/[sessionId]/answer` | `screening_answers` | Upserts `question_index` | `FIELD_MISMATCH`, `TABLE_EXISTS_BUT_AUTHORIZATION_MISSING` | Hosted table uses `question_index`, not `question_id`. |
| 7 | `POST /api/candidate/screening-sessions/[sessionId]/complete` | `screening_summaries` | Upserts `summary_text`, scores | `FIELD_MISMATCH`, `TABLE_EXISTS_BUT_AUTHORIZATION_MISSING` | Hosted table uses `summary_text`, `technical_score`, `communication_score`. |
| 8 | `GET /api/employer/packets/[extractionId]` | `candidates` | `id = extractionId` | `FIELD_MISMATCH`, `REQUIRES_ROUTE_REWRITE` | `extractionId` filters `candidates.id`; needs persistence rewrite for packets. |
| 9 | `POST /api/employer/packets/[extractionId]/generate` | `candidates` | Writes candidate packet | `REQUIRES_ROUTE_REWRITE` | Writes through candidate contract; requires persistence rewrite. |
| 10 | `POST /api/employer/packets/[extractionId]/action` | `candidates` | Updates `status` | `REQUIRES_ROUTE_REWRITE_OR_DOMAIN_REDESIGN` | Mutates decision state; needs `activity_events` audit insertion. |

---

## 7. Classifications of Non-Primary Entities

- **`activity_events` (`id`, `session_id`, `event_type`, `title`, `description`, `timestamp`):** Classified as **Session activity feed / operational event history**. It is not currently proven equivalent to Alembic `audit_events` or an immutable decision-level audit system.
- **`scheduled_emails` (`id`, `employer_id`, `candidate_id`, `sequence_day`, `scheduled_for`, `subject`, `body`, `status`, `created_at`, `error_details`, `sent_at`):** Classified as **Email notification queue**. Differs from Alembic `outbox_events` (which uses `topic`, `aggregate_id`, `payload`).
- **Alembic Entities (`evidence_refs`, `claims`, `trust_packets`, `model_runs`, `audit_events`):** Classified as **Future domain-model references ONLY**. They do NOT exist in the currently supplied hosted Supabase schema representation.

---

## 8. Corrected Readiness Decision

**B. Tables match current APIs, but authorization and RLS remediation are required first.**

- **Rationale:** The 11 hosted Supabase tables match the entities consumed by the Next.js API handlers, but route migration remains blocked until critical RLS vulnerabilities (e.g. `candidates` `USING true`) are remediated, invitation-token fields are added, and durable idempotency storage is established.

---

## 9. Founder Review Request

Step 4B5.2-C.2.1 read-only documentation correction is complete. Request founder review and approval.
