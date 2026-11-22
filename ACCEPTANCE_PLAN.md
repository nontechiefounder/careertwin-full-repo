# WorkByLine V3 Release Candidate — Acceptance Test Plan (Held-Out Evaluation)

> **PHASE NOTICE**: This document defines the formal acceptance testing criteria for the **WorkByLine V3 Release Candidate**. Local persistent-runtime scenarios (8/8 checks, including Check 8 terminal-workflow retry recovery), unit/database test suite (116/116 passed on live PostgreSQL 17), browser acceptance journeys (12/12 gates passed), and backup/restore rehearsals have been executed against isolated disposable local PostgreSQL 17 (`127.0.0.1:54399`), persistent Temporal (`127.0.0.1:7233`), and verified local `BAAI/bge-small-en-v1.5` model weights. Hosted external provider scenarios (Scenario 6 live Graphiti/FalkorDB+Gemini and Scenario 8 live Gemini API generation) remain gated (`CONFIGURED / GATED — NOT EXECUTED`) pending external credentials and founder gate activation.
> 
> Current Candidate Status: **LOCAL PERSISTENT-RUNTIME VERIFIED / HOSTED PROVIDERS GATED (Ready for Founder UAT)**

---

## Evaluation Methodology & Safeguards

1. **Held-Out Evidence**: All acceptance tests must use fresh synthetic documents and newly generated hiring run IDs. Pre-existing benchmark artifacts (`test_cases.json`, historical transcripts) must not be reused as verification proof.
2. **Fail-Closed Verification**: Scenarios require affirmative observable evidence (structured JSON responses, database row states, audit records, or network logs). Silence, timeout, or missing fields are treated as failures.
3. **No Mocks in Real Paths**: Unless an explicit fallback scenario is being evaluated, live subsystems (PostgreSQL, Temporal, BGE embedder, Gemini provider, Graphiti) must run with real configurations.
4. **Safety & Compliance**: All email actions must have `CAREERTWIN_DRY_RUN_EMAIL=true`. The baseline database on port `54332` remains frozen and protected.
5. **Storage & Verification Boundaries**: Private storage uses POSIX permission boundaries (`0o700` directories, `0o600` files) and SHA-256 content verification. Evidence retrieval assists recruiter review and does not constitute automated competence verification or hiring decisions.

---

## Subsystem Completion Criteria

For every ingested document version, three distinct subsystem states are tracked and exposed separately:

1. **Parsing State (`parsing_state`)**:
   - `completed`: All pages contain native digital text and were parsed into spans without exceptions.
   - `partial`: Document was parsed, but some pages or graphical elements did not contain native digital text. Extracted text spans represent all readable pages; physical review of original bytes is indicated.
   - `pending`: Ingestion job is queued or currently being parsed by the Temporal worker.
   - `failed`: Parser encountered an unrecoverable format or structural error (recorded in `wbctx_jobs.error`).

2. **Search Indexing State (`indexing_state`)**:
   - `indexed`: All extracted spans have been embedded with 384-dimensional vectors and stored in `wbctx_span_embeddings` under model `bge-small-en-v1.5`.
   - `lexical_only`: Spans are indexed in PostgreSQL full-text search (`tsvector`), but vector embeddings are skipped because `WORKBYLINE_EMBEDDING_WEIGHTS` is unconfigured.
   - `pending`: Spans are waiting to be processed by `index_evidence_version` activity.
   - `failed`: Embedding generation or pgvector insertion failed (recorded in activity error log).

3. **Graph Projection State (`projection_state`)**:
   - `projected`: Derived entity and temporal relationships projected to Graphiti episode and recorded in `wbctx_projections` with `status='projected'`.
   - `disabled`: Graphiti backend is unconfigured or disabled (`WORKBYLINE_GRAPH_ENABLED=false`); recorded in `wbctx_projections` with `status='disabled'`.
   - `pending`: Projection is queued for processing.
   - `failed`: Graphiti episode creation encountered an error; recorded in `wbctx_projections` with `status='failed'`.

---

## Scenario 1: Same-Filename Separate Candidates (Identity Disambiguation)

- **Objective**: Verify that two different candidates uploading files with identical filenames (e.g., `Resume.pdf`) receive distinct server-owned source identities and remain completely isolated.
- **Prerequisites**:
  - PostgreSQL running with migrations `000`–`007` applied via `scripts/run_forward_migrations.py`.
  - Authorized hiring run (`run_alpha`).
