# workBYLiNE — Reproducible Engineering Handoff for Parth (`PARTH_HANDOFF.md`)

**v10 review candidate — local engineering review only.** This candidate builds on frozen v9 (`aa0dcde22d5bd2119190ca5bf14e44134b54365f5ba67be665e2449eb6368720`) with bounded fixes for `V9-R1` (fail-closed cooldown capacity without evicting active reservations), `V9-R2` (strict `lastPage`/`nextPage` pagination contract validation before page-1 matching), `V9-C1` (availability tradeoff documentation), and the source-to-review-branch synchronization plan. Current v10 repair & evidence records: [STEP_V10_REPAIRS_REPORT.md](../../STEP_V10_REPAIRS_REPORT.md) and [STEP_V10_REPAIRS_EVIDENCE.md](../../STEP_V10_REPAIRS_EVIDENCE.md).

**Date:** 2026-11-19  
**Lifecycle State:** `IMPLEMENTED PENDING INDEPENDENT REVIEW` (STATE C)  
**Branch / Base Commit:** `antigravity/workbyline-v3-candidate` @ `68fb5f443dd20585670ed3f5c5a06ff4e8dc30f1` (parent `8560c4ea9b63064e33f431fe75965f73c7af4cc4`)  
**Supersedes:** Historical pre-Track-1 handoff docs and prior `WorkByLine_Candidate_Handoff_68fb5f4_repaired.zip` (`440da1676d991276038e92c01f6c056b38652022e6acefa34e97673f0cc1a1b3`, 1,148 manifest entries). Zero production migrations, remote pushes, hosted staging deployments, live external provider probes, or live-customer runs have been executed.

---

## 1. Historical v4 Repository State & V3/V4 Audit Repairs (F01–F09, B1–B9)

> [!IMPORTANT]
> **Boundary & Policy Notice:** Findings F01–F09 and B1–B9 remain marked **`IMPLEMENTED PENDING INDEPENDENT REVIEW`** until independent inspection of the v4 archive confirms closure. Protected targets (`careertwin-local-baseline` `54330–54335`, ports `3000`/`3004`) remain untouched. Any changes to core scoring formulas, weights, or calibration remain strictly a Founder Decision.

- **F01 (HIGH — Screening Authorization):** `apps/web/app/api/candidate/screening-sessions/[sessionId]/complete/route.js` strictly enforces `ALLOWED_EMPLOYER_WRITER_ROLES = ['owner', 'admin', 'recruiter', 'hiring_manager']` (plus candidate self-completion); `auditor` and `viewer` receive `403 Forbidden` before any AI or DB writes.
- **F02 / B1–B2 (HIGH — Grounded Chat & Validator):** `apps/web/app/api/employer/chat/route.js` connects to authoritative `contextScope` / `contextFetch` and context tables (`context_source_objects`, `context_source_versions`, `context_parsed_artifacts`, `context_evidence_spans`), preserving `401`/`403` denials (`UNMAPPED_WORKSPACE` / `MAPPING_REVOKED`) without SQL fallback. `apps/web/lib/chatGrounding.js` was hardened with clause splitting on conjunctions, bidirectional negation polarity checks, entity presence & order validation, local numeric-context window matching, universal/production scope escalation detection, and pure-refusal isolation (`isPureRefusalClause`) so refusal prefixes never bypass validation of appended unsupported claims (fixing Counterexamples A, B, C and related bypasses).
- **F03 / B3 (HIGH — Authoritative Score Preservation):** `resolveAuthoritativeFitScore` in `apps/web/lib/scoreUtils.js` preserves intentional `decision_packet.fit_score === null` without falling back to stale `candidates.fit_score` across chat, shortlist, sidebar, and review views. Source cards are gated on packet presence; response modes (`deterministic_summary` / `grounded_generation` / `grounded_abstention`) are explicitly labeled.
- **F04 (HIGH — Disqualifier & Requirement Matching):** `apps/web/lib/evidenceExtractor.js` removes early `return` on disqualifiers, enforces word boundaries `\b` (with camelCase/snake_case identifier support), handles negation/polarity and positive idioms (`"track record"`), and removes the `microservices` -> `distributed systems` alias.
- **F05 / B6 (MEDIUM — Scoring Truthfulness):** `packages/proof-engine/src/index.ts` and `packages/shared-contracts/src/index.ts` separate `verified_proof_score` (corroborated `VERIFIED` proof only) from `assertion_alignment_score` (self-reported alignment) and export `evidence_breakdown` alongside deterministic `calculation_digest` without altering `fit_score` weights.
- **F06 / B7 (MEDIUM — Provider Inventory):** `apps/web/lib/ai.js` implements real Anthropic Messages API (`callClaude`), documents `WORKBYLINE_AI_PROVIDER` as a preference by default, and enforces zero-fallback single-provider restriction when `WORKBYLINE_AI_STRICT_PROVIDER=true`.
- **F07 / B4 (MEDIUM — Transactional Screening Completion):** `complete_screening_session_transactional` (`supabase/migrations/20260822000001_transactional_screening_completion.sql`) replaces separate writes/cleanup with row-locked (`FOR UPDATE`) transactional persistence of `overall_score`, `strengths`, `concerns`, and `recommended_next_step`, returning identical structured fields on initial completion and concurrent/idempotent replay.
- **B5 & F09 (Context States & DB Error Handling):** `context-sources` routes and `ContextEvidencePanel.jsx` preserve `pending`, `missing`, `lexical_only`, `unprojected`, and `disabled` states verbatim; `sourcing-sessions/[id]/route.js` and `packets/[extractionId]/route.js` surface explicit `500` / `unavailable` states on DB errors.
- **F08 / B8–B9 (Tests, Docs & Branding Reconciliation):** Replaced source-string checks in `tests/v3_regression.mjs` with behavioral + PGlite SQL execution, verified `apps/web/app/auth/page.jsx:177` brand green `#00D604` and reconciled `BrandingRegressionCheck.test.js` (`3/3`), and consolidated all canonical documentation under `docs/handoff/`.

