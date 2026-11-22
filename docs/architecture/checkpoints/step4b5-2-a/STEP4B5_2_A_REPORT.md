# Step 4B5.2-A Analysis Report (Sensitive API Route Access Models)

**Date:** August 2, 2026  
**Task:** Define Access Models for Every Sensitive Handler Lacking Identity Verification  
**Status:** COMPLETED — Comprehensive read-only architectural analysis of the 10 sensitive API method handlers. Zero production source code modified.

---

## 1. Executive Summary

Step 4B5.2-A performed a complete, read-only security audit of the ten sensitive HTTP method handlers currently operating without server identity verification. Each handler was evaluated against five formal access-model classifications (`ACCOUNT_AUTHENTICATED`, `INVITATION_TOKEN`, `EMPLOYER_ONLY`, `INTERNAL_SERVICE`, `PUBLIC_SYNTHETIC`).

The analysis defined explicit authentication, organization-scoping, and resource-ownership requirements for candidate screening, proof profile, status, and employer decision packet endpoints. Phased migration batches (B5.2.1, B5.2.2, B5.2.3) were established to migrate routes incrementally without downtime or security gaps.

---

## 2. Baseline Verification

- **Branch:** `antigravity/step4b2-frontend-parity`
- **HEAD Commit:** `d48e6f0` (`fix(auth): harden server authentication contract`)
- **Working Tree:** Clean
- **Git Remote:** None
- **Package Manifest Hashes:** `package.json` and `package-lock.json` match baseline SHA256
- **In-Memory Credential Scan:** 0 documentation matches, 0 test-source matches
- **ESLint Output:** 0 errors, 3 image warnings remaining (W07, W08, W09 — all `@next/next/no-img-element`)
- **Vitest Test Suite:** 15 test files, 158 / 158 tests passed (100% green)
- **Next.js Production Build:** Exit code 0 (21 page routes, 28 API handler paths)

---

## 3. Authoritative Inventory of the Ten Sensitive Method Handlers

| # | Route Path | HTTP Method | Current DB Access | Current Provider Access | Current Mutation | Unauthenticated Status |
|---|---|---|---|---|---|---|
| 1 | `/api/candidate/status/[candidateId]` | GET | Reads candidate status | None | None | 200 OK (Fallback) |
| 2 | `/api/candidate/proof-profile/[candidateId]` | GET | Reads proof profile | None | None | 200 OK |
| 3 | `/api/candidate/proof-profile/[candidateId]/generate` | POST | Reads/writes proof profile | Calls LLM (`generateChat`) | Writes proof packet | 200 OK |
| 4 | `/api/candidate/screening-sessions/[sessionId]` | GET | Reads session & Q&A | None | None | 200 OK (Fallback) |
| 5 | `/api/candidate/screening-sessions/[sessionId]/start` | POST | Updates session status | None | Sets `started_at` | 200 OK (Fallback) |
| 6 | `/api/candidate/screening-sessions/[sessionId]/answer` | POST | Upserts screening answer | None | Writes candidate answer | 200 OK (Fallback) |
| 7 | `/api/candidate/screening-sessions/[sessionId]/complete` | POST | Reads session/Q&A, writes summary | Calls LLM (`generateChat`) | Writes summary, sets `completed_at` | 404 / 200 OK |
| 8 | `/api/employer/packets/[extractionId]` | GET | Reads candidate packet | None | None | 200 OK (Fallback) |
| 9 | `/api/employer/packets/[extractionId]/generate` | POST | Reads candidate/run, writes packet | Calls LLM (`generateChat`) | Mutates decision packet (Service Role) | 200 OK / 500 |
| 10 | `/api/employer/packets/[extractionId]/action` | POST | Reads candidate, updates status | Optional Email Trigger | Mutates reviewer action/status | 200 OK / 500 |

---

## 4. Candidate Access Model & Scoped Invitation-Token Architecture

Candidate workflows must be split cleanly by access requirements:

### A. Candidate Account Endpoints (`ACCOUNT_AUTHENTICATED`)
- **Endpoints:** `/api/candidate/status/[candidateId]`, `/api/candidate/proof-profile/[candidateId]`
- **Access Requirement:** Valid candidate account session via `authenticateServerRequest(request)`. The authenticated `userId` must match `candidates.user_id`.

### B. Scoped Screening Endpoints (`INVITATION_TOKEN`)
- **Endpoints:** `/api/candidate/screening-sessions/[sessionId]`, `.../start`, `.../answer`, `.../complete`
- **Invitation-Token Specification:**
  - **Storage:** Stored as SHA-256 hash in database (`screening_sessions.invitation_token_hash`), never plaintext.
  - **Scope:** Bounded to exactly one `candidate_id`, one `hiring_run_id`, and one `session_id`.
  - **Expiry:** 7-day default expiration timestamp (`expires_at`).
  - **Revocation:** Instantly revocable by recruiter (`session_status: 'revoked'`).
  - **Lifecycle Bounding:** Session transitions (`not_started` -> `started` -> `completed`). Completed sessions reject further answer upserts.
  - **Isolation Invariant:** URL parameters alone grant ZERO access. Invitation token grants ZERO organization management access or cross-candidate access.

