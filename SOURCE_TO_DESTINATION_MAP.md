# Source-to-Destination Map: Monorepo Consolidation

**Target Destination:** `05-careertwin-monorepo`  
**Purpose:** Establish a clean, maintainable monorepo architecture uniting the Next.js employer/candidate frontend with the Python evidence/trust backend, IP specifications, and Golden Dataset v2 evaluation harness.

---

## 1. Target Monorepo Architecture (`05-careertwin-monorepo`)

The consolidated repository will use a dual-stack monorepo layout (Next.js 16 + FastAPI/Python 3.12) organized as follows:

```text
05-careertwin-monorepo/
├── apps/
│   ├── web/                    # Next.js 16 Frontend App (from 01-live-mvp-readonly)
│   ├── api/                    # FastAPI HTTP Backend Service (from 02-backend-starter-readonly)
│   └── worker/                 # Celery Asynchronous Task Worker (from 02-backend-starter-readonly)
├── packages/
│   ├── domain/                 # Core Pydantic Domain Models & Shared TypeScript Interfaces
│   ├── ontology/               # Versioned YAML Ontologies & Scoring Rubrics
│   ├── ui/                     # Shared React UI Primitives & Components
│   └── eval/                   # Golden Dataset v2 Evaluation Harness & Benchmark Runner
├── golden_dataset/             # Golden Dataset v2 Fixtures & Benchmarks (from 04-golden-dataset-readonly)
├── ip_specs/                   # IP Specifications & Reference Architecture (from 03-ip-specs-readonly)
├── infra/                      # Docker Compose, PostgreSQL, Redis, MinIO, ClamAV Infrastructure
├── migrations/                 # Alembic Database Schema Migrations
├── Makefile                    # Unified Monorepo Development & Test Commands
├── turbo.json                  # Turborepo Build & Task Orchestration
├── pyproject.toml              # Python Workspace Dependencies & Tooling Config
└── package.json                # Monorepo Workspace Configuration
```

---

## 2. Source Directory Mapping Matrix

| Source Path | Target Destination Path | Purpose & Action |
|---|---|---|
| `01-live-mvp-readonly/app/` | `05-careertwin-monorepo/apps/web/app/` | Port existing App Router pages (`/employer`, `/candidate`, `/auth`, marketing pages). Extend with Hiring Genome OS workflows. |
| `01-live-mvp-readonly/components/ui/` | `05-careertwin-monorepo/packages/ui/components/` | Port 46 Shadcn UI component primitives as a shared UI package. |
| `01-live-mvp-readonly/components/marketing/` | `05-careertwin-monorepo/apps/web/components/marketing/` | Port landing page and marketing visual components. |
| `01-live-mvp-readonly/components/CommandPalette.jsx` | `05-careertwin-monorepo/apps/web/components/CommandPalette.jsx` | Port executive navigation palette. |
| `01-live-mvp-readonly/lib/auth.js` | `05-careertwin-monorepo/apps/web/lib/auth.js` | Refactor to handle JWT token forwarding to FastAPI backend. |
| `01-live-mvp-readonly/lib/sourcing/` | `05-careertwin-monorepo/apps/web/lib/sourcing/` | Adapt Crustdata API integrations to feed candidates into the Claim-to-Proof ingestion pipeline. |
| `02-backend-starter-readonly/src/careertwin/domain/` | `05-careertwin-monorepo/packages/domain/python/` | Core business domain entities (`Role`, `Claim`, `EvidenceRef`, `TrustPacket`). |
| `02-backend-starter-readonly/src/careertwin/api/` | `05-careertwin-monorepo/apps/api/src/careertwin/api/` | FastAPI routes (`/health`, `/v1/roles`, `/v1/runs`, `/v1/genome`, `/v1/proof`). |
| `02-backend-starter-readonly/src/careertwin/ai/` | `05-careertwin-monorepo/apps/api/src/careertwin/ai/` | Gemini model routing, prompts, and schema contracts. |
| `02-backend-starter-readonly/src/careertwin/persistence/` | `05-careertwin-monorepo/apps/api/src/careertwin/persistence/` | PostgreSQL SQLAlchemy models, repositories, and pgvector access. |
| `02-backend-starter-readonly/src/careertwin/orchestration/` | `05-careertwin-monorepo/apps/api/src/careertwin/orchestration/` | State machine workflow pipeline and stage boundaries. |
| `02-backend-starter-readonly/services/worker/` | `05-careertwin-monorepo/apps/worker/` | Celery asynchronous worker setup for document parsing & scoring. |
| `02-backend-starter-readonly/packages/ontology/` | `05-careertwin-monorepo/packages/ontology/` | Versioned ontology (`0.1.0/ontology.yaml` and `rubric.yaml`). |
| `02-backend-starter-readonly/infra/` | `05-careertwin-monorepo/infra/` | Docker Compose infra setup (PostgreSQL, Redis, MinIO, ClamAV). |
| `02-backend-starter-readonly/migrations/` | `05-careertwin-monorepo/migrations/` | Alembic DB migrations for PostgreSQL schema. |
| `03-ip-specs-readonly/*.md` | `05-careertwin-monorepo/ip_specs/` | Copy all 100 IP spec markdown files and `000_INDEX.md` as reference documentation. |
| `04-golden-dataset-readonly/` | `05-careertwin-monorepo/golden_dataset/` | Complete Golden Dataset v2 fixtures, expected JSONL outputs, schemas, and rubrics. |
| `04-golden-dataset-readonly/tools/` | `05-careertwin-monorepo/packages/eval/tools/` | Python dataset validation scripts and evaluation harness. |

---

## 3. Explicit "DO NOT COPY" List

The following items are strictly excluded from migration to maintain security, cleanliness, and audit integrity:

1. **Credentials & Secrets:**
   - `.env.local` from `01-live-mvp-readonly`
   - `.env` files, API keys, JWT secrets, database connection passwords.
2. **Obsolete / Mock Code:**
   - `01-live-mvp-readonly/components/NaiveShell.jsx` (Legacy standalone client matching mock).
   - `01-live-mvp-readonly/app/api/dev/` (Temporary debug routes).
   - `01-live-mvp-readonly/test-ai.js` (Root level ad-hoc script).
3. **Build Artifacts & Dependencies:**
   - `.next/`, `.vercel/` build caches.
   - `node_modules/`, `.venv/` virtual environments.
   - `.pytest_cache/`, `__pycache__/` directories.
   - `.DS_Store` operating system files.
4. **Unverifiable Candidate Data:**
   - Raw untracked candidate PDFs/resumes outside the sanctioned `04-golden-dataset-readonly` schema.
