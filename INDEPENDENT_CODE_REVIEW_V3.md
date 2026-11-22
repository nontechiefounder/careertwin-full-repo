# WorkByLine V3 — Comprehensive Code Review & Independent Audit Checklist

**Date:** October 31, 2026  
**Candidate Release:** WorkByLine V3 Release Candidate  
**Base Lineage:** Descended from `c9201ea`, `fae79cb`, `f41e503`, `1f40f9f`, and `870e3d2`  
**Frozen Baseline:** `84d9712` (Preserved without modification)  
**Self-Review Status:** Complete (`VERIFIED_LOCAL`)  
**Independent Review Status:** `BLOCKED — PENDING INDEPENDENT REVIEW BY PARTH`  

---

## 1. Subsystem Architecture & Code Review (Self-Review)

### A. Database Migrations & Target Safety
- **Files Modified / Added**:
  - `migrations/008_inference_backend_and_upgrade_reconciliation.sql`
  - `supabase/migrations/20260818000008_inference_backend_and_upgrade_reconciliation.sql`
  - `scripts/run_forward_migrations.py`
  - `infra/deployment/db_target_guard.sh`
- **Review Analysis**:
  - Migrations 000 through 008 use PostgreSQL single-session advisory locking (`8492041`) to prevent concurrent migration race conditions.
  - The migration script strictly enforces target guard parsing via `db_target_guard.sh`, protecting port `54332` from any accidental mutation.
  - Checksum reconciliation table in `run_forward_migrations.py` accommodates historical variations across earlier candidate checkpoints (`f41e503`, `1f40f9f`, `870e3d2`) without altering recorded checksums, while enforcing strict forward checksums (`5fbcde775a67...`).
  - Migration 008 adds `inference_backend VARCHAR(128)` to `wbctx_span_embeddings` and `wbctx_indexings` to record model inference engine provenance.

### B. Core Ledger, Storage & Erasure Recovery
- **Files Modified / Added**:
  - `service/core.py`
  - `service/cli.py`
- **Review Analysis**:
  - Immutable versioning enforces that a `Source` owns multiple sequential `Version` records. Replays of identical payloads with identical `idempotency_key` return the existing version without duplication (`replayed = True`).
  - `Kernel.renew_lease` strictly checks `job.lease_until < now`, preventing expired leases from being renewed or stale workers from committing data (`LEASE_LOST`).
  - Physical erasure uses two-phase durable tombstones (`wbctx_erasure_tombstones`) with lease fencing. Unlinked disk files cannot leave dangling DB records.
  - CLI command `recover-erasure` recovers interrupted disk unlinks across restarts.

### C. Embedding Inference & Hybrid Retrieval
- **Files Modified / Added**:
  - `service/provider_factory.py`
  - `service/hybrid.py`
- **Review Analysis**:
  - Removed unvalidated numpy embedding implementations.
  - `LocalBGEEmbedder` uses standard `SentenceTransformers` PyTorch backend (`BAAI/bge-small-en-v1.5`), achieving `0.999988` cosine similarity against Hugging Face reference embeddings.
  - Hybrid retrieval executes dual-ranking: PostgreSQL full-text search (`to_tsquery('english', ...)`) fused with `pgvector` cosine distance (`<=>`) using Reciprocal Rank Fusion ($RRF = \sum \frac{1}{60 + \text{rank}}$).
  - All queries are strictly scoped by `org`, `run`, `workspace`, and `role`, completely isolating multi-tenant data.

### D. Temporal Workflow & Worker Orchestration
- **Files Modified / Added**:
  - `service/temporal_pipeline.py`
  - `service/run_memory.py`
- **Review Analysis**:
  - Exactly one durable workflow per version: `wbctx-version-{version_id}`.
  - `HeartbeatLeaseMaintainer` emits activity heartbeats to Temporal and renews database leases periodically. Context variables are propagated to child threads via `contextvars.copy_context()`.
  - In `EvidenceVersionWorkflow.run`, downstream failures in indexing or projection raise non-retryable `ApplicationError("PARTIAL_DOWNSTREAM_FAILED: ...")`, recording the execution as `FAILED` in Temporal history.
  - Continuous dispatcher starts workflows with `WorkflowIDReusePolicy.ALLOW_DUPLICATE`, allowing retries of failed workflows with distinct run IDs.
  - `EvidenceActivities.process_version` enforces stage idempotency: if parsing artifacts are already committed, it skips redundant re-parsing.

