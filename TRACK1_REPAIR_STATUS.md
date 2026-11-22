# Track 1 Integrity & V3 Independent Review Repair Status

**v5 review candidate — local engineering review only.** This is a delta from the v4 Parth archive, not a clean checkout of its base commit. The v4 guarded run and production-build counts below are historical, not v5 executions. Current evidence and remaining gates: [v5 review record](./V5_REVIEW.md).

Date: 2026-11-19  
Branch: `antigravity/workbyline-v3-candidate`  
Base Commit: `68fb5f443dd20585670ed3f5c5a06ff4e8dc30f1`  
Lifecycle State: **IMPLEMENTED PENDING INDEPENDENT REVIEW (F01–F09, B1–B9)**

## Review Findings Resolution (17 November 2026 Audit)

| Finding | Severity | Description | Repair & Resolution | Status |
|---|---|---|---|---|
| **F01** | **HIGH** | Auditor can reach screening-completion writes in `complete/route.js` | Enforced strict `ALLOWED_EMPLOYER_WRITER_ROLES = ['owner', 'admin', 'recruiter', 'hiring_manager']`. `auditor` and `viewer` receive `403 Forbidden` upfront before any AI calls or writes. Candidate self-completion preserved. | **IMPLEMENTED (PENDING REVIEW)** |
| **F02** | **HIGH** | Employer chat not grounded in document bodies; queried non-existent `context_sources` | Connected `employer/chat/route.js` to authoritative `contextScope` / `contextFetch` client and PostgreSQL context tables (`context_source_objects`, `context_evidence_spans`). Injected actual evidence spans into prompt and filtered sources post-generation so only cited spans are returned. Handled errors with explicit `context_status`. | **IMPLEMENTED (PENDING REVIEW)** |
| **F03** | **HIGH** | Candidate chat keyword-routed templated output with score discrepancy and ungated cards | Aligned score contract via `resolveAuthoritativeFitScore` (`apps/web/lib/scoreUtils.js`) to preserve intentional `decision_packet.fit_score === null` without falling back to stale candidate row scores. Gated source cards strictly on packet presence. Labeled response mode explicitly (`response_mode: 'deterministic_summary' \| 'grounded_generation' \| 'grounded_abstention'`). | **IMPLEMENTED (PENDING REVIEW)** |
| **F04** | **HIGH** | Keyword matching can misstate disqualifiers (early return, substring match, missing word boundaries) | In `evidenceExtractor.js`: removed early `return` on disqualifiers; added word-boundary matching `\b`, negation/polarity detection ("clean record", "no criminal record"), and positive idiom false-positive rejection ("track record"). In tech matching: removed `microservices` as alias of `distributed systems`; added regex word boundaries to prevent substring collisions (e.g., "Django" no longer matches "go"). | **IMPLEMENTED (PENDING REVIEW)** |
| **F05** | **MEDIUM** | Overgeneralized résumé-only null scoring; uncorroborated assertions conflated with verified proof | In `proof-engine/src/index.ts`: distinctly separated `verified_proof_score` (earned strictly by corroborated/verified external evidence) from `assertion_alignment_score` (earned from candidate self-claims). Added structured `evidence_breakdown`. Must-have gates continue requiring VERIFIED proof. | **IMPLEMENTED (PENDING REVIEW)** |
| **F06** | **MEDIUM** | Provider inventory in `ai.js` does not match statements; Claude stubbed | Implemented real Anthropic Messages API (`callClaude`) using `/v1/messages` with structured JSON and tool handling. Documented `WORKBYLINE_AI_PROVIDER` as provider preference by default (`WORKBYLINE_AI_STRICT_PROVIDER=true` for strict restriction) and exported `getProviderInventory()`. | **IMPLEMENTED (PENDING REVIEW)** |
| **F07** | **MEDIUM** | Incomplete screening completion validation; missing bounds check, unstructured feedback, non-atomic | In `complete/route.js`: added finite `[0.0, 1.0]` bounds check on `technical_score` and `communication_score`. Formatted and preserved `strengths`, `concerns`, and `recommended_next_step`. Added idempotency replay for completed sessions and atomic rollback on session completion update failure. | **IMPLEMENTED (PENDING REVIEW)** |
| **F08** | **MEDIUM** | Handoff documentation reconciliation | Reconciled `PARTH_HANDOFF.md`, `TRACK1_REPAIR_STATUS.md`, and `VERIFICATION_EVIDENCE.md` to document the exact dirty-tree changes, test invocations, and machine setup. | **IMPLEMENTED (PENDING REVIEW)** |
| **F09** | **MEDIUM** | Silent swallowing of DB errors in `sourcing-sessions/[id]` and `packets/[extractionId]` | Enforced explicit error handling: returns 500 on candidate fetch error and explicit `events_status: 'unavailable'` / `emails_status: 'unavailable'`. | **IMPLEMENTED (PENDING REVIEW)** |

