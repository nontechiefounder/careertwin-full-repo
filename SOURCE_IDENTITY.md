# WorkByLine V3 Release Candidate — Source Identity Record

**Generated:** 2026-10-31T06:00:00Z  
**Release Name:** WorkByLine V3 Release Candidate  
**Branch:** `antigravity/workbyline-v3-candidate`  
**Parent Checkpoint:** `870e3d283cdca2a2604fe626283ed780b635253b` (descended from `1f40f9f`, `f41e503`, `fae79cb`, and `c9201ea`)  
**Frozen Baseline:** `84d9712` (Preserved without modification)  
**Historical Rollback Baseline:** `5f1b851` / `3f098cad` (`rollback/careertwin_core08_app_archive.tar.gz`)  
**Status:** Acceptance gap closure verified across:
- **116/116 Python tests** (`evidence/pytest.xml`, `logs/verification/pytest_suite.log`) on live disposable PostgreSQL 17 (`127.0.0.1:54399/disposable_v3_db`). Console output matches JUnit XML from the exact same invocation.
- **15/15 deployment & target-guard defect checks** (`logs/verification/script_defects_suite.log`) with 0 BLOCKED and 0 FAILED.
- **Reference backend inference verification** (`logs/verification/bge_reference_verification.log`): `LocalBGEEmbedder` using `SentenceTransformers` PyTorch backend verified with 0.999988 cosine similarity against HuggingFace reference.
- **8/8 persistent multi-process local runtime scenarios** (`evidence/persistent_runtime_acceptance.json`, `logs/verification/persistent_runtime_acceptance.log`): persistent Temporal (`7233`), continuous Dispatcher, continuous Worker (`SIGKILL` process interruption and launcher recovery across both parsing and indexing), API (`8011`), durable cancellation (`state = 'cancelled'`), single-session advisory-locked migrations (`000`–`008`), durable erasure recovery, `sentence_transformers` inference backend recorded in `wbctx_span_embeddings`, and terminal-workflow retry recovery across UI/API/Temporal with stage idempotency (zero duplicate spans/artifacts).
- **12/12 authenticated Playwright browser acceptance journeys** (`evidence/browser_acceptance/browser_acceptance_report.json`, screenshots `01`–`05`, `trace.zip`, `logs/verification/browser_acceptance.log`): authentic login, disclaimer banner, multi-format upload, same-filename disambiguation, revision + history inspection, partial batch failure + retry, lost response idempotent replay, subsystem status badges, dense+lexical hybrid search with RRF scores + honest 503 notices for gated modes, document revocation + search exclusion (including historical timestamp query verification), held in-flight run switching isolation (`in_flight_request_triggered=true`), and multi-role auditor read-only + cross-tenant denial.
- **DataVertex Live Candidate Sourcing & Durable Credit Ledger**:
  - Full server-side adapter (`apps/web/lib/datavertex/client.js`) and routes (`/api/employer/datavertex/*`) enforcing atomic credit reservation via `datavertex_reserve_credits` RPC before paid calls, strict 20-credit hard ceiling across processes, conservative retention of uncertain charges on timeout, request deduplication, in-memory caching, 15s timeout with `UNCERTAIN_PROVIDER_STATUS`, and disabled contact reveals.
  - Strict filter validation against official DataVertex documentation: unaccepted `skills` key is stripped from `search_criteria` and transferred cleanly to `free_text_search`.
  - Explicit lookup failure handling surfaces `full_profile_unavailable: true` and displays *"Full profile unavailable; showing search summary."*
  - Strict RBAC: uses `membership_role`, validates `membership_status === 'active'`, rejects auditors with 403 `AUDITOR_READ_ONLY`, and enforces permitted employer roles `['owner', 'admin', 'recruiter', 'hiring_manager']`.
  - Transactional shortlist creation via `public.shortlist_candidate_from_provider_transactional` RPC with concurrency-safe partial unique indexes and atomic insertion into `candidate_profiles` and `candidates` (`status = 'sourced'`, zero ungrounded scoring).
  - Shortlist evaluation metrics exclude unverified sourced profiles from `evaluations_completed`, correctly incrementing `pending_evaluation`.
