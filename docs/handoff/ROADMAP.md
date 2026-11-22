# Engineering & Cutover Roadmap (`ROADMAP.md`)

**v5 review candidate — local engineering review only.** This is a delta from the v4 Parth archive, not a clean checkout of its base commit. The v4 guarded run and production-build counts below are historical, not v5 executions. Current evidence and remaining gates: [v5 review record](../../V5_REVIEW.md).

**Lifecycle Status:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`

---

## Phase 1 — Independent Technical Review Closure (Current Gate)
- **Objective:** Independent reviewer verifies the v4 handoff archive (`WorkByLine_Parth_Handoff_68fb5f4_v4.zip`), SHA-256 manifest, diff from `68fb5f4`, reconciled documentation, and fresh guarded disposable verification evidence.
- **Exit Criteria:** F01–F09 and B1–B9 confirmed closed under independent inspection, including Counterexamples A, B, and C in `apps/web/lib/chatGrounding.js`.

## Phase 2 — Founder Decision Gates (Before Staging/Live Calls)
1. **STATE C Sign-Off:** Founder accepts V3 Track 1 scope boundaries and deferred Track 2 items.
2. **Bounded Live-Provider Authorization:** Explicit Founder approval before running:
   - Synthetic Gemini `research-qa` + `hiring-runs/suggest` smoke checks.
   - Read-only `GET /account` + bounded DataVertex credit-ledger smoke check (`DATAVERTEX_MAX_CREDITS=2`).
   - Anthropic Claude (`WORKBYLINE_AI_PROVIDER=claude` + `WORKBYLINE_AI_STRICT_PROVIDER=true`) smoke check if Claude key is provisioned.
3. **Scoring & Ranking Policy Decisions:** Any changes to `fit_score` formula weights, corroboration thresholds, or shortlist ordering (`created_at desc`).

## Phase 3 — Parth Cloud / Staging Provisioning
1. Provision isolated staging Supabase project and rotate all local/dev keys (`SUPABASE_SERVICE_ROLE_KEY`, `WORKBYLINE_CONTEXT_DELEGATION_SECRET`, `WORKBYLINE_INTERNAL_SERVICE_KEY`, AI & sourcing keys).
2. Apply all 29 `supabase/migrations/2026*.sql` files cleanly and verify catalog ACLs + RLS.
3. Deploy Python Context Engine (`service/memory_api.py`) with persistent PostgreSQL + pgvector; optionally install `temporal` CLI (`127.0.0.1:7233`) and `BAAI/bge-small-en-v1.5` weights if semantic vector retrieval + Temporal durable workflows are enabled in staging.
4. Run `StagingRemoteRuntimeValidation.test.js` (`CAREERTWIN_RUN_STAGING_TESTS=1`) against the isolated staging target.

## Phase 4 — Track 2 Product Expansion (Post-V3)
- Automated GitHub / code-provenance connectors (`attestTrustedEvidenceProvenance`).
- Multi-format résumé parsing (`.docx` + structured parsers).
- Company-context-to-evaluation integration and governed human learning workflows.
