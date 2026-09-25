# Current Codebase Audit: CareerTWiN MVP & Backend Starter

**Date:** July 31, 2026  
**Target Architecture:** Private-Pilot-Ready Hiring Genome OS  
**Audited Repositories:**  
1. `01-live-mvp-readonly` (Next.js 16 Employer & Candidate Web Application)  
2. `02-backend-starter-readonly` (Python FastAPI / Celery / PostgreSQL Evidence Backend)  

---

## 1. Executive Summary

CareerTWiN currently consists of a live Next.js front-end MVP with employer workflow interfaces (`01-live-mvp-readonly`) and a Python-based backend-first engine starter (`02-backend-starter-readonly`). 

While the Next.js MVP delivers a clean visual user interface for intake, role brief creation, sourcing, shortlist review, and decision packets, its scoring logic relies heavily on heuristic mocks and unstructured LLM calls. Conversely, the Python backend starter provides structured Pydantic v2 domain models, PostgreSQL/pgvector persistence, and Task-based workflow orchestration, but is detached from the Next.js user interface.

To achieve private-pilot readiness as the **Hiring Genome OS**, these two systems must be unified into `05-careertwin-monorepo`.

---

## 2. Frontend Architecture (`01-live-mvp-readonly`)

### Framework & Dependencies
- **Core Framework:** Next.js `16.2.1` with React `19.0.0` (App Router structure).
- **Styling System:** Tailwind CSS `v4.2.2` with PostCSS, using CSS variables and modern dark/light slate palette.
- **UI Components:** Radix UI primitives (`@radix-ui/react-*`), Lucide icons (`lucide-react`), Framer Motion (`motion` v12), and Recharts (`recharts` v3).
- **Form Management:** React Hook Form (`react-hook-form` v7) with Zod validation (`zod` v3).
- **HTTP & Data Fetching:** Native `fetch` API, Axios (`axios` v1), and Supabase JavaScript SDK (`@supabase/supabase-js` v2).

### Component & Layout Structure
- **Global Shell:** `app/layout.js` with global providers (`components/Providers.jsx`).
- **Employer Workspace Layout:** `app/employer/layout.jsx` and `app/employer/page.jsx` serving as the main dashboard wrapper.
- **UI Primitives:** 46 Shadcn UI component wrappers located in `components/ui/` (`button.jsx`, `dialog.jsx`, `card.jsx`, `tabs.jsx`, `table.jsx`, etc.).
- **Global Command Palette:** `components/CommandPalette.jsx` for quick workspace actions.

---

## 3. Backend & API Architecture (`02-backend-starter-readonly` & Live API Routes)

### Dual API Surface Overview
1. **Next.js Route Handlers (`app/api/`)**:
   - Handles client-facing proxy endpoints (`/api/auth`, `/api/employer`, `/api/candidate`, `/api/sourcing`, `/api/integrations`).
   - Performs direct calls to Supabase PostgreSQL and Google Gemini REST/SDK interfaces (`lib/ai.js`).
2. **FastAPI Engine Starter (`src/careertwin/`)**:
   - Built on Python 3.12, FastAPI, Pydantic v2, and SQLAlchemy 2.0 Async.
   - Houses formal domain schemas (`Role`, `Requirement`, `Candidate`, `Document`, `EvidenceRef`, `Claim`, `RequirementMatch`, `RiskFlag`, `TrustPacket`, `WorkflowRun`).
   - Uses Celery worker tasks (`src/careertwin/worker/`) for asynchronous background parsing and scoring.
   - Implements PostgreSQL + `pgvector` for vector storage and semantic search.

### Model Integrations (Google Gemini API)
- Integrated via `@google/genai` Node SDK and Python `google-genai` / `google-auth-library`.
- Task-specific routing configured in backend starter:
  - Role Decomposition: `gemini-2.5-pro`
  - Evidence Extraction: `gemini-2.5-flash`
  - Requirement Matching: `gemini-2.5-pro`
  - Risk & Contradiction Analysis: `gemini-2.5-flash`
  - Interview Probe Compiler: `gemini-2.5-flash-lite`
  - Embeddings: `gemini-embedding-2` (truncated to 1,024 dimensions)
- Provider interaction storage is disabled for candidate data privacy.

---

## 4. Authentication & Security Model

- **Authentication Provider:** Supabase Auth (JWT-based token issuance).
- **Session Handling:**
  - Client-side auth state in `lib/auth.js` with session persistence.
  - Server-side JWT verification via `lib/supabaseServer.js`.
  - Route protection enforced using `components/ProtectedRoute.jsx`.
