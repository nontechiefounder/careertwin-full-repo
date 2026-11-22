# WorkByLine V2 — Engine Acceptance Contract

**Status:** Authoritative Pre-Release Gate  
**Target Worktree:** `/Users/darshilparmar/Desktop/Genome/careertwin-v2-memory-expansion-worktree`  
**Candidate Branch:** `antigravity/ctw-v2-memory-expansion-candidate`  
**Preserved Baseline Release:** `84d9712` (Preserved intact; merge-base verified)  
**Preserved Shared Database:** `supabase_db_careertwin-local-baseline` on port `54332` (Zero-mutation guard enforced)  
**Safety Protocol:** `CAREERTWIN_DRY_RUN_EMAIL=true`, No external dispatch, No hosted deployment, No handoff before founder acceptance.

---

## 1. Purpose & Guiding Principles

This contract establishes the explicit, measurable requirements for the WorkByLine V2 context and memory engine. Reports, framework additions, mocked responses, and synthetic test counts **do not** constitute completion. 

### Separation of Distinct Dimensions
The engine treats the following operational dimensions as strictly separate:
1. **File Preservation:** Byte-for-byte SHA256 cryptographic verification of stored original documents in private storage.
2. **Parsing Coverage:** Extraction of text, structural blocks, locators (page numbers, line ranges), and character code-point offsets. (Document parser limitations must be explicitly logged; parsing does **not** imply understanding).
3. **Retrieval Recall:** Deterministic pre-filtered lexical (PostgreSQL full-text search) and semantic dense vector (pgvector) candidate retrieval combined via Reciprocal Rank Fusion (RRF).
4. **Answer Grounding & Claim Validation:** Entailment verification of generated or extracted claims against cited evidence. (Deterministic citation check $\neq$ semantic entailment).
5. **Multi-Document Assessment:** For "assess all documents" workflows, every eligible document in the run scope must be processed with completion status or explicit exceptions recorded. Top-$k$ retrieval alone **does not** count as an exhaustive assessment.

---

## 2. Authorized User Capabilities Checklist

An authorized employer user (Owner, Admin, Recruiter, Hiring Manager) must be able to:

| # | User Capability | Verification Mechanism | Acceptance Threshold |
|---|---|---|---|
| **C1** | **Upload Actual Documents** | Upload real `.txt`, `.pdf`, and `.docx` files via UI file picker and API. | HTTP 200/202; storage file created; DB metadata committed. |
| **C2** | **Cryptographic Byte Preservation** | Stored file SHA256 must match client-submitted original bytes. | 100% hash match (`file_sha256`); zero data tampering. |
| **C3** | **Immutable Version & Outcome Tracking** | New uploads or updates produce sequential version numbers (`v1`, `v2`) with states (`pending`, `completed`, `failed`). | Linear version ledger; terminal states persisted in PostgreSQL. |
| **C4** | **Exact Text, Locators & Offset Inspection** | Inspect extracted text with page indices, start/end character offsets, and source locators. | Exact character code-point offsets match raw extracted text. |
| **C5** | **Authorized Evidence Search** | Hybrid FTS + pgvector search pre-filtered strictly by Tenant ID and Hiring Run ID. | 0 foreign tenant passages returned; RRF score computed correctly. |
| **C6** | **Historical Evidence Querying** | Query as-of historical timestamp $t$ to retrieve historical versions and exclude pending/future versions. | As-of queries return historically active version; excludes later revisions. |
| **C7** | **Source-Supported Answers with Visible Uncertainty** | Research QA returns claims linked to supporting citations; unsupported text is stripped or answer withheld. | Status: `GROUNDED` (supported), `AMBIGUOUS` (partial), `INSUFFICIENT_EVIDENCE` (unsupported). |
| **C8** | **Handling Conflicting / Missing Evidence** | System honestly abstains (`INSUFFICIENT_EVIDENCE`) when evidence is absent or contradictory. | Zero hallucinated answers; zero fabricated citations. |
| **C9** | **Source Revocation & Stale Leak Prevention** | Revoked source is immediately excluded from current search and QA without database-wide rebuilds. | Immediate 0-passage retrieval post-revocation. |
| **C10** | **Interrupted Processing Recovery** | Background jobs interrupted mid-flight recover via lease expiry, fencing tokens, or replay safely. | Stale worker rejected with `LEASE_LOST`; recovered worker succeeds. |
| **C11** | **Strict Multi-Tenant & Role Isolation** | Cross-tenant access (Tenant B accessing Tenant A) and unauthorized mutation (Auditor uploading) rejected. | Cross-tenant: HTTP 404/403; Auditor write: HTTP 403 `ACCESS_DENIED`. |

---

## 3. Measurable Quality, Latency & Workload Targets

All targets are established upfront prior to acceptance evaluation:

| Metric | Target | Measurement Method |
|---|---|---|
| **Document Ingestion Throughput** | $\ge 2$ documents / second (text/docx), $\ge 1$ page / second (pdf) | Time elapsed from upload request to version `completed` state |
| **Hybrid Search Latency (p50)** | $\le 120\text{ ms}$ | Time elapsed for `/api/employer/context-sources/search` |
| **Hybrid Search Latency (p95)** | $\le 350\text{ ms}$ | 95th percentile over 20 mixed queries |
| **Research QA Retrieval (p50)** | $\le 150\text{ ms}$ | Pure retrieval phase of Research QA |
| **Counterexample Rejection Rate** | $100\%$ | Detection and rejection of unsupported claims (e.g. founder Python vs AWS test) |
| **Cross-Tenant Leakage Rate** | $0.00\%$ | Zero foreign passages across all queries |
| **Database Safety Guard** | $100\%$ rejection | Immediate rejection (exit 42 / ProtectedDatabaseError) of port 54332 & shared container |

---

## 4. Operational Boundaries & Dependencies

1. **Database Safety:**
   - Protected Baseline Database: `supabase_db_careertwin-local-baseline` (port `54332`) is **read-only / preserved**. Zero writes permitted.
   - Disposable Evaluation Database: Port `54399` (`wbctx-disposable-eval-pg`) or ephemeral named test container.
2. **Model Credentials:**
   - `GEMINI_API_KEY`: Requires secure, rotated key. If absent, system must fail closed with HTTP 503 `LIVE_GENERATION_UNAVAILABLE` / `BLOCKED_PENDING_KEY_ROTATION`.
   - Mocks must **never** count as live model acceptance.
3. **Graph Engine (Graphiti):**
   - If local Graphiti backend is unconfigured, system must return HTTP 503 `GRAPH_PROJECTION_UNAVAILABLE` honestly.
4. **Execution Protocol:**
   - Working implementation $\to$ Real service verification $\to$ Real browser testing $\to$ Founder testing $\to$ Founder approval $\to$ Final handoff.