- **Input**:
  - Request 1: POST `/v1/workspaces/{ws}/sources` with file `Resume.pdf` (Candidate Alice: "Alice Doe, Distributed Systems Engineer").
  - Request 2: POST `/v1/workspaces/{ws}/sources` with file `Resume.pdf` (Candidate Bob: "Bob Smith, React Frontend Developer").
- **Observable Expected Outcome**:
  - Request 1 returns **HTTP 202 Accepted** with body: `{"source_id": "<uuid-1>", "version_id": "<ver-1>", "version": 1, "state": "pending", "replayed": false}`.
  - Request 2 returns **HTTP 202 Accepted** with body: `{"source_id": "<uuid-2>", "version_id": "<ver-2>", "version": 1, "state": "pending", "replayed": false}` where `<uuid-2> != <uuid-1>`.
  - Database contains two distinct rows in `wbctx_sources`.
  - `source_key` for Request 2 is auto-disambiguated with a deterministic suffix (e.g., `Resume.pdf (<suffix>)`).
  - GET `/v1/workspaces/{ws}/sources/<uuid-1>` displays Alice's spans; `<uuid-2>` displays Bob's spans without bleed.
- **Required Evidence**:
  - JSON response payloads for both requests.
  - SQL query results: `SELECT id, source_key FROM wbctx_sources WHERE run='run_alpha';`.
  - Span texts from `wbctx_spans` verifying complete isolation.

---

## Scenario 2: Explicit Revisions and Persisted Idempotent Replay

- **Objective**: Verify that an intentional revision targeting an existing `source_id` creates version 2 under the same source identity, while duplicate submissions with an `Idempotency-Key` header return the previous result with `replayed: true`.
- **Prerequisites**:
  - Source `<uuid-1>` exists at version 1.
- **Input**:
  - Step A (Explicit Revision): POST `/v1/workspaces/{ws}/sources` with form-data `target_source_id=<uuid-1>` and revised PDF content.
  - Step B (Idempotent Replay): POST `/v1/workspaces/{ws}/sources` with identical bytes and header `Idempotency-Key: idem_test_999`.
  - Step C (Duplicate Request): POST `/v1/workspaces/{ws}/sources` repeated with identical header `Idempotency-Key: idem_test_999`.
- **Observable Expected Outcome**:
  - Step A: Returns **HTTP 202 Accepted** with same `source_id: "<uuid-1>"`, `version: 2`, new `version_id`, `replayed: false`.
  - Step B: Returns **HTTP 202 Accepted** with `replayed: false`, recording key in `wbctx_idempotency_keys`.
  - Step C: Returns **HTTP 202 Accepted** with identical `source_id` and `version_id`, `replayed: true`. Zero new rows in `wbctx_versions`.
- **Required Evidence**:
  - SQL rows from `wbctx_versions WHERE source='<uuid-1>';`.
  - SQL row from `wbctx_idempotency_keys WHERE idempotency_key='idem_test_999';`.
  - JSON responses from Step B and Step C.

---

## Scenario 3: Partial Batch Failure Isolation

- **Objective**: Verify that in a multi-file batch upload where one file is corrupted or unsupported, valid files are successfully committed and queued, while the failure is isolated and reported per-file.
- **Prerequisites**:
  - Active recruiter session in Web UI (`ContextEvidencePanel.jsx`).
- **Input**:
  - Select 3 files simultaneously:
    1. `valid_document_1.pdf` (valid PDF).
    2. `unsupported_binary.exe` (unsupported format).
    3. `valid_document_2.txt` (valid plain text).
  - Submit batch upload.
- **Observable Expected Outcome**:
  - UI displays per-file progress and preserves successful uploads.
  - `valid_document_1` and `valid_document_2` return **HTTP 202 Accepted** and transition to `pending`.
  - `unsupported_binary.exe` returns **HTTP 415 Unsupported Media Type** (`UNSUPPORTED_FORMAT`) and renders an inline per-file error badge.
  - Overall batch preserves the two successful documents without rollback or state corruption.
- **Required Evidence**:
  - UI screenshot showing individual document status badges and the specific error banner.
  - Database records in `wbctx_sources` confirming presence of documents 1 and 3, and absence of 2.

---

## Scenario 4: Real Temporal Workflow Interruption & Terminal Recovery

