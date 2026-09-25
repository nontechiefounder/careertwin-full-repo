# Implementation status

## Implemented in this checkpoint

- Backend-only repository structure. No frontend files were generated.
- Immutable Pydantic domain contracts.
- Deterministic scoring and must-have/disqualifier gates.
- Explicit workflow state machine with optimistic versions and two human gates.
- Development API routes and a fail-closed production authentication boundary.
- Celery configuration and stage task contract.
- PostgreSQL + pgvector models and explicit Alembic migrations.
- Tenant RLS policies and append-only audit enforcement.
- Evidence ontology 0.1.0 and scoring rubric 0.1.0.
- Typed AI outputs and prompt-injection/protected-feature policies.
- Docker Compose topology for local infrastructure.
- Synthetic golden corpus and core automated tests.
- Reproducible PDF, DOCX and CSV ingestion fixtures plus expected outcomes.
- Configuration generation and structural validation without secret disclosure.
- Migrated Gemini structured-output adapter to `client.models.generate_content(...)` using cleaned OpenAPI schemas (UAT Verification: Partial Pass).
- Interactive `/docs`, `/redoc` and `/openapi.json` browser testing surfaces.
- Gemini user-acceptance JSON fixtures and a manual verification guide.
- Release Candidate C1.2-C1 Tenant Security + Multi-Span Evidence Integrity Correction Verified 100% GREEN (STATE A ACCEPTED).



## Gemini AI Adapter Verification (UAT Verdict)

A live acceptance test run of the modified `Client.models.generate_content` adapter was performed against the Gemini API using synthetic data. The layer has been classified as a **Partial Fail** (Degraded baseline) because task-specific model routing fell back to `gemini-2.5-flash` under developer key limitations. 

### Gemini Modes Configuration
1. **Strict-Routing Mode (`GEMINI_ALLOW_MODEL_FALLBACK=false`)**
   * Releases and final acceptance mode.
   * Every task must use its configured model (`gemini-2.5-pro` for decomposer/match, `gemini-2.5-flash-lite` for probe writer).
   * Startup or execution fails closed immediately if configured models are unavailable.
2. **Degraded-Development Mode (`GEMINI_ALLOW_MODEL_FALLBACK=true`)**
   * Development pipeline validation mode.
   * Falls back to `gemini-2.5-flash` only for confirmed model-unavailability (404) or permission (403) failures.
   * Never falls back after invalid JSON, schema validation failure, rate limits, timeouts, or safety rejection.

### Semantic Invariants Verified (100% Pass in Degraded Mode)
* **`role_decomposer`:** Proposed weights are normalized to exactly 1.0 (excluding disqualifiers) and assigned meaningful relative values instead of default 1.0.
* **`evidence_extractor`:** Positive resume fixture successfully extracts concrete claims instead of rejecting statements.
* **`match_analyst`:** No schema or 502 failures occur.
* **`risk_analyst`:** Timeline/date gaps are evaluated against a dynamically supplied `evaluation_date` in context.
* **`probe_writer`:** Generated probe evidence IDs are strictly verified against input evidence context, preventing hallucinated or requirement IDs in probe `evidence_ids`.
* **Adversarial injection:** Prompt injection attempts are detected, ignored, and isolated to `rejected_uncited_statements`.
* **No Autonomous Decisions:** Prompts strictly forbid recommending or making final hiring/rejection decisions.

Detailed repeatability run metrics are saved in `scripts/live_repeatability_report.md`.

---

## Subsequent Backend-First Build Order

Proceeding backend-first, development will follow this order:

1. **PostgreSQL Repositories and Tenancy**
   * Replace in-memory repositories.
   * Establish transaction-level organization context.
   * Verify Postgres RLS policies.
   * Implement durable role, candidate, evidence, and workflow records.
2. **Secure Local Ingestion**
   * Implement MinIO quarantine bucket.
   * Connect ClamAV scanning workers.
   * Implement accept/reject state transitions and append-only audit logs.
3. **Document Processing**
   * Connect Docling for local PDF/DOCX parsing.
   * Generate text chunks, page/document coordinates, and immutable SHA-256 evidence hashes.
4. **Durable Worker Orchestration**
   * Connect Celery stages to ingestion and Gemini tasks.
   * Implement idempotency, retry rules, restart recovery, and persist model-run metadata.
5. **Evidence Graph and Deterministic Matching**
   * Persist claims, evidence edges, requirement matches, risks, confidence, and scoring explanations.
   * Gemini proposes structured data; deterministic code calculates scores and evaluates gates.
6. **Candidate Trust Packet API**
   * Expose Role Fit, Proof Strength, Missing Evidence, Risk Signals, Claim-to-Proof Map, Interview Probes, and Recommended Next Step.
   * Stream workflow progress via Server-Sent Events (SSE).
7. **Frontend Integration Later**
   * Connect the existing frontend through stable OpenAPI contracts. No frontend mockup work is needed.