---

## 5. Employer Access Model & Resource Ownership Architecture

### Employer Endpoints (`EMPLOYER_ONLY`)
- **Endpoints:** `/api/employer/packets/[extractionId]`, `.../generate`, `.../action`
- **Access Requirements:**
  1. **Verified Identity:** User must present valid token via `authenticateServerRequest(request)`.
  2. **Organization Membership:** User ID must belong to an active organization membership record (`organization_memberships.user_id === userId`).
  3. **Resource Ownership:** `hiring_runs.org_id === user.org_id` (or `hiring_runs.employer_id === userId`).
- **Provider-Cost & Service-Role Gating:**
  - `POST packets/[extractionId]/generate` invokes LLM generation (`generateChat`), incurring API costs. Identity verification and org authorization MUST execute BEFORE calling the provider.
  - Service-role database client (`useServiceRole: true`) can ONLY be instantiated AFTER user identity, org membership, and resource ownership are verified.
  - `Idempotency-Key` headers required for generate and action POST endpoints.

---

## 6. Route-by-Route Access Model Matrix

| Route Path | Method | Access Model | Intended 401 | Intended 403 | Intended 404 | Execution Gate |
|---|---|---|---|---|---|---|
| `/api/candidate/status/[candidateId]` | GET | `ACCOUNT_AUTHENTICATED` | Missing/invalid user session | Session user != candidate | Candidate ID not found | Auth before DB query |
| `/api/candidate/proof-profile/[candidateId]` | GET | `ACCOUNT_AUTHENTICATED` | Missing/invalid user session | Session user != candidate | Candidate ID not found | Auth before DB query |
| `/api/candidate/proof-profile/[candidateId]/generate` | POST | `ACCOUNT_AUTHENTICATED` | Missing/invalid user session | Session user != candidate | Candidate ID not found | Auth before LLM call |
| `/api/candidate/screening-sessions/[sessionId]` | GET | `INVITATION_TOKEN` | Missing/expired/revoked token | Token mismatch for session | Session ID not found | Auth before DB query |
| `/api/candidate/screening-sessions/[sessionId]/start` | POST | `INVITATION_TOKEN` | Missing/expired/revoked token | Token mismatch for session | Session ID not found | Auth before DB update |
| `/api/candidate/screening-sessions/[sessionId]/answer` | POST | `INVITATION_TOKEN` | Missing/expired/revoked token | Session completed / mismatch | Session ID not found | Auth before DB upsert |
| `/api/candidate/screening-sessions/[sessionId]/complete` | POST | `INVITATION_TOKEN` | Missing/expired/revoked token | Session completed / mismatch | Session ID not found | Auth before LLM call |
| `/api/employer/packets/[extractionId]` | GET | `EMPLOYER_ONLY` | Missing/invalid user session | User not in org / not owner | Packet ID not found | Auth before DB query |
| `/api/employer/packets/[extractionId]/generate` | POST | `EMPLOYER_ONLY` | Missing/invalid user session | User not in org / not owner | Packet ID not found | Auth before LLM / SR DB |
| `/api/employer/packets/[extractionId]/action` | POST | `EMPLOYER_ONLY` | Missing/invalid user session | User not in org / not owner | Packet ID not found | Auth before DB update |

---

## 7. Recommended Migration Batches

1. **Batch B5.2.1 (Highest Risk Employer & Provider Routes):**
   - `POST /api/employer/packets/[extractionId]/generate`
   - `POST /api/employer/packets/[extractionId]/action`
   - `GET /api/employer/packets/[extractionId]`
2. **Batch B5.2.2 (Candidate Proof & Status Routes):**
   - `POST /api/candidate/proof-profile/[candidateId]/generate`
   - `GET /api/candidate/proof-profile/[candidateId]`
   - `GET /api/candidate/status/[candidateId]`
3. **Batch B5.2.3 (Candidate Screening Invitation-Token Routes):**
   - `GET /api/candidate/screening-sessions/[sessionId]`
   - `POST /api/candidate/screening-sessions/[sessionId]/start`
   - `POST /api/candidate/screening-sessions/[sessionId]/answer`
   - `POST /api/candidate/screening-sessions/[sessionId]/complete`

---

## 8. OAuth & Provider Boundary Invariant

- **OAuth & Auth Providers (Google, LinkedIn, Supabase Auth):** Are identity-entry mechanisms ONLY.
- **Strict Boundary:** Successful OAuth authentication establishes `who the user is` (`userId`, `email`), but MUST NEVER directly grant:
  - Employer or candidate roles
  - Organization membership
  - Screening session access
  - Record ownership
- All authorization decisions must be evaluated against server-managed database tables (`organization_memberships`, `invitation_tokens`, `hiring_runs`).

---

## 9. Founder Review Request

Step 4B5.2-A access-model classifications, candidate invitation-token specification, employer ownership gating, and route matrix are complete. Request founder review and approval.