- **Objective**: Verify that interrupting the Temporal document worker during execution leaves jobs in a recoverable state, heartbeats maintain leases, and restarting the worker or dispatching closed workflows resumes processing without duplicating versions.
- **Prerequisites**:
  - Persistent Temporal dev server running on port 7233.
  - Document worker active.
- **Input**:
  - Upload a multi-page document.
  - Send `SIGTERM` to the worker process mid-execution (during parsing activity).
  - Observe lease expiration behavior in `wbctx_jobs.lease_until`.
  - Restart worker via `./infra/scripts/launch_workbyline_v3.sh worker`.
- **Observable Expected Outcome**:
  - Temporal heartbeat timeout triggers retry policy.
  - On restart, `dispatch_pending` uses `WorkflowIDReusePolicy.ALLOW_DUPLICATE` to recover closed or interrupted runs.
  - Version state transitions from `pending` -> `completed` (or `partial`).
  - Zero duplicate versions or orphaned spans in `wbctx_spans`.
- **Required Evidence**:
  - Temporal Workflow Execution History log.
  - PostgreSQL rows from `wbctx_jobs` and `wbctx_versions`.

---

## Scenario 5: Real Embeddings & Scoped Hybrid Retrieval (pgvector + FTS)

- **Objective**: Verify that document spans are embedded using the configured real model (`bge-small-en-v1.5`, 384 dimensions) and that Reciprocal Rank Fusion (RRF) combines lexical and vector scores within strict tenant/run boundaries.
- **Prerequisites**:
  - `pgvector` extension enabled in PostgreSQL.
  - `WORKBYLINE_EMBEDDING_WEIGHTS` pointing to complete `BAAI/bge-small-en-v1.5` model artifact directory (`config.json`, `modules.json`, `tokenizer_config.json`, `special_tokens_map.json`, `tokenizer.json`/`vocab.txt`, `model.safetensors`) verified against `WORKBYLINE_EMBEDDING_REVISION`, `WORKBYLINE_EMBEDDING_CONFIG_SHA256`, and `WORKBYLINE_EMBEDDING_ARTIFACT_SHA256`.
- **Input**:
  - Ingest document with domain-specific phrases (e.g. "Raft distributed consensus leader election").
  - Execute POST `/v1/workspaces/{ws}/research-qa` with JSON body:
    `{"question": "How does leader election work?", "limit": 5, "mode": "retrieval_only"}`.
- **Observable Expected Outcome**:
  - `wbctx_span_embeddings` and `wbctx_indexings` contain 384-dimensional vectors with `model_id='bge-small-en-v1.5'`, `model_revision`, and `artifact_sha256` bound to the active embedder.
  - Zero hash-derived fake vectors stored; queries filter by `(model_id, model_revision, artifact_sha256)`.
  - POST `/research-qa` returns **HTTP 200 OK** with body containing `passages` array and `rrf_score` fields.
  - Passages from other workspaces or deleted sources (`deleted=true`) are strictly excluded.
- **Required Evidence**:
  - SQL verification query: `SELECT span_id, model_id, model_revision, artifact_sha256 FROM wbctx_span_embeddings LIMIT 5;`.
  - JSON response showing ranked passages with `rrf_score`.

---

## Scenario 6: Graphiti Knowledge Graph Projection, Replay & Revocation

- **Objective**: Verify that entity/edge projections are recorded in `wbctx_projections`, re-resolving graph nodes against canonical PostgreSQL records, and that document revocation immediately excludes graph nodes from retrieval.
- **Prerequisites**:
  - `WORKBYLINE_GRAPH_ENABLED=true` with running FalkorDB / Neo4j instance.
- **Input**:
  - Step 1: Ingest document describing entity relationship: "Alice was Lead Architect at Acme Corp from 2021 to 2024."
  - Step 2: Query POST `/v1/workspaces/{ws}/related-evidence` with JSON body `{"question": "Acme Corp", "limit": 5}`.
  - Step 3: Revoke source document via DELETE `/v1/workspaces/{ws}/sources/{id}`.
  - Step 4: Re-query POST `/v1/workspaces/{ws}/related-evidence` with JSON body `{"question": "Acme Corp", "limit": 5}`.