- **Runtime & Retry Lifecycle Repairs**:
  - `service/hybrid.py`: Automatic success after transient indexing failure repairs `job.state = 'completed'` and `job.error = None`.
  - `service/core.py`: In `reprocess_version`, rejects retry when parsing, indexing, or projection is actively owned (`409 INDEXING_ALREADY_ACTIVE`, `409 PROJECTION_ALREADY_ACTIVE`); rejects ordinary retry on deliberately cancelled versions unless authorized resume (`409 VERSION_CANCELLED`).
  - `infra/scripts/launch_workbyline_v3.sh`: Removed fallback delegation signing secrets from runtime paths (requires explicit >=32 char secret in environment), defaulted artificial delays to `0.0`, and enforces explicit local Temporal addresses.
- **Evidence Sanitization Verified**:
  - Playwright browser acceptance `trace.zip` and verification logs sanitized of all raw JWTs, tokens, and cookies (453 sensitive tokens redacted; verified 0 remaining JWT tokens).
- **Full Frontend Web Test Suite & Production Build**: 59 Vitest test suites (587 tests) verified; production Next.js build compiled 44 routes with zero compile or typing errors.
- **Audit Findings 7.A through 7.F Resolved**: Timestamp contracts reconciled between ISO strings and float seconds; authentic Next.js navigation in browser acceptance; sanitized `trace.zip` retained in packaging; stage-idempotent retry lifecycle; zero default delays.
- **Zero mutations to protected database port 54332** confirmed.
- **Coordinated PostgreSQL + storage backup/restore rehearsal** (`evidence/backup_restore_rehearsal.json`, `logs/verification/backup_restore_rehearsal.log`).
- External hosted providers — Graphiti (`WORKBYLINE_GRAPH_ENABLED=false`) and live Gemini API generation (`WORKBYLINE_GENERATION_GATE=false`) — remain `CONFIGURED / GATED — NOT EXECUTED` (fail-closed `503` verified).

---

## 1. Worktree & Environment Safeguards
- **Worktree Root:** `/Users/darshilparmar/Desktop/Genome/careertwin-v2-memory-expansion-worktree`
- **Database on Port 54332:** Strictly protected baseline database (`supabase_db_careertwin-local-baseline`). Read-only, zero destructive mutations.
- **Disposable Verification Database:** Isolated PostgreSQL 17 + `pgvector` container on `127.0.0.1:54399` (`disposable_v3_db`).
- **External Communications:** `CAREERTWIN_DRY_RUN_EMAIL=true` strictly maintained across all configurations.
- **Remote Push / Deployment:** Zero remote pushes, zero hosted deployments, zero unapproved external handoffs.
- **Held Scope:** 100 Technical/IP Specifications, OpenFGA, Nango, MinerU, and RAG-Anything replacement remain **ON HOLD**.

---

## 2. Engineering Guidance & Standards
The implementation strictly adheres to:
- **Ponytail / ponytail-review:** Installed at `/Users/darshilparmar/.gemini/config/plugins/ponytail/skills/ponytail/` (Minimal surgical diffs, YAGNI, eliminating bloat, exact root-cause repairs across connected callers).
- **Project-Local Launch Closeout Skill:** `.agent/skills/workbyline-launch-closeout/SKILL.md` (Exact source identity, unified findings ledger, separated verification levels, zero fabricated fallbacks).
- **Phase Boundary Protocols:** Existing safeguards remain active; validation, permissions, and feature gates remain fail-closed.

---

## 3. Package Export & Provenance Tracking
- **Packaging Script:** `scripts/package_v3_candidate.py`
- **Manifest Generation:** Mechanically computes SHA-256 for all included candidate files and writes `MANIFEST_SHA256.txt` into the archive.
- **Archive Naming Convention:** `WorkByLine_V3_Implementation_Candidate_<source-commit>.zip`
- **Included Rollback Archive:** `rollback/careertwin_core08_app_archive.tar.gz` (`878,617` bytes) included for standalone rollback rehearsal from the extracted archive.
- **Exclusions:** `.git` pointer/directory, populated environment files, credentials, private candidate data, `.venv/`, `node_modules/`, build outputs, and runtime caches.
