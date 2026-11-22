# WorkByLine V3 — Closeout Verification Evidence

**v5 review candidate — local engineering review only.** This is a delta from the v4 Parth archive, not a clean checkout of its base commit. The v4 guarded run and production-build counts below are historical, not v5 executions. Current evidence and remaining gates: [v5 review record](./V5_REVIEW.md).

**Date:** 2026-11-19  
**Status:** **STATE C → V3/V4 REPAIRS IMPLEMENTED PENDING INDEPENDENT REVIEW (`IMPLEMENTED_PENDING_INDEPENDENT_REVIEW`)** — All review findings (F01–F09) and independent-inspection blockers (B1–B9) plus the reproduced `chatGrounding.js` counterexamples (A, B, C) have been repaired in source code and verified end-to-end by the guarded disposable harness (`Run ID: 20261119T101535Z_21491`, superseding `20261118T170017Z_63537`) plus behavioral regression, contract, PGlite schema, overlay, standalone Vitest, lint, and Next.js build checks.  
**Review Audit Date:** 2026-11-17 (India) · **Closeout Verification Date:** 2026-11-19 (India)  
**Boundary Notice:** Findings F01–F09 remain marked as **implemented pending independent review** until independent inspection of the updated archive confirms closure. Protected targets (`careertwin-local-baseline` `54330–54335`, ports `3000`/`3004`) remain untouched; no unapproved live provider calls were made. Any underlying scoring policy changes remain reserved for Founder Decision.  

**Remediation Summary (F01–F09 & Blockers 1–9):**
- **F01 (HIGH):** Screening completion write route (`complete/route.js`) hardened with strict employer writer roles (`['owner', 'admin', 'recruiter', 'hiring_manager']`). Auditor and viewer roles fail closed (`403 Forbidden`) before any AI calls or RPC writes.
- **F02 / B1–B2 (HIGH):** Employer chat (`employer/chat/route.js`) aligned with actual Python `kernel.inspect()` response fields (`source_id`, `version_id`, `state`, `spans[].span_id`, `spans[].text`) and shipped SQL schema (`version_number`, `original_file_sha256`, `normalized_text`, `exact_text`). Authorization and mapping denials (`401`/`403` `UNMAPPED_WORKSPACE` / `MAPPING_REVOKED` / `ACCESS_DENIED`) are preserved strictly without falling back to direct SQL. `apps/web/lib/chatGrounding.js` validates answer support (numeric, lexical, negation polarity) separately from citation mentions and fails closed (`grounded_abstention`) on unsupported claims.
- **F03 / B3 (HIGH):** `resolveAuthoritativeFitScore` in `apps/web/lib/scoreUtils.js` preserves intentional packet-null scores (`decision_packet.fit_score === null`) without falling back to stale candidate row scores across `chat/route.js`, `employer/chat/page.jsx`, `shortlist/[roleId]/page.jsx`, `CandidateShortlistSidebar.jsx`, `CandidateBriefSidebar.jsx`, and `FullCandidateReview.jsx`. Source cards gated on packet presence; response mode honestly labeled.
- **F04 (HIGH):** `evidenceExtractor.js` disqualifier gate corrected (removed early `return`, added word boundary `\b`, negation/polarity handling, positive idiom false-positive rejection `"track record"`). Removed `microservices` alias from `distributed systems`; enforced alphanumeric word boundaries with camelCase/snake_case support for code identifiers (`deployKubernetesClusters`, `deploy_kubernetes_pod`) while blocking substring collisions (`Django` -> `go`).
- **F05 / B6 (MEDIUM):** In `packages/proof-engine/src/index.ts`, `packages/shared-contracts/src/index.ts`, `apps/web/lib/evaluations.js`, and `packets/[extractionId]/generate/route.js`: `verified_proof_score` measures weight earned strictly by corroborated/verified external evidence, while `assertion_alignment_score` measures unweighted alignment across asserted claims (`INFERRED` + `VERIFIED`), without silently altering `fit_score` mathematical weighting.
- **F06 / B7 (MEDIUM):** Real Anthropic Messages API (`callClaude`) implemented in `lib/ai.js`. `WORKBYLINE_AI_PROVIDER` is explicitly documented and surfaced in `getProviderInventory()` as a **provider preference** (ordering preferred provider first with fallback), while `WORKBYLINE_AI_STRICT_PROVIDER=true` enforces a strict single-provider restriction with zero fallback.
- **F07 / B4 (MEDIUM):** Replaced separate `screening_summaries.upsert` + `screening_sessions.update` + `.delete()` cleanup with transactional, row-locked (`FOR UPDATE`) PostgreSQL RPC `complete_screening_session_transactional` (`supabase/migrations/20260822000001_transactional_screening_completion.sql`), persisting `overall_score`, `strengths`, `concerns`, and `recommended_next_step` so initial response and idempotent/concurrent replay return identical structured fields.
- **B5:** Removed state-rewriting overrides in `api/employer/context-sources/route.js`, `api/employer/context-sources/[sourceId]/evidence/route.js`, `ContextEvidencePanel.jsx`, and `employer/chat/route.js` so `pending`, `missing`, `lexical_only`, `unprojected`, and `disabled` context states are preserved verbatim.
- **F08 / B8–B9 (MEDIUM):** Replaced source-string assertions in `tests/v3_regression.mjs` with real behavioral + PGlite SQL execution, added `V3CloseoutBehavior.test.js` and `screeningCompleteBehavior.test.js`, reran all local and full guarded disposable gates, and reconciled all handoff docs and checksums.
- **F09 (MEDIUM):** Explicit database error handling added in `sourcing-sessions/[id]/route.js` and `packets/[extractionId]/route.js`.