- **Security Vulnerabilities Identified:**
  - **Service Role Key Access:** Some server-side routes fall back to Supabase `SERVICE_ROLE_KEY` without strict tenant checking.
  - **Missing Row Level Security (RLS):** Supabase database tables lack strict multi-tenant RLS enforcement, exposing potential cross-tenant data leakage if direct client queries are executed.
  - **Unsanitized Prompts:** Candidate resume text is passed directly into LLM prompts without stripping protected attributes (age, gender, race, location).

---

## 5. Database Access & Schema Infrastructure

- **Primary Database:** PostgreSQL with `pgvector` extension.
- **ORM / Client Access:**
  - `01-live-mvp-readonly`: Supabase JS Client querying `profiles`, `roles`, `candidates`, `shortlists`, `activity_logs`.
  - `02-backend-starter-readonly`: SQLAlchemy 2.0 Async with Alembic migrations (`migrations/`).
- **Core Entities Defined in Backend Starter:**
  - `roles` & `requirements` (Role requirements with weights and expectations)
  - `candidates` & `documents` (Ingested candidate metadata and file object keys)
  - `evidence_refs` (Atomic excerpts with exact page numbers, character offsets, and SHA-256 hashes)
  - `claims` (Extracted predicate-object triplets with confidence scores)
  - `requirement_matches` (Evidence-linked match states: `SUPPORTED`, `INFERRED`, `UNSUPPORTED`, `CONTRADICTED`)
  - `trust_packets` (Deterministic score breakdowns, proof requests, and release flags)

---

## 6. Page Routes & Navigation Structure

### Employer Workspace Routes
- `/employer` — Executive Employer Dashboard
- `/employer/intake` — Natural Language & Document Role Intake
- `/employer/brief` — Governed Role Brief & Requirement Weights
- `/employer/sourcing-session` — Crustdata-Powered Candidate Search
- `/employer/shortlist` — Candidate Shortlist & Match Ranking
- `/employer/packet` — Candidate Trust & Evidence Packet View
- `/employer/profile` — Employer Account & Organization Settings
- `/employer/integrations` — ATS & Sourcing Integration Hub
- `/employer/chat` — Interactive Hiring AI Assistant

### Candidate Portal Routes
- `/candidate` — Candidate Application & Status Portal
- `/candidate/portal` — Candidate Proof Request & Evidence Submission (To be expanded)

### Public & Auth Routes
- `/` — Product Landing Page
- `/auth/login` & `/auth/signup` — Auth Gateways
- `/about`, `/contact`, `/pricing`, `/privacy`, `/terms` — Marketing & Legal Pages

---

## 7. Sourcing Integrations

- **Integration Partner:** Crustdata API.
- **Modules:** `lib/sourcing/crustdata.js`, `lib/sourcing/agent.js`, and `lib/mcp/crustdata_tools.js`.
- **Capabilities:** Search candidate profiles by title, skills, location, company, and seniority; fetch enriched candidate history; search company employees.
- **Gap:** Crustdata candidate records are currently rendered as unstructured cards without extracting atomic claims or building Claim-to-Proof Ledgers.

---

## 8. Testing & Infrastructure Setup

### Frontend Testing (`01-live-mvp-readonly`)
- Vitest (`vitest` v4.1.2) with React Testing Library (`@testing-library/react` v16) and `jsdom`.
- Configured in `vitest.config.mjs` for component unit testing.

### Backend Testing (`02-backend-starter-readonly`)
- Pytest with `pytest-asyncio` and `httpx`.
- Core domain scoring tests run without external dependencies (`make verify-core`).
- Comprehensive API and workflow integration tests available in `tests/`.

### Deployment & Containerization
- **Frontend:** Vercel deployment configuration (`.vercel/`).
- **Backend Infrastructure:** Docker Compose (`infra/compose.yaml`) orchestrating PostgreSQL, Redis, MinIO (S3 storage), ClamAV (antivirus scanner), FastAPI API container, and Celery worker.

---

## 9. Obsolete or Duplicate Code Analysis

The following files represent temporary MVP mocks or duplicate implementations that **MUST NOT** be copied directly into the target monorepo:

1. **`components/NaiveShell.jsx`**: Standalone heuristic matching UI component containing hardcoded mock candidate scores and client-side evaluation logic.
2. **`app/api/dev/`**: Debug endpoints used for local testing.
3. **`test-ai.js`**: Standalone ad-hoc Gemini test script in the frontend root.
4. **Duplicate Supabase Initializations**: Inconsistent instantiation across `lib/supabase.js` and `lib/supabaseServer.js`.
5. **Unstructured AI Prompts in `lib/ai.js`**: Replaced by Pydantic-validated Gemini schemas in `backend-starter-readonly/src/careertwin/ai/`.