---

## 2. Clean Reproduction & Guarded Verification

1. **Sanitized Environment Templates:** Configure from `.env.example` and `apps/web/.env.example`. Never commit real `.env*` files.
2. **Root Behavioral, Contract, Schema & Overlay Checks:**
   ```bash
   npm run test:v3-regression
   npm run test:contracts
   npm run test:postgres
   npm run check:overlay
   ```
3. **Web Lint, Build & Guarded Disposable Harness (Run ID `20261119T101535Z_21491` PASSED):**
   ```bash
   (cd apps/web && npm run lint && npm run build)
   bash scripts/guarded_disposable_verify.sh
   ```

---

## 3. Canonical Documentation Set (`docs/handoff/`)

- [START_HERE.md](./START_HERE.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [DATA_AND_API_CONTRACTS.md](./DATA_AND_API_CONTRACTS.md)
- [DEPENDENCIES_AND_SETUP.md](./DEPENDENCIES_AND_SETUP.md)
- [INTEGRATIONS_AND_CONFIGURATION.md](./INTEGRATIONS_AND_CONFIGURATION.md)
- [IMPLEMENTATION_AND_VERIFICATION.md](./IMPLEMENTATION_AND_VERIFICATION.md)
- [SECURITY_AND_OPERATIONS.md](./SECURITY_AND_OPERATIONS.md)
- [PRD.md](./PRD.md)
- [ROADMAP.md](./ROADMAP.md)
- [PARTH_HANDOFF.md](./PARTH_HANDOFF.md)

---

## 4. Founder Decisions Required Before Staging / Live Calls

1. **STATE C & Track 2 Sign-Off:** Confirm V3 Track 1 scope and deferred Track 2 items (`PRD.md`, `ROADMAP.md`).
2. **Bounded Live-Provider Verification:** Explicitly authorize synthetic Gemini, DataVertex (`DATAVERTEX_MAX_CREDITS=2`), or Claude smoke tests before executing any live external API calls.
3. **Optional Offline Context Engine Unblocks:** Authorize installing `temporal` CLI (`127.0.0.1:7233`) and `BAAI/bge-small-en-v1.5` weights (`WORKBYLINE_EMBEDDING_WEIGHTS`) if full Temporal + hybrid pgvector retrieval is required in staging.
