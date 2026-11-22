---
name: workbyline-launch-closeout
description: WorkByLine V3 release closeout and launch readiness protocol enforcing exact source identity, caller-complete repairs, truthful readiness, and strict phase boundaries.
---

# WorkByLine Launch Closeout Protocol

This skill governs the finite base closeout and launch readiness for WorkByLine V3.

## Core Rules

1. **Exact Source Identity & Ledger**:
   - Every change must reference the exact canonical git branch, parent commit SHA, and uncommitted working tree state.
   - Maintain a single unified findings ledger tracking all confirmed defects from discovery to resolution.

2. **Repairs Across All Connected Callers**:
   - Never fix an isolated function or change an enum in isolation.
   - Trace and repair the entire caller chain: UI components, Next.js server proxies, Python API endpoints, ORM/DB transactions, Temporal workflow activities, and background workers.

3. **Separate Phase Gates**:
   - **Phase 1: Implementation & Static Source Review** (Current). Authorizes code edits, schema migration drafting, documentation reconciliation, and packaging. Strictly prohibits test suite execution, builds, benchmarks, browser automation, migration rehearsals, and live provider probes.
   - **Phase 2: Runtime Verification**. Executed only upon explicit founder authorization on disposable infrastructure.
   - **Phase 3: Founder Acceptance (UAT)**. Independent validation of verified capabilities.
   - **Phase 4: Release Approval**. Formal production release authorization.

4. **Evidence-Backed Truthfulness**:
   - No fabricated success, canned production answers, or silent mock fallbacks.
   - If an optional service (Graphiti, Gemini, pgvector) is unconfigured or unavailable, return explicit, sanitized status codes (e.g. 503 `GRAPH_PROJECTION_UNAVAILABLE`, `FEATURE_GATED_GENERATION`).
   - A simple `SELECT 1` does not establish application readiness. Readiness must verify required schema availability, worker responsiveness, and model artifact provenance.

5. **Strict Scope Bounding**:
   - Do not expand scope to unrelated features (e.g. 100 Technical/IP specs, OpenFGA, Nango, MinerU remain ON HOLD).
   - Preserve frozen baseline `84d9712`, protected database port `54332`, and `CAREERTWIN_DRY_RUN_EMAIL=true`.