- **Observable Expected Outcome**:
  - Step 1: `wbctx_projections` contains row with `status='projected'` and valid `episode_id`.
  - Step 2: Returns **HTTP 200 OK** with `status: "RELATED_EVIDENCE_FOR_HUMAN_REVIEW"` and passages linked to Alice and Acme Corp.
  - Step 3: Source marked `deleted=true` in `wbctx_sources`.
  - Step 4: Re-resolution against canonical PostgreSQL records filters out revoked source spans (returns 0 passages or excludes revoked spans).
- **Required Evidence**:
  - Database row from `wbctx_projections`.
  - Graph query responses before and after document deletion.

---

## Scenario 7: Authenticated End-to-End Browser Journey (Web -> API -> Python)

- **Objective**: Verify full authentication chain and token delegation from Next.js server to Python Context API.
- **Prerequisites**:
  - Running Next.js server (port 3004) and Python service (port 8011).
  - Authenticated session cookie for user with `recruiter` role.
- **Input**:
  - Browser navigates to `/employer/brief/{id}`.
  - Uploads a candidate resume through the UI.
  - Inspects document details (spans, SHA-256, parsing status).
  - Executes a passage search query.
- **Observable Expected Outcome**:
  - Next.js issues scoped JWT with actor, workspace, and operation claims.
  - Python API validates HMAC-SHA256 signature against `WORKBYLINE_CONTEXT_DELEGATION_SECRET`.
  - Document appears in UI with real-time status transitions.
  - Extracted spans render in inspection drawer.
- **Required Evidence**:
  - Browser network trace showing 200/202 responses across `/api/employer/context-sources/*`.
  - Python API access logs with correlation ID and authenticated actor ID.

---

## Scenario 8: LangGraph Claim Attribution, Quantities, Contradiction & Abstention

- **Objective**: Verify bounded generation flow: enforces request timeouts, rejects malformed provider outputs, detects quantity mismatches, and abstains when evidence is insufficient or contradicting.
- **Prerequisites**:
  - `WORKBYLINE_GENERATION_GATE=true` (authorized for this specific test run).
  - Configured Gemini API key with timeout set to 5000ms.
- **Input**:
  - Case A (Supported): Resume states "Managed a team of 15 engineers". Prompt: "How many engineers did they manage?".
  - Case B (Quantity Contradiction): Resume states "Led 3 engineers". Prompt: "Confirm candidate led 20 engineers".
  - Case C (Abstention): Resume contains no mention of Kubernetes. Prompt: "What is their experience with Kubernetes?".
- **Observable Expected Outcome**:
  - Case A: Returns `status='GROUNDED'`, answer mentions 15 engineers, citation points to exact span.
  - Case B: Returns `status='CONTRADICTED'` or `supported=false` for the 20-engineer claim.
  - Case C: Returns `status='INSUFFICIENT_EVIDENCE'` with explicit abstention text.
- **Required Evidence**:
  - Structured output payloads for Cases A, B, and C.
  - LangGraph node transition trace showing validation step.

---

## Scenario 9: Tenant Isolation & Auditor Write/Delete Denial

- **Objective**: Verify that an authenticated auditor can read and search evidence but is strictly forbidden from uploading, revising, or deleting documents, and that cross-tenant access returns 403/404.
- **Prerequisites**:
  - User A: Role `auditor` in Org 1.
  - User B: Role `recruiter` in Org 2.
  - Hiring run `run_org1` belonging to Org 1.
- **Input**:
  - Test A: User A attempts POST `/api/employer/context-sources/upload` for `run_org1`.
  - Test B: User A attempts DELETE `/api/employer/context-sources/{id}` for `run_org1`.
  - Test C: User A executes GET `/api/employer/context-sources?hiring_run_id=run_org1`.
  - Test D: User B attempts GET `/api/employer/context-sources?hiring_run_id=run_org1`.
- **Observable Expected Outcome**:
  - Test A: HTTP 403 Forbidden (`ACCESS_DENIED`).
  - Test B: HTTP 403 Forbidden (`ACCESS_DENIED`).
  - Test C: HTTP 200 OK (Read allowed).
  - Test D: HTTP 403/404 Forbidden (Tenant cross-access blocked).
- **Required Evidence**:
  - HTTP status codes and response bodies for Tests A–D.
  - Server-side auth audit log entries.

---

## Scenario 10: End-to-End Processing Throughput & Resource Bounding

- **Objective**: Verify that the complete pipeline (upload -> parse -> embed -> graph) completes within bounded time and memory limits for a typical batch of 10 resumes.
- **Prerequisites**:
  - Full local stack active with worker concurrency set to 2.