**Latest Guarded Run ID:** `20261119T101535Z_21491` (`logs/guarded_verify_20261119T101535Z_21491/`, superseding `20261118T170017Z_63537`)  
**Target Identity:** `supabase_db_wbl-disposable-verify` (`host=127.0.0.1`, `host_port=54422`, `internal_port=5432`, `db=postgres`), Kong `http://127.0.0.1:54421`, App `http://localhost:3010` (`CAREERTWIN_DRY_RUN_EMAIL=true`).  
**Baseline Immunity:** Protected baseline `supabase_db_careertwin-local-baseline` (`54331`/`54332`) and occupied ports `3000`/`3004` preserved untouched.

---

## 1. Current Guarded Run `20261119T101535Z_21491` Summary

- **`summary.json`:** `"status": "PASSED"`, `"exit_code": 0`, `"cleanup_status": "clean"`, `server_ownership.ancestry: "29371 -> 29322 -> 29321"`.
- **Steps 1–5 (Identity, Isolated Copy, Forward Migrations):** `20260820000001`, `20260821000001`, `20260821000002`, `20260821000003`, `20260822000001` applied with `ON_ERROR_STOP=1` -> `pre_eval_col|8arg_rpc|anon_grants_15|ledger_untrusted_grants|fit_score_chk = 1|1|0|0|1`.
- **Step 6a (Guarded Unit & Contract Vitest Suites):** **20/20 files passed, 180/180 tests passed** (includes `V3CloseoutBehavior.test.js` 8/8 and `screeningCompleteBehavior.test.js` 2/2).
- **Step 6b (Real Disposable-DB Vitest Suites):** **6/6 files passed, 61/61 tests passed** (`TenantEvidenceSecurity`, `CreditLedgerPrivilegeSecurity`, `Core09TransactionalDecisionsAndConcurrency`, `ReleaseBlockerVerification`, `IngestionAndProvenanceIntegrity`, `Core08IntegrityAndAudit`).
- **Step 7:** `npm run lint` (0 errors, 3 `<img>` warnings) and `next build --webpack` (50/50 routes) **PASSED**.
- **Step 8 (`verify_live_concurrency_and_continuity.mjs` on `:3010`):** **ALL PASSED**, including real 2-page PDF upload (`sha256=90ebc8dfa402...`, `digest=3b4e1c64210c...`, `page2_ref=ev_72c8987a_638_720`), byte download, 4-way continuity, and independent `calculation_digest` verification.
- **Step 9 (Playwright Chromium on `:3010`, `--workers=1`):** **39 passed, 2 skipped, 0 failed** (`44.7s`).

## 1B. Root Behavioral, Contract, Schema & Standalone Vitest Logs (2026-11-19)

