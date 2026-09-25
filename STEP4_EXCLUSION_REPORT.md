# Step 4A Exclusion Report

**Objective:** Explicitly record all application components, assets, credentials, datasets, and configurations that were strictly **EXCLUDED** from migration during Step 4A.

---

## 1. Excluded Application Source Code

| Source Folder | Component / File | Reason for Exclusion in Step 4A |
|---|---|---|
| `01-live-mvp-readonly` | Next.js App Router (`app/`) | Step 4A is foundation-only. Application code migration requires separate task approval. |
| `01-live-mvp-readonly` | Components & UI (`components/`) | UI primitives remain in source folder until initial app migration. |
| `01-live-mvp-readonly` | Helper Modules & Auth (`lib/`) | Shared libraries and API helpers excluded from foundation phase. |
| `02-backend-starter-readonly` | Python Domain Models (`src/careertwin/domain/`) | Backend domain logic excluded until separate backend migration task. |
| `02-backend-starter-readonly` | FastAPI Routes & Services (`src/careertwin/api/`) | Service routes excluded from initial foundation scaffolding. |
| `02-backend-starter-readonly` | Celery Tasks (`src/careertwin/worker/`) | Worker logic excluded from foundation phase. |
| `02-backend-starter-readonly` | Database Models & Alembic Migrations (`migrations/`) | DB migrations explicitly prohibited during Step 4A. |

---

## 2. Excluded Intellectual Property & Evaluation Datasets

| Source Folder | Asset | Destination Boundary | Exclusion Confirmation |
|---|---|---|---|
| `03-ip-specs-readonly` | 100 IP Specification Files (`001_*.md` - `100_*.md`) | `careertwin-monorepo/docs/private/ip-specs/` | Zero IP spec files copied. Placeholder `.gitkeep` created. |
| `04-golden-dataset-readonly` | Golden Dataset v2 JSONL Records (`expected_*.jsonl`, `golden_*`) | `careertwin-monorepo/evals/golden/v2/` | Zero candidate records or dataset files copied. Placeholder `.gitkeep` created. |

---

## 3. Excluded Build Tooling & Environment Files

| Category | Specific Item | Exclusion Confirmation |
|---|---|---|
| Package Manifests | `package.json`, `pyproject.toml` | Not created in monorepo during Step 4A. |
| Monorepo Tooling | `turbo.json`, `pnpm-workspace.yaml`, `uv.lock` | Not created. Tooling introduction requires explicit approval. |
| Package Lockfiles | `package-lock.json`, `uv.lock` | Not created. Source lockfiles preserved in read-only folders. |
| Environment Secrets | `.env`, `.env.local`, `.env.production` | Excluded. Only blank `.env.example` created. |
| Candidate Data | Candidate resumes, audio, video, exports | Zero candidate PII present in destination folder. |

---

## 4. Verification Declaration

All items listed above remain exclusively within their original read-only folders (`01-live-mvp-readonly`, `02-backend-starter-readonly`, `03-ip-specs-readonly`, `04-golden-dataset-readonly`). Zero source files were modified, moved, or deleted.