- **Input**:
  - Ingest 10 standard multi-page candidate resumes (approx. 500KB - 2MB each).
- **Observable Expected Outcome**:
  - All 10 documents achieve terminal `completed` state within 60 seconds total.
  - Memory consumption of worker process remains bounded (< 1GB RSS).
  - Zero unhandled worker exceptions or deadlocks.
- **Required Evidence**:
  - Timestamp log from first ingest submission to last completion.
  - Peak RSS memory metrics from process monitor.

---

## Scenario 11: Paired Application & Database Rollback Rehearsal

- **Objective**: Verify that the rollback script safely reverts database schema to Core-08 baseline, boots the Core-08 application on port 3008, verifies read/write compatibility, reapplies forward migrations, and proves zero document loss with 100% byte integrity.
- **Prerequisites**:
  - Dedicated disposable PostgreSQL instance configured via `DISPOSABLE_DATABASE_URL`.
  - Matched disposable Supabase HTTP target configured via `DISPOSABLE_SUPABASE_URL`.
  - `DISPOSABLE_SUPABASE_ANON_KEY` and `DISPOSABLE_SUPABASE_SERVICE_ROLE_KEY` provided.
- **Input**:
  - Execute `bash infra/deployment/rehearse_paired_rollback.sh`.
- **Observable Expected Outcome**:
  - Step 1: Tar archive readability & provenance verified.
  - Step 2: Database schema reverted to Core-08; `record_human_decision_transactional` removed.
  - Step 3: Core-08 app boots cleanly on port 3008 and passes HTTP GET / and POST /api/auth/signup.
  - Step 4: Forward migrations reapplied to V3.
  - Step 5: `candidate_documents` row counts match pre-rollback count exactly.
  - Step 6: Byte-level `sha256(normalized_text::bytea)` matches stored hash with zero exemptions.
  - Final output: `OVERALL ACCEPTANCE: PASS`.
- **Required Evidence**:
  - Complete console output log of `rehearse_paired_rollback.sh`.
  - Pre- and post-rollback hash comparison records.

---

## Scenario 12: Genuine PostgreSQL Database Backup & Storage Directory Recovery

- **Objective**: Verify that the complete application state (PostgreSQL database records, spans, vectors, and raw original files in private storage) can be backed up, wiped on disposable infrastructure, and restored to full operability without data corruption or orphan records.
- **Prerequisites**:
  - Running PostgreSQL with populated `wbctx_*` tables on verified disposable database target (`assert_disposable_db_target` enforced; port 54332 strictly protected).
  - Populated private storage directory `WORKBYLINE_CONTEXT_STORAGE`.