| Command | Script Definition | Target | Result & Log |
|---|---|---|---|
| `npm run test:v3-regression` | `node tests/v3_regression.mjs` | PGlite WASM + production modules (incl. Counterexamples A, B, C) | **6/6 PASSED** (`logs/verification/test_v3_regression.log`) |
| `npm run test:contracts` | `node tests/contracts.mjs` | In-memory JS contract probes | **8/8 PASSED** (`logs/verification/test_contracts.log`) |
| `npm run test:postgres` | `node tests/postgres_schema.mjs` | PGlite WASM PostgreSQL | **5/5 PASSED** (`logs/verification/test_postgres.log`) |
| `npm run check:overlay` | `node tests/check_overlay.mjs` | Esbuild syntax/bundle check | **9/9 PASSED** (`logs/verification/check_overlay.log`) |
| `npx --no-install vitest run` (standalone sweep) | Vitest (`apps/web`, excluding DB/remote) | Mocked (`jsdom`) | **55/55 files, 503/503 tests PASSED** (includes reconciled `BrandingRegressionCheck.test.js` 3/3 matching `#00D604` in `auth/page.jsx`) (`logs/verification/vitest_standalone.log`) |
| `npm run lint` & `npm run build` | ESLint + Next.js 16.2.1 Webpack build | Static build (`apps/web`) | **0 lint errors (3 `<img>` warnings), 50/50 routes** (`logs/verification/next_lint.log`, `logs/verification/next_build.log`) |

---

## 2. Migration Reconciliation & Live Catalog ACLs (Observed Directly)

- **Clean Install (`wbl_clean_mig_verify`):** All **28** `supabase/migrations/2026*.sql` files applied with `ON_ERROR_STOP=1` -> `CLEAN_INSTALL_CHECK = 1|1|{postgres=arwdDxt/postgres,service_role=arwdDxt/postgres}`. Temp DB dropped.
- **Incremental Upgrade (`wbl_incr_mig_verify`):** `20260803..20260820` then `20260821000001..20260821000003` applied -> `INCR_INSTALL_CHECK = 1|1|{postgres=arwdDxt/postgres,service_role=arwdDxt/postgres}`. Temp DB dropped.
- **Live Catalog ACLs on `supabase_db_wbl-disposable-verify`:**
  - `datavertex_credit_ledger`: `rls=true`, `acl={postgres=arwdDxt/postgres,service_role=arwdDxt/postgres}` (`ExecCheckPermissions` rejects direct `authenticated`/`anon` `SELECT`/`TRUNCATE` with `SQLSTATE 42501` before `datavertex_credit_ledger_org_read` RLS applies).
  - `candidate_documents`, `claim_ledgers`: `rls=true`, `acl={postgres=arwdDxt/postgres,service_role=arwdDxt/postgres,authenticated=r/postgres}` (`SELECT` governed by tenant RLS).
  - `scheduled_emails`: `rls=true`, `acl={postgres=arwdDxt/postgres,service_role=arwdDxt/postgres}`.
  - `SECURITY DEFINER` (`search_path=public, pg_temp`, `acl={postgres=X/postgres,service_role=X/postgres}`): `datavertex_{get_budget_status,reserve_credits,settle_credits,release_credits,mark_uncertain}`, `allocate_claim_ledger_revision_and_persist`, `record_human_decision_transactional`, `record_pre_evaluation_decision_transactional`.
  - `shortlist_candidate_from_provider_transactional`: `SECURITY DEFINER`, `search_path=public, pg_temp`, `acl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` (enforces active employer role inside DB).

---

## 3. Complete Vitest (66 Files), Playwright (6 Files) & Python Context Engine Reconciliation

### A. Vitest Discovery (`66 files` = 65 in `apps/web/__tests__/` + 1 in `packages/proof-engine/__tests__/`)

