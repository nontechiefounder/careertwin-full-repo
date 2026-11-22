# WorkByLine V3 — Retrieval Backend Decision & Boundary Assessment

> **Decision Record**: WorkByLine V3 Retrieval Architecture Evaluation  
> **Status**: **PRESERVE CURRENT ARCHITECTURE FOR V3 BASE; DEFER RAG-ANYTHING / MINERU**  
> **Date**: 2026-10-28  
> **Scope**: Source-based architectural comparison only (no code/dependency installation during closeout)

---

## 1. Executive Summary & Decision Boundary

WorkByLine V3's primary release objective is a deterministic, evidence-grounded pilot for employer hiring decisions. The current retrieval architecture unifies:
1. **PostgreSQL English FTS (`to_tsvector` / `websearch_to_tsquery`)** for exact token and phrase matching.
2. **PostgreSQL `pgvector` (`bge-small-en-v1.5`, 384d)** for dense semantic proximity.
3. **Reciprocal Rank Fusion (RRF)** to combine lexical and dense rankings without arbitrary score weighting.
4. **Graphiti (Neo4j/FalkorDB)** as an asynchronous derived entity graph.

**Decision**: **Preserve the current PostgreSQL FTS + pgvector + Graphiti architecture without modification for the V3 Release Candidate.**  
RAG-Anything (and associated libraries like MinerU) remains **ON HOLD**. Do not install RAG-Anything, add MinerU, or introduce speculative multi-backend abstraction layers during this finite base closeout.

---

## 2. Current Retrieval Responsibilities

| Component | Architecture / Implementation | Responsibilities & Invariants |
|---|---|---|
| **Raw Storage** | Filesystem (`0o600` files under `0o700` directories) | Authoritative byte storage; SHA-256 integrity verification against `wbctx_versions.sha256`. |
| **Parsing & Spanning** | Native `pypdf`, `python-docx`, UTF-8 | Extracts raw text into distinct `wbctx_spans` with strict Unicode character offsets (`start`, `end`) and page provenance. Scanned/empty pages raise explicit exceptions (`PAGE_n_NO_TEXT_OCR_REQUIRED`). |
| **Lexical Search** | PostgreSQL `ts_rank_cd` | Lexical recall over indexed spans; scoped strictly by `(org, workspace, role, run)` and `deleted=false`. |
| **Dense Search** | `pgvector` Cosine Distance (`<=>`) | Vector similarity using verified CPU model weights (`BAAI/bge-small-en-v1.5`); zero mock or hash vectors. |
| **Hybrid Ranking** | Reciprocal Rank Fusion ($1 / (60 + \text{rank})$) | Merges lexical and dense scores deterministically; enforces latest observed version filter before ranking. |
| **Derived Knowledge Graph** | Graphiti (`add_episode` / `search`) | Extracts episodes and cross-document entities into scoped Neo4j/FalkorDB graphs; all retrieved candidates are re-verified against PostgreSQL source-of-truth before human presentation. |
| **Grounding & Inquiry** | LangGraph + Gemini 2.5 Flash | Strict JSON schema extraction; citation verification (`span_id`, `version_id`, `quote`); fail-closed validation (`GROUNDED`, `INSUFFICIENT_EVIDENCE`). |

---

## 3. Which Responsibilities RAG-Anything Could Potentially Replace

If evaluated in a subsequent milestone, RAG-Anything could potentially offer:
1. **Multimodal Document Parsing**: Handling embedded raster images, complex multi-column layouts, and tables through MinerU.
2. **Unified Chunking & Embedding Pipeline**: Consolidating span creation and embedding generation within a single framework.
3. **Hierarchical Document Graph Construction**: Extracting document-internal structural relationships (section headings, paragraphs, footnotes).

---

## 4. Canonical Evidence, Authorization & Lifecycle Requirements RAG-Anything Must Preserve

Any candidate replacement or augmentation backend MUST strictly adhere to WorkByLine's non-negotiable invariants:

1. **Strict Multi-Tenant & Hiring Run Isolation**:
   - Queries and updates must be strictly bounded by `(org, workspace, role, run)`.
   - Cross-run and cross-tenant leakage is a catastrophic security failure.
2. **Deterministic Unicode Span Provenance**:
   - Every passage, quote, and citation must trace back to a specific `wbctx_spans` record with exact character offsets (`start`, `end`, `page`) verified against raw storage bytes.
   - Generative hallucination or approximate fuzzy spans cannot serve as hiring evidence.
3. **Source-of-Truth Primacy & Revocation Semantics**:
   - PostgreSQL remains the authoritative ledger.
   - When a source is logically revoked (`deleted=true`) or physically erased (`hard_erase`), all downstream retrieval channels must immediately deny access.
4. **Idempotency & Concurrent Safety**:
   - Network retries and concurrent uploads must be handled via deterministic request fingerprints without data corruption or duplicate entities.
5. **Fail-Closed Availability**:
   - If an optional indexing or parsing service is unconfigured, return explicit sanitized error codes (e.g. 503 `EMBEDDING_PROVIDER_UNCONFIGURED`); never fall back to fabricated mock data.

---

## 5. Architectural Overlap with Graphiti

Both Graphiti and RAG-Anything touch graph-structured data, but with fundamentally different scopes:
- **Graphiti** builds an **inter-document knowledge graph**: extracting entities, relationships, and temporal episodes across documents within a tenant/run scope.
- **RAG-Anything** builds an **intra-document structural graph**: connecting sections, paragraphs, and tables within a single document file.

**Risk of Redundancy**: Introducing RAG-Anything alongside Graphiti without a unified graph schema creates duplicate graph storage, competing entity resolvers, and doubled maintenance overhead.

---

## 6. Proposed Bounded Comparison & Migration / Rollback Implications

If authorized by the founder for post-V3 exploration:
1. **Side-by-Side Evaluation Set**: Benchmark RAG-Anything strictly against the frozen evaluation set (`tests/test_unseen_grounding_eval.py`) comparing recall, precision, citation accuracy, and processing latency.
2. **Isolated Database Branching**: Test on a disposable target without altering existing `wbctx_*` tables.
3. **Paired Rollback Feasibility**: The system must maintain zero schema lock-in, enabling instantaneous fallback to PostgreSQL FTS + pgvector simply by flipping an environment flag.