- **Input**:
  - Step 1 (Coordinated Backup):
    - Export database: verify disposable target via `assert_disposable_db_target "${DATABASE_URL}"`, then `pg_dump "${DATABASE_URL}" --clean --if-exists > backup_test.sql`.
    - Archive storage: `tar -czf backup_storage.tar.gz -C "${WORKBYLINE_CONTEXT_STORAGE}" .`.
  - Step 2 (Guarded Disaster Simulation):
    - Re-verify disposable target: `assert_disposable_db_target "${DATABASE_URL}"` (fail-fast exit 42 if non-disposable or port 54332).
    - Wipe database tables on disposable instance: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`.
    - Purge storage directory: `rm -rf "${WORKBYLINE_CONTEXT_STORAGE}"/*`.
    - Confirm GET `/health` returns `status: "unhealthy"` with `schema: "unavailable"` and missing tables.
  - Step 3 (Coordinated Restoration):
    - Restore database: `psql -v ON_ERROR_STOP=1 "${DATABASE_URL}" < backup_test.sql`.
    - Restore storage: `tar -xzf backup_storage.tar.gz -C "${WORKBYLINE_CONTEXT_STORAGE}"`.
  - Step 4 (Dual Integrity & Operability Verification):
    - Check `/health` returns `status: "ready"`, `liveness: "alive"`, `operational_readiness.database: "connected"`, `operational_readiness.schema: "ready"`, `operational_readiness.temporal: "connected_worker_active"`.
    - Execute GET `/v1/workspaces/{ws}/sources/{id}` for previously ingested documents.
    - Original-byte integrity: verify SHA-256 of restored file on disk matches stored `wbctx_versions.sha256` exactly.
    - Normalized-text integrity: verify SHA-256 of `wbctx_artifacts.text` matches stored `wbctx_artifacts.sha256` separately.
    - Search verification: hybrid search over restored spans returns expected results without re-indexing.
- **Observable Expected Outcome**:
  - Database schema and rows restore completely across all 12 `wbctx_*` tables and `schema_migrations`.
  - Stored document files restore with identical byte lengths and exact SHA-256 matches.
  - Document inspect endpoint returns identical spans, parser metadata, and version numbers.
  - Original-byte integrity and normalized-text integrity both pass affirmative verification.
- **Required Evidence**:
  - Checksum comparison log between pre-backup files and restored files.
  - Row count match query output across all 12 `wbctx_*` tables.
  - API response payload from post-restore inspect request.

---

## Acceptance Approval Ledger

| Scenario | Candidate Version | Execution Date | Evaluator | Result | Evidence Ref |
|---|---|---|---|---|---|
| 1. Same-Filename Separate Candidates | V3-RC | 2026-10-31 | Persistent Runtime & Browser Suites | **VERIFIED (Local Runtime + UI)** | `evidence/persistent_runtime_acceptance.json`, `evidence/browser_acceptance/browser_acceptance_report.json` |
| 2. Revisions and Idempotent Replay | V3-RC | 2026-10-31 | Persistent Runtime & Browser Suites | **VERIFIED (Local Runtime + UI)** | `evidence/persistent_runtime_acceptance.json`, `evidence/browser_acceptance/browser_acceptance_report.json` |
| 3. Partial Batch Failure Isolation | V3-RC | 2026-10-31 | Pytest + Playwright Browser Suites | **VERIFIED (API + UI Contracts)** | `logs/verification/pytest_suite.log`, `evidence/browser_acceptance/browser_acceptance_report.json` |
| 4. Temporal Interruption Recovery | V3-RC | 2026-10-31 | Persistent Runtime Suite | **VERIFIED (SIGKILL Parsing & Indexing Recovery, Cancellation & Terminal Retry)** | `evidence/persistent_runtime_acceptance.json`, `logs/verification/persistent_runtime_acceptance.log` |
| 5. Real Embeddings & Scoped RRF | V3-RC | 2026-10-31 | SentenceTransformers Reference + PG | **VERIFIED (SentenceTransformers PyTorch + pgvector + inference_backend)** | `logs/verification/bge_reference_verification.log`, `evidence/persistent_runtime_acceptance.json` |
| 6. Graphiti Projection & Revocation | V3-RC | *Gated* | External Provider Gate | **CONFIGURED / GATED — NOT EXECUTED** | Fail-closed (`503 GRAPH_PROJECTION_UNAVAILABLE`) verified in UI & API |
| 7. Authenticated Browser -> API | V3-RC | 2026-10-31 | Playwright 12-Item Browser Acceptance | **VERIFIED (Playwright 12-Item Suite: In-Flight Run Switching & Historical Revocation)** | `evidence/browser_acceptance/browser_acceptance_report.json`, screenshots 01–05, `trace.zip` |
| 8. Bounded Generation & Abstention | V3-RC | *Gated* | External Provider Gate | **CONFIGURED / GATED — NOT EXECUTED** | Unit contracts verified; live Gemini API gated (`WORKBYLINE_GENERATION_GATE=false`, honest 503 verified) |
| 9. Tenant Isolation & Auditor Denial | V3-RC | 2026-10-31 | Playwright Browser + Live PG Pytest | **VERIFIED (Local Runtime + Browser)** | `evidence/browser_acceptance/browser_acceptance_report.json`, `logs/verification/pytest_suite.log` |
| 10. Throughput & Resource Bounding | V3-RC | 2026-10-31 | Persistent Runtime Suite | **VERIFIED (Local Runtime)** | `logs/verification/persistent_runtime_acceptance.log` |
| 11. Paired App/DB Rollback Rehearsal | V3-RC | 2026-10-31 | Guard + Archive Suite | **VERIFIED (Archive/Guard) / GATED (Live Supabase HTTP)** | `logs/verification/script_defects_suite.log`, `logs/verification/backup_restore_rehearsal.log` |
| 12. Backup & Storage Directory Recovery | V3-RC | 2026-10-31 | Disposable PG 17 Rehearsal | **VERIFIED (Local Runtime)** | `logs/verification/backup_restore_rehearsal.log` |