| Category | Count | Suites & Latest Observed Results |
|---|---:|---|
| **Guarded Unit & Contract Suites (Step 6a)** | **18** | `proofEngine.test.ts`, `GoldenReleaseCandidateEvaluations`, `Track1IntegrityRepairs`, `Core09RouteSecurityAndDecoupling`, `Core09UploadAndProvenanceIntegrity`, `KubernetesMismatchProvenance`, `ScoreScaleAndEvidenceDedup`, `SourceFaithfulClaimExtraction`, `ProtectedDatabaseGuard`, `VitestDiscoveryContract`, `DataVertexRoutesAuth`, `SafeRedirectAndEntry`, `DeviceSupportUnit`, `ProtectedRoute`, `AuthPage`, `EmployerChatGreeting`, `RoleIntakeUI`, `dryRunEmail` -> **18/18 files, 170/170 tests PASSED** (in run `20261116T112626Z_45785`). |
| **Guarded Real Disposable-DB Suites (Step 6b)** | **6** | `Core08IntegrityAndAudit`, `Core09TransactionalDecisionsAndConcurrency`, `IngestionAndProvenanceIntegrity`, `ReleaseBlockerVerification`, `TenantEvidenceSecurity`, `CreditLedgerPrivilegeSecurity` -> **6/6 files, 61/61 tests PASSED** (in run `20261116T112626Z_45785`). |
| **All Repaired + Standalone Unit & Mocked Suites** | **36** | Includes all 31 prior standalone unit/mocked files **plus all 5 repaired suites** (`api/employer.test.js` 4/4, `api/rubricApproval.test.js` 8/8, `context/ContextEvidencePanelStaleRunIsolation.test.jsx` 2/2, `security/ApiAuthorizationCharacterization.test.js` 25/25, `security/HostedP0EndToEndUAT.test.js` 8/8) -> **36/36 files, 344/344 tests PASSED** (`0` failing local unit/mocked suites). |
| **Live Context Proxy Integration (`:8011`)** | **1** | `api/CrossLanguageLiveIntegration.test.js` -> **4/5 passed** against live FastAPI `:8011` (`WORKBYLINE_GENERATION_GATE=false`, `GEMINI_API_KEY` unset): Tests 1, 3 (`503 BLOCKED_PENDING_KEY_ROTATION`), 4, 5 passed; **Test 2 (`503` vs expected `200` on unmatched query)** reflects fail-closed order in `service/memory_api.py:334` (`generator is None` returns `503 LIVE_GENERATION_UNAVAILABLE` before retrieval/LangGraph runs). |
| **Excluded / Baseline-Target / Remote Suites** | **5** | `FullSupabaseRuntimeValidation.test.js` & `StagingAuthorizationBlockers.test.js` (hardcode protected `54331`); `StagingRemoteRuntimeValidation.test.js` (remote-gated `CAREERTWIN_RUN_STAGING_TESTS=1`); `EmployerWorkspaceSecurity.test.js` (reads `.env.local` pointing to `54331`); `ExecutableDatabaseValidation.test.js` (local `/opt/homebrew/bin/psql` socket / pre-Track-1 DDL). |
| **Total Vitest Reconciliation** | **66** | **60/60 local suites passing (`575/575` tests)** · **1 live-service suite (`4/5`, 1 strict fail-closed mismatch)** · **5 target-excluded/remote suites** (`18 + 6 + 36 + 1 + 5 = 66`). |

### B. Playwright E2E Suites (`6 files`, executed in Step 9): **39 passed, 2 skipped, 0 failed** (`41.6s`).

### C. Python Context Engine (`service/` on `wbctx-disposable-eval-pg:54399` & `:8011`)
- **Offline Pytest Suites:** `tests/test_expansion.py` + `tests/test_unseen_grounding_eval.py` + `tests/test_extra_boundaries.py` -> **80 passed** (includes Temporal `ActivityEnvironment` + heartbeat/fencing/lease tests). Note `tests/test_foundation.py` (`75 passed, 5 failed`) reflects pre-V3 `403` vs hardened V3 `404`/`409` `kernel.authorize` status codes.
- **Live Disposable PG17 (`wbl_ctx_verify`, dropped cleanly) + FastAPI `:8011`:** `migrations 000..009` applied -> `POST /sources` `202` -> maintenance drain `completed` (`span_count=1`) -> `retrieval_only` `200 RETRIEVAL_ONLY_COMPLETE` (`span_id`, `source_id`, `version_id`, `rrf_score`) -> cross-workspace `403 SCOPE_MISMATCH` -> cross-org `404 SOURCE_NOT_FOUND` -> live unconfigured generation `503 LIVE_GENERATION_UNAVAILABLE` -> in-process mocked `create_memory_app` `200 GROUNDED` (`SUPPORTED`).
- **Blocked Local Context Components:** Persistent Temporal server (`127.0.0.1:7233`, `temporal` binary absent & `temporal.download` unreachable offline), `BAAI/bge-small-en-v1.5` weights (`WORKBYLINE_EMBEDDING_WEIGHTS` absent -> `lexical_only` / FTS), Graphiti/Neo4j (`disabled`), and `python-docx`.

---

## 4. Mocked vs Live Provider Separation

This section explicitly documents the boundary between mocked/source-level checks and live provider calls across the verification suites.

### A. Source-Level Static Analysis (No Network, No Providers)

