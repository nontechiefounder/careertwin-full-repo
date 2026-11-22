# Product Requirements & Scope Boundary (`PRD.md`)

**v5 review candidate — local engineering review only.** This is a delta from the v4 Parth archive, not a clean checkout of its base commit. The v4 guarded run and production-build counts below are historical, not v5 executions. Current evidence and remaining gates: [v5 review record](../../V5_REVIEW.md).

**Lifecycle Status:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`

---

## 1. Implemented V3 Core Scope (In Scope)

1. **Employer Role Calibration & Contract Approval:**
   - Employers create hiring runs, define must-have/nice-to-have/disqualifier criteria, and approve versioned rubric contracts (`/employer/brief/[id]`, `/api/employer/brief/[id]/approve`).
   - Rubric edits invalidate prior approvals (`contract_approved: false`, `rubric_approved: false`, `contract_status: 'pending_reapproval'`) and archive `version_history`.
2. **Candidate Document Upload, Extraction & Trust Packet Evaluation:**
   - Employers upload candidate PDFs (`/api/employer/candidate-documents/upload`), stored in private bucket `candidate_resumes` with SHA-256 hashing.
   - `evidenceExtractor.js` extracts matched claims with word-boundary and negation/polarity rules; ordinary PDFs stay `INFERRED` without external server-attested provenance.
   - `packages/proof-engine` evaluates deterministic `calculation_digest`, `verified_proof_score`, `assertion_alignment_score`, and `fit_score` (preserving intentional `null` without fallback).
3. **Human Review & Concurrency-Safe Decisions:**
   - Employers record `Advance`, `Hold`, or `Reject` decisions via transactional PostgreSQL RPCs (`record_human_decision_transactional`, `record_pre_evaluation_decision_transactional`) with `FOR UPDATE` locking and `activity_events` audit logs.
4. **Candidate Screening Sessions:**
   - Candidates (or authorized employer writers `owner`, `admin`, `recruiter`, `hiring_manager`) complete screening sessions via `complete_screening_session_transactional`, enforcing `[0.0, 1.0]` score bounds and idempotent replay.
5. **Company Context Ingestion & Grounded Employer Chat:**
   - Company context sources ingest into PostgreSQL (`context_source_objects`, `context_source_versions`, `context_parsed_artifacts`, `context_evidence_spans`) via the Python Context Engine.
   - Employer chat preserves authorization/mapping denials, preserves exact `context_status`, and validates answers via `chatGrounding.js` (withholding unsupported claims via `grounded_abstention`).
6. **Sourcing & Integrations (Gated):**
   - DataVertex sourcing gated by transactional credit ledger (`datavertex_credit_ledger` RPCs).
   - Ashby import supports explicit modes with `synthetic_sandbox` blocked in production.
   - Email scheduling/sending gated by `CAREERTWIN_DRY_RUN_EMAIL=true` during verification.

---

## 2. Explicit Track 2 / Out-of-Scope Items (Untouched)

- **Shortlist Ranking Policy:** `GET /api/employer/sourcing/shortlist` and `/employer/shortlist/[roleId]` remain ordered by `created_at desc`; ranking/scoring policy changes require Founder Decision.
- **Additional Upload Formats:** Candidate document uploads remain PDF-only; `.docx` parsing in Python lacks `python-docx` locally.
- **Automated External Provenance Connectors:** GitHub/repo/work-artifact automated corroboration connectors belong to Track 2.
- **Core Scoring Weight / Calibration Changes:** Formula weights and corroboration thresholds remain untouched pending Founder Decision.
