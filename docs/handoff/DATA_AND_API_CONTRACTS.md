# Data & API Contracts (`DATA_AND_API_CONTRACTS.md`)

**v5 review candidate — local engineering review only.** This is a delta from the v4 Parth archive, not a clean checkout of its base commit. The v4 guarded run and production-build counts below are historical, not v5 executions. Current evidence and remaining gates: [v5 review record](../../V5_REVIEW.md).

**Lifecycle Status:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`

---

## 1. Operational PostgreSQL Schema & Transactional RPCs

### Core Operational & Tenant Tables (`supabase/migrations/`)
- `profiles`, `candidate_profiles`, `proof_profiles`, `hiring_runs`, `sourcing_sessions`, `candidates`, `screening_sessions`, `screening_answers`, `screening_summaries`, `activity_events`, `scheduled_emails`, `organizations`, `organization_memberships`, `candidate_documents`, `claim_ledgers`.
- Context foundation & retrieval tables: `context_source_objects`, `context_source_versions`, `context_parsed_artifacts`, `context_evidence_spans`, `context_workspace_mappings`.
- Sourcing credit ledger: `datavertex_credit_ledger` (`rls=true`, `postgres`/`service_role` only).

### Authoritative `SECURITY DEFINER` RPCs (`search_path=public, pg_temp`)
1. `allocate_claim_ledger_revision_and_persist`: allocates monotonic `ledger_revision` under `uq_claim_ledgers_cand_run_rev` and persists immutable decision packet + claim edges.
2. `record_human_decision_transactional` & `record_pre_evaluation_decision_transactional`: row-locked (`FOR UPDATE`) CAS decision recording + atomic `activity_events` insert.
3. `complete_screening_session_transactional` (`20260822000001_transactional_screening_completion.sql`): row-locked (`FOR UPDATE`) atomic upsert of `screening_summaries` (`overall_score`, `strengths`, `concerns`, `recommended_next_step`) + `screening_sessions` status update, returning identical structured fields on initial completion and concurrent/idempotent replay.
4. `shortlist_candidate_from_provider_transactional`: enforces active employer membership inside DB and creates candidate shortlist entry with `fit_score: null`.
5. `datavertex_{get_budget_status,reserve_credits,settle_credits,release_credits,mark_uncertain}`: atomic credit reservation and settlement.

---

## 2. Score & Grounding Contracts

### Canonical Score Contract (`apps/web/lib/scoreUtils.js`, `packages/proof-engine/src/index.ts`)
- `fit_score`: canonical `[0, 100]` scale or intentional `null` (`INSUFFICIENT EVIDENCE` / `Unverified (null)`).
- `resolveAuthoritativeFitScore(packet, candidateRow)`: preserves `packet.fit_score === null` when a decision packet exists without falling back to stale `candidateRow.fit_score`.
- `verified_proof_score`: weight earned strictly by corroborated (`VERIFIED`) external evidence.
- `assertion_alignment_score`: unweighted alignment across asserted claims (`INFERRED` + `VERIFIED`).
- `evidence_breakdown`: structured breakdown exported alongside `calculation_digest`.

### Grounded Employer Chat Contract (`apps/web/app/api/employer/chat/route.js`, `apps/web/lib/chatGrounding.js`)
- Request preserves workspace mapping & membership checks (`401` / `403` `UNMAPPED_WORKSPACE` / `MAPPING_REVOKED` / `ACCESS_DENIED`).
- `context_status`: preserves exact engine state (`pending`, `missing`, `lexical_only`, `unprojected`, `disabled`, `unavailable`, etc.) without rewriting into success.
- `response_mode`: `'deterministic_summary' | 'grounded_generation' | 'grounded_abstention'`.
- Document chat selects one eligible authorized span. A verbatim sentence may select its full span; no paraphrase or inferred conclusion is emitted. A successful excerpt has one source/version/span card. Rejection or refusal returns fixed text, no cards and grounding_validated=false. Deterministic summary branches remain separate.

---

## 3. Next.js API Route Surface (`apps/web/app/api/**` — 50 routes)

- **Auth:** `/api/auth/{confirm,me,signin,signup,resend-verification}`, `/api/health`, `/api/search`.
  - `POST /api/auth/signup` returns `delivery_status` (`'sent' | 'suppressed_dry_run' | 'failed' | 'not_attempted'`), `account_created`, `email_sent`, and `retry_supported` (`503 VERIFICATION_EMAIL_DELIVERY_FAILED` on SMTP failure; `500 VERIFICATION_LINK_FAILED` on both returned errors and thrown link exceptions).
  - `POST /api/auth/resend-verification` checks the aggregate directory budget (`MAX_DIRECTORY_CALLS_PER_WINDOW = 50` per `60s`, returning `429 RATE_LIMITED`) before reserving per-email cooldown; `createMemoryCooldownStore({ maxEntries = 2000 })` validates positive integer `maxEntries`, prunes expired keys, and fails closed (`429`) for new keys at capacity without evicting active reservations (`V9-R1`); `findUserByEmail` requires valid bounded numeric `lastPage <= 25` whenever `nextPage !== null` or `users.length === 1000`, failing uniformly (`503 VERIFICATION_LOOKUP_UNAVAILABLE`) before page-1 matching when pagination metadata is missing/invalid/oversized (`V9-R2`). Returns uniform non-enumerating `200` `{ delivery_status: 'accepted', message }` across absent, confirmed, dry-run, unconfirmed-sent, and unconfirmed-delivery/link-failure branches. Multi-instance hosting requires configuring an approved shared cooldown + budget store.
- **Candidate:** `/api/candidate/profile`, `/api/candidate/status/[candidateId]`, `/api/candidate/proof-profile/[candidateId]` (`POST /generate`), `/api/candidate/screening-sessions/[sessionId]` (`POST /start`, `POST /answer`, `POST /complete`).
  - `POST /api/candidate/screening-sessions/[sessionId]/complete` fails closed on `screening_answers` read/malformed errors (`503 SCREENING_ANSWERS_UNAVAILABLE` / `422 SCREENING_ANSWERS_INVALID`) and empty answers (`422 INSUFFICIENT_SCREENING_ANSWERS`) before generation or RPC writes; when at least one valid non-empty answer row is present, blank/non-string rows are filtered out (`V6-C1`).
- **Employer Briefs & Packets:** `/api/employer/hiring-runs` (`POST /suggest`), `/api/employer/brief/[id]` (`POST /approve`), `/api/employer/candidate-documents/upload`, `/api/employer/candidate-documents/[documentId]/download`, `/api/employer/packets/[extractionId]` (`POST /generate`, `POST /action`), `/api/employer/shortlist/[roleId]`.
- **Employer Context & Chat:** `/api/employer/chat`, `/api/employer/research-qa`, `/api/employer/context-sources` (`POST /upload`, `POST /ask`, `GET /search`, `GET /related`, `[sourceId]`, `[sourceId]/evidence`, `[sourceId]/retry`).
- **Employer Sourcing & Orgs:** `/api/employer/sourcing-sessions` (`[id]`, `[id]/auto-source`), `/api/employer/sourcing/{account,lookup,search,shortlist}`, `/api/employer/organizations` (`POST /invite`, `POST /accept-invite`), `/api/employer/integrations/ashby`, `/api/employer/analytics`, `/api/employer/screening-sessions`.
- **Decommissioned Legacy Route:** `/api/employer/candidate-extractions` returns `410 Gone`.
- **Gmail OAuth:** `/api/integrations/gmail/{connect,callback}`.

---

## 4. Python Context Engine Contract (`service/memory_api.py`)

- `POST /sources` -> `202` ingestion queued (`source_id`, `version_id`, `state`).
- `POST /context/inspect` / `GET /sources/{id}` -> returns `source_id`, `version_id`, `state`, `spans[].span_id`, `spans[].text`.
- `POST /qa` / `POST /research-qa` -> `200 RETRIEVAL_ONLY_COMPLETE` in retrieval-only mode; `503 LIVE_GENERATION_UNAVAILABLE` when `WORKBYLINE_GENERATION_GATE=false` or generator key absent; `403 SCOPE_MISMATCH` / `404 SOURCE_NOT_FOUND` on tenant/workspace boundary violations.