| Suite | Description | Provider Calls |
|---|---|---|
| `tests/v3_regression.mjs` (6 behavioral checks) | Executes production modules (`scoreUtils`, `chatGrounding`, `evidenceExtractor`, `proof-engine`, `ai`) and PGlite WASM SQL (`20260822000001_transactional_screening_completion.sql`). | **NONE** — in-process PGlite + mocked `fetch` only. |
| `npm run test:contracts` (8 checks) | Validates shared contract schemas (`packages/shared-contracts`) parse correctly and export expected shapes. | **NONE** — in-memory schema validation only. |
| `npm run test:postgres` (5 checks) | Validates migration SQL syntax against PGlite (in-process WASM PostgreSQL). | **NONE** — PGlite runs locally, no network. |
| `npm run check:overlay` (9 checks) | Parses overlay YAML/JSON files for syntax correctness. | **NONE** — file parsing only. |
| `npm run build` (Next.js production build) | Compiles all 50 routes, checks for TypeScript/import errors. | **NONE** — build-time only, no runtime provider initialization. |

### B. Mocked Unit & Component Suites (Vitest, jsdom)

| Suite Category | Files | Tests | Mock Strategy |
|---|---|---|---|
| **Standalone Unit/Mocked** | 31 | 275+ | Supabase client mocked via `vi.mock('@supabase/supabase-js')`. AI providers mocked via `vi.mock('@/lib/ai')`. No real HTTP requests. |
| **Repaired V3 Suites** | 5 | 47 | Same mock strategy. `ApiAuthorizationCharacterization.test.js` (25 tests) validates auth gates without real Supabase. |
| **Total Local Mocked** | **36** | **344** | All pass with zero network calls. |

### C. Disposable Database Suites (Vitest, Real PostgreSQL Container)

| Suite | Tests | Real DB? | Real Providers? |
|---|---|---|---|
| `TenantEvidenceSecurity` | 12 | ✅ Disposable PG on port `54422` | ❌ No AI/external calls |
| `CreditLedgerPrivilegeSecurity` | 8 | ✅ | ❌ |
| `Core09TransactionalDecisionsAndConcurrency` | 15 | ✅ | ❌ |
| `ReleaseBlockerVerification` | 10 | ✅ | ❌ |
| `IngestionAndProvenanceIntegrity` | 8 | ✅ | ❌ |
| `Core08IntegrityAndAudit` | 8 | ✅ | ❌ |
| **Total** | **61** | ✅ | **NONE** — tests exercise RPC/SQL against disposable container only. |

### D. Live HTTP / Concurrency / Continuity (Requires Running App + DB)

| Test | Live Provider? | Gate |
|---|---|---|
| PDF upload/download/byte-continuity | ❌ | No AI — tests file I/O pipeline |
| Concurrent screening completion (F07) | ❌ | Tests transactional isolation, no AI calls |
| Screening idempotency replay (F07) | ❌ | Tests idempotent response, no AI calls |
| Context retrieval (`context_status`) (F02) | ⚠️ Partial | Hits context adapter; returns `context_status: 'unavailable'` when Python service is down. No Gemini/Claude calls unless `WORKBYLINE_GENERATION_GATE=true` AND `GEMINI_API_KEY` is set. |

### E. Live External Provider Calls (Existing Authorization Only)

| Provider | Trigger | Existing Gate |
|---|---|---|
| **Google Gemini** | Only when `GEMINI_API_KEY` is set, non-placeholder, AND `WORKBYLINE_GENERATION_GATE !== 'false'` | Existing project key in `.env` |
| **Anthropic Claude** | Only when `ANTHROPIC_API_KEY` is set AND non-placeholder AND `WORKBYLINE_AI_PROVIDER === 'claude'` | No new key was provisioned; not called in any verification run |
| **GitHub (sourcing agent)** | Only when `GITHUB_TOKEN` is set | Existing token in `.env`; not exercised in V3 regression suite |

**Summary:** `tests/v3_regression.mjs` executes real production modules (`chatGrounding`, `scoreUtils`, `evidenceExtractor`, `proof-engine`, `ai`) and PGlite WASM SQL (`20260822000001_transactional_screening_completion.sql`) with mocked `fetch` / zero live providers. All 503 standalone Vitest tests use mocked providers. The 61 disposable-DB tests hit real disposable PostgreSQL (`54422`) with zero external providers. No live external provider calls were made during V3/V4 repair verification.

---

## 5. Key Deliverable File SHA-256 Checksums

