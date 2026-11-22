# WorkByLine V3 — Environment Requirements & Port Allocations

**Document Version:** 3.0  
**Target Event:** Monday, November 2, 2026 Founder/Customer Demo  
**Audience:** Infrastructure, DevOps, and Platform Engineers  

---

## 1. System Requirements

| Component | Minimum Specification | Recommended Production / Demo |
|---|---|---|
| **CPU Architecture** | 4-core x86_64 or Apple Silicon (ARM64) | 8-core CPU |
| **RAM** | 8 GB System Memory | 16 GB System Memory |
| **Storage** | 10 GB free disk space | 50 GB NVMe SSD |
| **Operating System** | macOS Darwin 24+ or Linux (Ubuntu 22.04+) | Ubuntu 22.04 LTS / macOS Sequoia |
| **Python** | 3.11, 3.12, or 3.13 | 3.13.2 |
| **Node.js** | 18.x LTS or 20.x LTS | 20.18 LTS |
| **PostgreSQL** | PostgreSQL 16+ with `pgvector` | PostgreSQL 17.2 with `pgvector` 0.8.0 |
| **Temporal CLI / Server** | Temporal CLI 1.9.1+ / Server 1.22+ | Temporal Dev Server 1.32.0 (headless) |

---

## 2. Port Allocations & Network Topology

| Port | Protocol | Service | Accessibility | Purpose / Notes |
|---|---|---|---|---|
| **8011** | HTTP | WorkByLine Memory & Evidence API | Internal / Loopback (`127.0.0.1`) | FastAPI service serving `/health`, document upload, indexing, and hybrid retrieval. |
| **3004** | HTTP | Next.js Frontend Web Server | Internal / Loopback (`127.0.0.1`) | Production Next.js web application for employer portal and Context Evidence Panel. |
| **7233** | gRPC | Temporal Frontend Service | Internal / Loopback (`127.0.0.1`) | Durable workflow execution, activity dispatching, and heartbeat monitoring. |
| **8233** | HTTP | Temporal Web UI | Optional (`127.0.0.1`) | Development UI for inspecting workflow executions. (Disabled in headless mode). |
| **54399** | TCP | Disposable PostgreSQL 17 Database | Internal / Loopback (`127.0.0.1`) | Isolated database container for tests and pilot verification. |
| **54332** | TCP | **PROTECTED BASELINE DATABASE** | **READ-ONLY / PROTECTED** | Frozen baseline database (`supabase_db_careertwin-local-baseline`). **NEVER MUTATE**. |
| **54331** | HTTP | Supabase Local Auth / API | Internal (`127.0.0.1`) | Supabase authentication service for recruiter and auditor JWT verification. |

---

## 3. Environment Variable Reference

### A. Database & Storage Configuration
- `WORKBYLINE_CONTEXT_DATABASE_URL`: SQLAlchemy connection string for the Context & Evidence database. Example: `postgresql+psycopg://postgres:postgres@127.0.0.1:54399/disposable_v3_db`.
- `DATABASE_URL`: Fallback connection string matching `WORKBYLINE_CONTEXT_DATABASE_URL`.
- `WORKBYLINE_CONTEXT_STORAGE`: Directory path for private, encrypted-at-rest document storage. Default: `<worktree>/private-context-storage`. Permissions must be `0700`.
- `WORKBYLINE_CONTEXT_DELEGATION_SECRET`: Cryptographic secret (minimum 32 characters) for signing and verifying authorization delegation tokens between the Next.js web proxy and the Python Memory API.

### B. Temporal Orchestration Configuration
- `TEMPORAL_ADDRESS`: Host and port of the Temporal cluster frontend. Default: `127.0.0.1:7233`.
- `WORKBYLINE_REQUIRE_TEMPORAL_READY`: Boolean flag (`true`/`false`). When `true`, `/health` returns `503` if Temporal is unreachable or has zero active pollers on `wbctx-evidence`.
- `WORKBYLINE_HEARTBEAT_INTERVAL_SEC`: Frequency (in seconds) at which `HeartbeatLeaseMaintainer` emits activity heartbeats to Temporal. Default: `1.0`.
- `WORKBYLINE_LEASE_RENEWAL_INTERVAL_SEC`: Frequency (in seconds) at which worker renews database lease in `wbctx_jobs`. Default: `2.0`.
- `WORKBYLINE_LEASE_DURATION_SEC`: Total lease duration (in seconds) granted per renewal. Default: `8` (testing) or `120` (production).
- `WORKBYLINE_INITIAL_LEASE_SEC`: Initial lease duration (in seconds) granted upon job claim. Default: `8` (testing) or `60` (production).

### C. Inference & Embedding Model Configuration
- `WORKBYLINE_EMBEDDING_WEIGHTS`: Absolute directory path to the downloaded `BAAI/bge-small-en-v1.5` Hugging Face weights. Default: `/tmp/workbyline_bge_small_en_v1_5`.
- `WORKBYLINE_EMBEDDING_MODEL`: Expected model identifier. Must be `bge-small-en-v1.5`.
- `WORKBYLINE_EMBEDDING_REVISION`: Expected Git commit revision of model weights. Must be `5c38ec7c405ec4b44b94cc5a9bb96e735b38267a`.
- `WORKBYLINE_EMBEDDING_CONFIG_SHA256`: Expected SHA-256 of `config.json`. Value: `094f8e891b932f2000c92cfc663bac4c62069f5d8af5b5278c4306aef3084750`.
- `WORKBYLINE_EMBEDDING_ARTIFACT_SHA256`: Expected SHA-256 of `model.safetensors`. Value: `5650b43c69a52dc94d243256be3a974a8836090b043531cec56ae64ac2fc3d0a`.

### D. Candidate Sourcing Configuration (DataVertex)
- `DATAVERTEX_API_KEY`: Server-only API key for DataVertex endpoints (`https://api.data-vertex.com/v1`). Required for live candidate search and profile enrichment. Never use `NEXT_PUBLIC_*` or expose through client bundles. If unconfigured, the application renders an honest unconfigured notice.
- `DATAVERTEX_MAX_CREDITS`: Hard ceiling for verification session credit consumption. Default: `20`. Halts sourcing once reached to prevent unexpected spend.
- `DATAVERTEX_REVEAL_CONTACTS`: Explicitly `false`. Contact reveal flags (`reveal_personal_email`, `reveal_phone`, `reveal_healthcare_enrichment`) are disabled during demo and pilot sourcing.

### E. Safety & Feature Gate Configuration
- `CAREERTWIN_DRY_RUN_EMAIL`: Must be `true`. Strictly prevents any real outbound emails.
- `WORKBYLINE_GRAPH_ENABLED`: Must be `false`. Gated off until Neo4j/Graphiti is provisioned.
- `WORKBYLINE_GENERATION_GATE`: Must be `false`. Gated off until Gemini API quota and approval are provisioned.
- `WORKBYLINE_WEB_MODE`: `production` (uses pre-built `.next/` bundle) or `development`.