---

## Status Reconciliation Against Historical Reports

Previous reports, checkpoint logs, and rollout notes created prior to `2026-11-14` that declare `FIXED`, `launch_ready`, `ACCEPTED`, or clean acceptance status for V2/V3 components are **superseded and classified `IMPLEMENTED_UNVERIFIED` (STATE C)** by the adversarial pre-handoff audit and Track 1 source repairs.

Historical logs, audit documents, and `docs/private/**` are preserved verbatim for evidentiary traceability and were **not** altered or overwritten during Track 1 remediation.

## Track 1 Scope Implemented (`IMPLEMENTED_UNVERIFIED`)

1. **B1 — Least-Privilege Grants, Ledger Atomicity & Service-Role Fail-Closed Guard**
   - Forward migration `supabase/migrations/20260820000001_track1_integrity_repairs.sql` revokes all table privileges from `PUBLIC` and `anon` across the 15 operational/tenant tables (`profiles`, `candidate_profiles`, `proof_profiles`, `hiring_runs`, `sourcing_sessions`, `candidates`, `screening_sessions`, `screening_answers`, `screening_summaries`, `activity_events`, `scheduled_emails`, `organizations`, `organization_memberships`, `candidate_documents`, `claim_ledgers`) and enables RLS on each, revokes mutating table privileges from `authenticated` on `claim_ledgers` and `candidate_documents` (`SELECT` only for `authenticated`, `ALL` for `service_role`), adds unique index `uq_claim_ledgers_cand_run_rev`, and locks down SECURITY DEFINER RPCs (`allocate_claim_ledger_revision_and_persist`, `record_human_decision_transactional`, `record_pre_evaluation_decision_transactional`, `shortlist_candidate_from_provider_transactional`) to `service_role` only.
   - `apps/web/lib/supabaseServer.js` fails closed instead of substituting `NEXT_PUBLIC_SUPABASE_ANON_KEY` when service-role access is requested without `SUPABASE_SERVICE_ROLE_KEY`.
   - Direct table-update fallbacks removed from `generate/route.js`, `action/route.js`, `packets/[extractionId]/route.js`, and `sourcing/shortlist/route.js`. Pre-evaluation decisions in `action/route.js` now execute atomically via `record_pre_evaluation_decision_transactional` with `FOR UPDATE`, `candidates.status` CAS, and atomic `activity_events` insert.

