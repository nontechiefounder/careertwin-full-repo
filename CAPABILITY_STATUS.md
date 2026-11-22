# WorkByLine V2 — Engine & Capability Status Matrix

**Evaluated Commit:** `411cb072234a47280c0de50bf9e43a2f56219837`  
**Evaluation Target:** Native PostgreSQL 17.6 (`wbctx-disposable-eval-pg`, port 54399)  
**Baseline Status:** `84d9712` preserved; shared baseline database (port 54332) read-only (0 writes).  

---

## Capability Status Matrix

| Layer / Capability | Current Status | Evidence / Verification Method | Acceptance Caveat / Prerequisite |
| :--- | :--- | :--- | :--- |
| **Grounding Defect Closure** | **PASS** | `tests/test_unseen_grounding_eval.py` (17/17 passed) | 0% FAR, 0% FRR on unseen adversarial suite. Universal semantic verification is not claimed. |
| **Cross-Language Live Integration** | **PASS** | `CrossLanguageLiveIntegration.test.js` (5/5 passed) | Real HTTP requests: Next.js proxy -> Python Memory API (port 8011). |
| **Paired Application Rollback** | **PASS** | `rehearse_paired_rollback.sh` (Exit 0) | Core-08 web server booted on port 3008, HTTP reads & writes verified, byte sha256 matched. |
| **Real Browser Founder Acceptance** | **PASS** | `playwright_founder_journey.js` (13/13 passed) | Full automated Playwright browser session against production Next.js build (port 3004). |
| **Ingestion Throughput (Text/DOCX)** | **PASS** | `scripts/reproduce_benchmark.py` (499.80 docs/sec) | Substantially exceeds the contract target of $\ge 2.0\text{ docs/sec}$. |
| **API Latency (p50)** | **PASS** | `scripts/reproduce_benchmark.py` (4.24 ms) | Well within the contract target of $\le 120\text{ ms}$. |
| **Temporal Workflow Pipeline** | **PASS (TEST-SERVER ONLY)** | `tests/test_expansion.py` & Playwright worker | Runs via embedded `WorkflowEnvironment.start_time_skipping()`. Persistent local CLI (7233) not installed. |
| **Native pgvector Operations** | **UNIT/SQL-CORRECTNESS ONLY** | PostgreSQL 17.6 pgvector queries | Hash-derived vectors prove SQL and schema correctness; not real BGE semantic embeddings. |
| **Live BGE Semantic Quality** | **UNVERIFIED** | Benchmark classification | `sentence-transformers` BGE weights not installed in offline environment. |
| **Server-Side Generation Adapter** | **BLOCKED (Awaiting Key)** | `service/provider_factory.py` & live test | Adapter wired with timeout and token budget. Fails closed with HTTP 503 until `GEMINI_API_KEY` is set. |
| **Live Graphiti Graph Backend** | **BLOCKED (Awaiting Neo4j)** | Live test returns truthful HTTP 503 | Truthful handling verified. Requires running Neo4j container for live graph projections. |
| **Independent Code Review** | **BLOCKED (Awaiting Account)** | CLI attempt logs recorded | Claude CLI: `Credit balance is too low`. Codex: `Missing OpenAI API key`. |
| **Founder UAT Readiness** | **AVAILABLE (Selected Paths)** | Document upload, search, versioning, RBAC | Founder testing available for implemented local capabilities. |

---

## Gate Classification Summary
- **Fully Passed Gates:** Grounding Defect Closure, Cross-Language Integration, Paired Application Rollback, Real Browser Acceptance, Ingestion Throughput, API Latency.
- **Unit/Contract Only Gates:** pgvector Hash-Derived Vectors, Embedded Temporal Test-Server.
- **Blocked Gates (Missing Prerequisites):** Live Gemini Generation (API Key), Live Graphiti (Neo4j), Persistent Temporal CLI (System Binary), Independent External Review (Account Credits).
- **Unverified Metrics:** Live BGE Semantic Retrieval Quality.