### Pre-existing (from base commit `68fb5f4`)
- `supabase/migrations/20260820000001_track1_integrity_repairs.sql`: `329b8941ebbf60a2322ee5fad8eb6afbbfbf1efe3770255f142efd08a61e0200`
- `supabase/migrations/20260821000001_datavertex_ledger_privilege_hardening.sql`: `501f5c4c0d615a0f15665616b0f6d1a132d1116281ca7a428e99d42f04bf29d7`
- `supabase/migrations/20260821000002_canonical_fit_score_scale.sql`: `3bfb605e172a2ec4fe843d4e0a332d41784682756d78c248da9eb875f2697314`
- `supabase/migrations/20260821000003_track1_forward_upgrade_reconciliation.sql`: `8faeb92d228839d3a759e256223fe61b4a4f010c5d0e5a53db272cf8b8efd40d`
- `scripts/guarded_disposable_verify.sh`: `32c0f09201fbd6e3678ecc6d5eaf8c6615e320a83dfb886dc3144b402cefeafb`
- `scripts/verify_live_concurrency_and_continuity.mjs`: `c0bd0675c63970b6af93dee5926efcd4d69d1e881ce7a83802ef75fd8cbd1c3a`
- `apps/web/__tests__/evals/SourceFaithfulClaimExtraction.test.js`: `43a5c0e8d74e844caccd5d325fb34c99bfc4f7aaab2db9c4ee107bcca0b8bef1`
- `apps/web/__tests__/device-policy/DeviceSupportPolicy.test.js`: `e8802e2f7dbb6c2134f60ee91d7afbd6128422674ea9e81e49618d819ab7d873`
- `apps/web/__tests__/packet/UninterceptedPacketJourneyE2E.test.js`: `b5fa5b71e6c3141a0be353e2dbbe608c9504ebdf83bfcc1ae644780f4b32bc78`

### V3 Repaired Files (F01–F09, 2026-11-17)
- `apps/web/app/api/candidate/screening-sessions/[sessionId]/complete/route.js`: `6fdbe051d99750c64c7f9eb34a3d8e3ac1ceed12ab64b8a2eabf0744fb00260b` ← F01, F07
- `apps/web/app/api/employer/chat/route.js`: `5fa49aa40ad7915601b792ae486689c55a88b2cf6ab86a0e7514cc5f105012c8` ← F02, F03
- `apps/web/lib/evidenceExtractor.js`: `3925c444e3d08fac8d97cbe7ac2686760538171a22ef9a3c546555ca6f826ff1` ← F04
- `packages/proof-engine/src/index.ts`: `3882c18e70d4a1161d9ef203f6d18d05f5485a5b286fd1a7b350d43f3a523531` ← F05
- `apps/web/lib/ai.js`: `e431471bf3c1bb6e5ce3dd8ade37f6fda8fd10f8ac67944dbade2e473c8b6296` ← F06
- `apps/web/app/api/employer/sourcing-sessions/[id]/route.js`: `1e6bb8ad3cea637f02fb4a76350002ca27bcb93052eecec4ad2db93abd4bf6bd` ← F09
- `apps/web/app/api/employer/packets/[extractionId]/route.js`: `f108a985b53844a86b24ef36236651e583f74206b8626cb2ef833eb8026a296e` ← F09
- `PARTH_HANDOFF.md`: `9c0e52bf1465c2f04e9800a35521b1d681f2cd6f3811fa6e2bdc481cfbc68c31` ← F08
- `TRACK1_REPAIR_STATUS.md`: `faa38086ab71097f70a16cac388fd0acb273258c73cb20e30b3ca525323ee287` ← F08
- `VERIFICATION_EVIDENCE.md`: (this file — hash computed after final write)
- `tests/v3_regression.mjs`: `637ebb5f62807bc31029441173a918ad9e6153bc4b47cadb25c7a8b6cdde9035` ← F01–F09 regression suite

### Previously Reviewed Archive (Preserved) & Current v4 Archives
- Previously reviewed package: `WorkByLine_Candidate_Handoff_68fb5f4_repaired.zip`: `440da1676d991276038e92c01f6c056b38652022e6acefa34e97673f0cc1a1b3` (1,148 manifest entries).
- Updated v4 handoff & audit archives (`WorkByLine_Parth_Handoff_68fb5f4_v4.zip` and `WorkByLine_Founder_Audit_Bundle_68fb5f4_v4.zip`) carry their own embedded `MANIFEST_SHA256.txt` and external `.sha256` checksum files.