2. **B2 & B3 — Claim/Evidence Linkage, Explicit Trusted Provenance & Authoritative Evaluation**
   - `packages/proof-engine` ignores caller `fit_score`, `proof_strength`, `status === 'VERIFIED'`, `evidence_classification === 'corroborated'`, and plain JSON `authorship_verified`/`provenance_verified` overrides; requires server-attested `WeakMap` provenance (`attestTrustedEvidenceProvenance` / `TrustedProvenanceRecord`) plus bounded code/repo provenance (`sha256`, `start_offset <= end_offset`, `excerpt_hash`, explicit `authorship_verified === true && provenance_verified === true`); zero `!== false` gates remain; and separates deterministic `calculation_digest` from execution timestamps (`evaluated_at`).
   - `apps/web/lib/evidenceExtractor.js` requires explicit server-attested `hasTrustedCodeProvenance(candDoc, options)` (`authorship_verified === true && provenance_verified === true`) plus hash/text presence before corroborated status.
   - `apps/web/app/api/employer/packets/[extractionId]/generate/route.js` reads existing `decision_packet`, links `claim_edges` strictly to valid matched evidence IDs (zero index fallback), passes `trustedProvenance` from server extraction, omits pre-RPC `ledger_revision`, and requires the atomic RPC cleanly.
   - `apps/web/app/api/employer/brief/[id]/route.js`, `approve/route.js`, and `generate/route.js` archive prior criteria snapshots into `brief_json.version_history`, bump `contract_version`, invalidate prior approvals (`contract_approved: false`, `rubric_approved: false`, `contract_status: 'pending_reapproval'`), and propagate regenerated criteria versions on re-approval.

3. **B4 & B5 — Bypass Routes, Fabricated Fallbacks & Auth/Context Boundaries**
   - `apps/web/app/api/employer/candidate-extractions/route.js` decommissioned (`410 Gone`).
   - `apps/web/app/api/employer/sourcing-sessions/[id]/auto-source/route.js` verifies active employer write membership before status updates; `apps/web/lib/sourcing/agent.js` invokes `shortlist_candidate_from_provider_transactional` as `'sourced'` with `fit_score: null`.
   - `apps/web/app/api/employer/integrations/ashby/route.js` requires explicit import `mode`, blocks `synthetic_sandbox` in production, and fails closed without active org membership.
   - Removed fabricated catch fallbacks, default scores (`85`, `78`, `84`, `0.85`/`0.80`, `0.1`), hardcoded `"Alpha Corp"` / `"San Francisco"` / `"Verified"` UI labels, `ERR_NETWORK` metadata role escalation (`apps/web/lib/auth.js`), and `DEFAULT_REGISTRY` / hardcoded delegation secret / native fallback (`apps/web/lib/contextClient.js`, `apps/web/lib/engineConfig.js`).

4. **B6 — Verification Test Corrections & Additions (Executed Against Disposable Targets)**
   - Authored test updates across unit, security, transactional/RPC concurrency, provenance, and staging validation suites; retargeted all 8 scenarios in `GoldenReleaseCandidateEvaluations.test.js` to `evaluateCandidateTrustPacket` / `parseProofContract` / `sanitizeProtectedSignals`; authored `apps/web/__tests__/evals/Track1IntegrityRepairs.test.js`, `apps/web/__tests__/v3/V3CloseoutBehavior.test.js`, and `apps/web/__tests__/v3/screeningCompleteBehavior.test.js`.
   - Snapshot privacy notice: `backups/state-c-snapshot-20261114/source_snapshot.tar.gz` and `FILE_SHA256_MANIFEST.txt` include `.env` and `apps/web/.env.local` and MUST remain strictly private/unshared.
   - **Verification Status:** Executed locally against disposable target `supabase_db_wbl-disposable-verify` (`54422`, Run ID `20261119T101535Z_21491`, `PASSED`), PGlite WASM, and mocked Vitest suites (see `VERIFICATION_EVIDENCE.md`). Live external providers and hosted staging remain **NOT VERIFIED / BLOCKED** pending Founder approval. All changes remain **`IMPLEMENTED PENDING INDEPENDENT REVIEW`**.

## Explicit Track 2 Open Product Decisions (Out of Scope / Left Untouched)

- Shortlist ranking/ordering policy (`apps/web/app/api/employer/sourcing/shortlist` & `apps/web/app/employer/shortlist/[roleId]/route.js` ordering remains `created_at desc`).
- Additional upload MIME/parser support (`apps/web/app/api/employer/candidate-documents/upload/route.js` & `apps/web/lib/documentParser.js` remain PDF-only).
- Universal multi-source corroboration thresholds, company-context-to-evaluation integration, Hiring Genome compilation, and governed human learning workflows remain unresolved product decisions requiring separate founder scoping.
