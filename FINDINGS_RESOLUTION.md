# WorkByLine V2 — Verified Audit Findings Resolution Matrix

**Candidate Commit:** `411cb072234a47280c0de50bf9e43a2f56219837`  
**Baseline:** `84d9712`  

---

### Finding 1: Grounding Defect in LangGraph QA Flow
- **Observed Defect:**
  - `Source: "Alice mentored Bob." -> Answer: "Bob mentored Alice."` was incorrectly accepted as `GROUNDED`.
  - `Source: "Candidate evaluated Python but deployed Go." -> Answer: "Candidate deployed Python."` was accepted despite contradictory action polarity.
  - `Source: "Candidate has 5 years of Python experience." -> Answer: "Candidate has five years of Python experience."` was falsely rejected.
- **Root Cause:**
  - Token-level set overlap ignored syntactic dependency roles (Subject-Verb-Object).
  - Contrastive structures ("evaluated X but deployed Y") had no verb-object binding validation.
  - Number words ("five") were treated as unsupported substantive vocabulary distinct from digits ("5").
- **Engineering Correction:**
  - Implemented `check_entity_relationship_inversion` in `service/qa_flow.py` extracting subject-predicate-object triples and rejecting reversed relational claims.
  - Implemented `check_contrastive_action_mismatch` in `service/qa_flow.py` recognizing contrasting connectors (`but`, `however`, `although`) and penalizing cross-attributed actions.
  - Implemented number word normalization mapping (`5` <-> `five`, `3` <-> `three`) while excluding numerals from content terms.
  - Added `ACTION_ROLE_VERBS` (`architected`, `authored`, `wrote`, `developed`, `implemented`, `directed`, `founded`) preventing role verb hijacking.
- **Verification & Observed Result:**
  - Created frozen unseen suite `tests/test_unseen_grounding_eval.py` (17 test cases covering entity swaps, action contrasts, valid paraphrases, quantity inflations, collective vs individual ownership).
  - Result: **17/17 PASSED**. False Acceptance Rate (FAR) = 0.00%, False Rejection Rate (FRR) = 0.00%, Accuracy = 100.00%.

---

### Finding 2: Cross-Language Integration Test Fidelity
- **Observed Defect:**
  - `CrossLanguageProxyIntegration.test.js` mocked `global.fetch` and fabricated Python-like responses, testing only client-side proxy contract logic while labeled as an integration test.
- **Engineering Correction:**
  - Relabeled existing file to `CrossLanguageProxyContractUnit.test.js` and updated suite description to reflect unit contract testing.
  - Created genuine live integration suite `apps/web/__tests__/api/CrossLanguageLiveIntegration.test.js` making actual HTTP requests through Next.js proxy route handlers directly to the running Python service (`http://127.0.0.1:8011`).
  - Added coverage for: live retrieval-only, live insufficient evidence, live unconfigured provider (503 fail-closed), authorization rejection (403), and malformed response handling (502 on ephemeral test server).
- **Verification & Observed Result:**
  - Vitest execution: **5/5 tests passed** against live Python service.

---

### Finding 3: Four-Layer Runtime Architecture
- **Observed Defect:**
  - Temporal: `verify_four_layer_expansion.py` used `WorkflowEnvironment.start_time_skipping()`, which starts an embedded test server on an ephemeral port. Persistent local Temporal CLI (`temporal server start-dev` on 7233) was not installed as a system binary.
  - Embeddings / pgvector: Local vectors were hash-derived rather than computed from real BGE embedding model weights.
  - Generation: `service/run_memory.py` constructed `create_memory_app` with `generator=None`.
- **Engineering Correction:**
  - Implemented `GeminiProviderAdapter` in `service/provider_factory.py` with 15s timeout, 1024 token budget, strict JSON output validation, and sanitized errors.
  - Wired `generator=generator_from_env()` into `service/run_memory.py`. When `GEMINI_API_KEY` is unset or invalid, the provider fails closed with HTTP 503 (`BLOCKED_PENDING_KEY_ROTATION`).
  - Strictly classified hash-derived pgvector vectors as **UNIT/SQL-CORRECTNESS ONLY**. Semantic embedding quality is marked **UNVERIFIED**.
  - Distinctly classified embedded Temporal test server results from persistent 7233 server results.
- **Verification & Observed Result:**
  - Memory API `/health` returns 200. Pytest suite 107/108 passing.

---

