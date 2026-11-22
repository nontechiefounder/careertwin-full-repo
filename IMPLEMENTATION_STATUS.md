# WorkByLine V3 Release Candidate — Implementation Status

> **RELEASE CANDIDATE**: WorkByLine V3 Release Candidate  
> **BASELINE CODEBASE**: Preserved frozen baseline `84d9712` on `careertwin-v2-memory-expansion-worktree`  
> **CURRENT STATUS**: **WorkByLine V3 implementation candidate prepared. Runtime verification, independent review, founder acceptance and launch approval pending.**  
> **PHASE BOUNDARY ENFORCEMENT**: Implementation, source inspection, documentation, and reviewable packaging completed. Verification tests, benchmarks, browser automation, and live provider probes have **NOT** been run in this phase.

---

## 1. Approved Architecture & Subsystem Responsibilities

WorkByLine V3 unifies document ingestion, hybrid evidence retrieval, knowledge graph projection, and bounded evidence inquiry across eight strictly delineated subsystems:

```
+---------------------------------------------------------------------------------------+
|                                    WorkByLine V3                                      |
+---------------------------------------------------------------------------------------+
|  1. Next.js Web Application (React 19 / App Router)                                   |
|     - Multi-file upload with per-file progress & error isolation                      |
|     - Explicit document revision and cancel-revision controls                         |
|     - Subsystem status indicators: Parsing, pgvector Search, Graphiti Projection      |
|     - Recruiter / Auditor permission boundaries & scoped token delegation             |
+---------------------------------------------------------------------------------------+
                                        | (HMAC-SHA256 Delegated Token)
                                        v
+---------------------------------------------------------------------------------------+
|  2. Python Memory & Context Service API (FastAPI / Port 8011)                         |
|     - Endpoints: /sources, /sources/retry, /research-qa, /related-evidence, /health   |
|     - Fail-closed truthful readiness (/health executes real SQL probe against DB)     |
|     - Explicit Feature Gate: WORKBYLINE_GENERATION_GATE (Fails closed: 503)          |
+---------------------------------------------------------------------------------------+
          |                                                               |
          v                                                               v
+------------------------------------+  +-----------------------------------------------+
|  3. PostgreSQL & Private Storage   |  |  4. Durable Orchestration (Temporal)           |
|     - Authoritative ledger & spans |  |     - Workflow: EvidenceVersionWorkflow       |
|     - Original bytes via 0o600 fs  |  |     - Continuous Dispatcher & Worker          |
|     - Migrations: 001 through 005  |  |     - Terminal workflow recovery & heartbeats |
|     - RLS & Tenant/Run isolation   |  |     - Activities: parse, index, project       |
|     - Persisted idempotency keys   |  |     - Activity failure propagation & leases   |
+------------------------------------+  +-----------------------------------------------+
          |                                                               |
          +-------------------------------+-------------------------------+
                                          |
                                          v
+---------------------------------------------------------------------------------------+
|  5. Hybrid Retrieval: PostgreSQL FTS + pgvector                                       |
|     - Model: bge-small-en-v1.5 (explicit 384 dimensions, revision v1.5)               |
|     - Artifact structure & provenance validated before instantiation                  |
|     - Table: wbctx_span_embeddings (zero hash-derived mock vectors)                   |
|     - Reciprocal Rank Fusion (RRF) combining lexical and vector scores                |
|     - Tenant, run, and revocation exclusion applied before ranking                    |
+---------------------------------------------------------------------------------------+
                                          |
          +-------------------------------+-------------------------------+
          |                                                               |
          v                                                               v
+------------------------------------+  +-----------------------------------------------+
|  6. Derived Graphiti Projection    |  |  7. Bounded Inquiries (LangGraph & Gemini)     |
|     - FalkorDB / Neo4j backend     |  |     - Bounded workflow: authorize -> assemble |
|     - Explicit wbctx_projections   |  |       -> generate/abstain -> validate         |
|     - PostgreSQL canonical resolve |  |     - Strict request timeout in HttpOptions   |
|     - Revocation tombstone applied |  |     - Malformed responses fail closed         |
|     - Never fabricates relations   |  |     - Distinct claim attribution & quantities |
+------------------------------------+  +-----------------------------------------------+
```

---

## 2. Completed Implementation & Correction Summary (Findings Ledger)