### E. Next.js Web Frontend & Context Evidence Panel
- **Files Modified / Added**:
  - `apps/web/components/context/ContextEvidencePanel.jsx`
  - `apps/web/lib/contextClient.js`
  - `apps/web/app/api/employer/context-sources/[sourceId]/retry/route.js`
- **Review Analysis**:
  - Context Evidence Panel displays truthful real-time status badges for Parsing (`completed`), Indexing (`indexed` / `failed`), and Graph (`disabled`).
  - Retry button is displayed when `indexing_state === 'failed'`, triggering the `/retry` endpoint.
  - Unprovisioned features (Knowledge Graph, Generative AI Q&A) return honest `503 Service Unavailable` notices explaining feature-gate status without mock fallbacks.
  - Client-side navigation cleanly aborts pending in-flight queries when switching hiring runs, preventing cross-run state bleed.

---

## 2. Verification Evidence Summary

| Test Suite | Execution Command | Result | Evidence Log / Artifact |
|---|---|---|---|
| **Python Test Suite** | `.venv/bin/pytest -v --junitxml=evidence/pytest.xml` | **116 PASSED, 0 FAILED** | `evidence/pytest.xml`<br>`logs/verification/pytest_suite.log` |
| **Persistent Runtime Acceptance** | `.venv/bin/python tests/persistent_runtime_acceptance.py` | **8/8 SCENARIOS PASSED** | `evidence/persistent_runtime_acceptance.json`<br>`logs/verification/persistent_runtime_acceptance.log` |
| **Playwright Browser Acceptance** | `node scripts/verify_v3_browser_acceptance.mjs` | **12/12 GATES PASSED** | `evidence/browser_acceptance/browser_acceptance_report.json` |
| **Historical Candidate Upgrade** | `.venv/bin/python tests/verify_candidate_upgrade.py` | **4/4 CASES PASSED** | `logs/verification/upgrade_reconciliation.log` |
| **BGE Backend Precision** | `.venv/bin/python scripts/verify_bge_reference_backend.py` | **PASSED (Cosine: 0.999988)** | `logs/verification/bge_reference_verification.log` |
| **Script & Target Guard Defects** | `./infra/deployment/test_script_defects.sh` | **15/15 PASSED, 0 BLOCKED** | `logs/verification/script_defects_suite.log` |
| **Coordinated Backup / Restore** | `.venv/bin/python scripts/rehearse_backup_restore.py` | **PASSED** | `evidence/backup_restore_rehearsal.json` |

---

## 3. Independent Reviewer Checklist for Parth

> [!IMPORTANT]
> This section is reserved for independent verification by Parth. All items below must be independently inspected, executed, and signed off before release.

### Review Checklist Items

- [ ] **1. Architecture & Code Quality**:
  - [ ] Source diffs are surgical, maintainable, and free of unnecessary dependencies or mock fallbacks.
  - [ ] All database mutations are restricted to disposable PostgreSQL 17 (`54399`); zero mutations to protected port `54332`.
  - [ ] Error handling fails closed across all API and database boundaries.

- [ ] **2. Verification Reproduction**:
  - [ ] Run pytest suite: `pytest -v` (confirm 116 passed).
  - [ ] Run persistent runtime suite: `python tests/persistent_runtime_acceptance.py` (confirm 8 scenarios passed).
  - [ ] Run browser acceptance: `node scripts/verify_v3_browser_acceptance.mjs` (confirm 12 gates passed).
  - [ ] Run upgrade reconciliation: `python tests/verify_candidate_upgrade.py` (confirm 4 cases passed).

- [ ] **3. Operational Readiness**:
  - [ ] Subsystem startup and shutdown script `./infra/scripts/launch_workbyline_v3.sh` runs cleanly.
  - [ ] Health probe `curl -s http://127.0.0.1:8011/health` reports all operational readiness fields as ready.
  - [ ] Rollback package `rollback/careertwin_core08_app_archive.tar.gz` verified extractable and intact.

---

### Independent Review Sign-Off Block

- **Reviewer Name**: Parth  
- **Reviewer Decision**: `[ ] APPROVED   [ ] CHANGES REQUESTED   [X] PENDING REVIEW`  
- **Sign-Off Date**: ____________________  
- **Comments / Observations**:
  ```
  [Awaiting Parth's independent code review and sign-off]
  ```