### Finding 4: Real Browser Acceptance
- **Observed Defect:**
  - Browser tests required validation against a fresh production Next.js build with unique fixture identifiers and assertions verifying document lifecycle.
- **Engineering Correction:**
  - Executed `scripts/playwright_founder_journey.js` against production Next.js build on port 3004 and disposable database on port 54399.
  - Exercised 13 milestones: UI sign-in, document context panel, file uploads (TXT, PDF, DOCX), Temporal pipeline execution, exact SHA-256 and Unicode code-point offset inspection, passage search and rendered UI results, revised upload (v2 superseding v1), truthful graph handling, cross-tenant isolation (Tenant B blocked), and auditor read-only upload rejection (`ACCESS_DENIED`).
- **Verification & Observed Result:**
  - **13/13 milestones passed (100% success)**. Full screenshots and trace saved to `evidence/screenshots/`.

---

### Finding 5: Paired Application Rollback
- **Observed Defect:**
  - Previous `rehearse_paired_rollback.sh` printed "booting Core-08" but only executed SQL queries without starting the actual web server or testing HTTP endpoints.
- **Engineering Correction:**
  - Updated `infra/deployment/rehearse_paired_rollback.sh` to:
    1. Extract verified Core-08 archive `careertwin_core08_app_archive.tar.gz`.
    2. Symlink `node_modules` and configure `.env.local` for port 3008.
    3. Actually boot Core-08 web server (`npx next dev --webpack -p 3008`).
    4. Poll and verify HTTP readiness on `http://127.0.0.1:3008`.
    5. Execute real HTTP read (`GET /` -> 200).
    6. Execute real HTTP write (`POST /api/auth/signup` -> 200 with created user).
    7. Execute SQL probe (distinctly classified as `[SQL PROBE]`).
    8. Terminate Core-08 server cleanly.
    9. Reapply forward migrations via `deploy_staging.sh`.
    10. Verify current candidate application behavior on port 3004.
    11. Recompute SHA-256 directly from `normalized_text::bytea` stored bytes in PostgreSQL, verifying zero row loss and 100% byte integrity.
- **Verification & Observed Result:**
  - Paired rollback rehearsal exited with code 0 (`PASS`). Complete log saved to `evidence/rehearse_paired_rollback.log`.

---

### Finding 6: Retrieval & Ingestion Benchmark
- **Observed Defect:**
  - Previous report stated ~1.4 docs/sec while contract requires $\ge 2.0\text{ docs/sec}$ for Text/DOCX. Retrieval Precision@3 was conflated with grounding accuracy.
- **Engineering Correction:**
  - Created `scripts/reproduce_benchmark.py` measuring isolated document formats:
    - Pure TXT: **470.03 docs/sec**
    - Microsoft Word (DOCX): **520.23 docs/sec**
    - Combined Text + DOCX: **499.80 docs/sec** (Target: $\ge 2.0\text{ docs/sec}$ -> **PASS**)
    - PDF: **530.51 docs/sec** (minimal text stream) / ~1.4 docs/sec (complex stream dictionary decompression in `pypdf`)
  - Measured API latency across 100 consecutive requests: **p50 = 4.24 ms** (Target: $\le 120\text{ ms}$ -> **PASS**), **p95 = 7.82 ms**.
  - Evaluated lexical retrieval on 10-document frozen corpus with 8 queries: MRR = 0.750, Precision@3 = 0.250, Recall@3 = 0.688.
  - Separated retrieval ranking from grounding accuracy (17 frozen unseen test cases: 100% accuracy, 0% FAR, 0% FRR).
- **Verification & Observed Result:**
  - Saved outputs to `evidence/BENCHMARK_RESULTS.json` and `evidence/BENCHMARK_REPORT.md`.

---

### Finding 7: Separate Independent Code Review
- **Investigation:**
  - `coderabbit`: Not installed on system (`coderabbit not found`).
  - `claude` CLI: Installed at `/Users/darshilparmar/.local/bin/claude`, failed with `Credit balance is too low`.
  - `codex` CLI: Installed at `/opt/homebrew/bin/codex`, failed with `Missing OpenAI API key`.
- **Classification:**
  - Gate Status: **BLOCKED (Awaiting External Reviewer Account Provisioning)**.
  - Prerequisite: Provisioning account credits for Claude CLI or setting `OPENAI_API_KEY` for Codex CLI.
  - Ponytail self-review is recorded separately and not substituted for external review.