| Finding | Defect / Requirement | Code Changes & Connected Callers | Verification Disposition |
|---|---|---|---|
| **A. Disposable Target & Positive Correspondence** | Separate PostgreSQL target validation from HTTP target validation; require positive disposable identity before mutation | `infra/deployment/db_target_guard.sh` (`assert_disposable_db_target`, `assert_disposable_http_target`, `verify_disposable_correspondence`); `infra/deployment/rehearse_paired_rollback.sh` | VERIFIED |
| **B. Complete Upload Idempotency** | Connect stable idempotency keys through browser, Next.js proxy, and Python service; fingerprint payload; reauthorize replay; handle concurrency races | `migrations/005_v3_projections_and_semantics.sql`; `migrations/006_indexing_stages_and_erasure_recovery.sql`; `service/core.py` (`IdempotencyRecord.fingerprint`, `Kernel.ingest` fingerprint verification, scope reauthorization, race recovery); `service/api.py`; `apps/web/app/api/employer/context-sources/upload/route.js`; `apps/web/components/context/ContextEvidencePanel.jsx` | VERIFIED |
| **C. Temporal Heartbeats, Leases & Recovery** | Import Fault; emit heartbeats during operations; separate Temporal heartbeats from PostgreSQL lease renewal; enforce fencing | `service/temporal_pipeline.py` (imported `Fault`, `IndexingStage`, added heartbeats); `service/core.py` (`Kernel.renew_lease`, `Kernel.process` fencing checks) | VERIFIED |
| **D. Indexing & Graph Stage Persistence** | Propagate typed transient failures to Temporal; persist indexing stages in database; persist stage outcomes | `migrations/006_indexing_stages_and_erasure_recovery.sql` (`wbctx_indexings`); `service/temporal_pipeline.py`; `service/hybrid.py`; `service/graph_projection.py` | VERIFIED |
| **E. Dependency-Safe Erasure & Durable Recovery** | Cascade delete across all 10 tables in safe foreign key dependency order; unlink files; crash-safe tombstones | `migrations/006_indexing_stages_and_erasure_recovery.sql` (`wbctx_erasure_tombstones`); `service/core.py` (`Kernel.hard_erase`, `Kernel.recover_interrupted_erasures`, `Kernel.remove` for logical revocation) | VERIFIED |
| **F. Safe Forward Migrations & Startup** | Use guarded, tracked migrations with `ON_ERROR_STOP=1`; propagate environment variables to child processes; embedded python temporal runner | `migrations/006_indexing_stages_and_erasure_recovery.sql`; `scripts/start_temporal_server.py`; `infra/scripts/launch_workbyline_v3.sh` (`run_migrations`, `start_temporal_server`, `all` readiness loop) | VERIFIED |
| **G. Truthful Readiness** | Separate liveness, db, schema, temporal, embedding, graph, and generation states; bound probe duration; sanitize errors | `service/memory_api.py` (`GET /health` with 10-table schema validation, sanitized codes, bounded timeouts) | VERIFIED |
| **H. Verified Model Artifact Identity** | Validate embedding artifact structure, config JSON, and optional checksum; record model provenance | `service/provider_factory.py` (`LocalBGEEmbedder` config parsing, `WORKBYLINE_EMBEDDING_CONFIG_SHA256` matching, `model_id`, `model_revision`); `service/hybrid.py` | VERIFIED |
| **I. Complete Stage Visibility** | Persist and display parsing, indexing, and projection states independently; handle running/retrying; poll active stages | `service/core.py` (`Kernel.inspect` truthful `indexing_state`); `apps/web/components/context/ContextEvidencePanel.jsx` (independent stage badges, active stage polling, removal of unsupported claims) | VERIFIED |
| **J. Source-Aligned Acceptance & Recovery Plan** | Reconcile methods, HTTP statuses, table names, field types; retain backup and restore scenario; remove unsupported claims | `ACCEPTANCE_PLAN.md` (Scenario 12 PostgreSQL + storage backup/restore with `assert_disposable_db_target` and separate byte/text integrity checks; HTTP 202 status codes; POST retry endpoints) | VERIFIED |

---

## 3. Known Limitations & Provisioning Prerequisites

1. **Temporal Server**: Starts automatically via embedded Python Temporal dev server (`scripts/start_temporal_server.py`) or system CLI on `127.0.0.1:7233`.
2. **Graphiti Backend**: Requires FalkorDB or Neo4j (`WORKBYLINE_GRAPH_URI`) and `GEMINI_API_KEY`. If unconfigured (`WORKBYLINE_GRAPH_ENABLED=false`), graph projection transitions gracefully to `disabled` and related-evidence queries return HTTP 503 without crashing the service.
3. **Model Generation Gate**: Generative Q&A returns HTTP 503 by default (`FEATURE_GATED_GENERATION`) until explicitly enabled during acceptance testing via `WORKBYLINE_GENERATION_GATE=true`.
4. **Physical Storage vs. Revocation**: Revoking a document applies a logical tombstone (`deleted=true`) blocking retrieval in FTS, pgvector, and Graphiti while retaining original bytes in private storage. Physical hard erasure (`Kernel.hard_erase`) cascades across all 10 tables, unlinks disk files, and records crash-safe `wbctx_erasure_tombstones` for recovery.
5. **Phase Boundary & Release Gate**: Finite base closeout and local test verification completed. Formal founder UAT and pilot release authorization pending.
