# Implementation Roadmap: CareerTWiN Private Pilot Build

**Execution Strategy:** Sequential, milestone-based execution inside `05-careertwin-monorepo`.  
**Governing Rule:** No code changes in read-only folders 1–4. Every milestone includes explicit acceptance criteria, rollback plans, and founder-verifiable evidence.

---

## Milestone 1: Monorepo Foundation & Dual-Stack Skeleton

### Objective
Initialize `05-careertwin-monorepo` with Turborepo, Next.js 16 frontend app (`apps/web`), FastAPI backend service (`apps/api`), Celery worker (`apps/worker`), shared domain package (`packages/domain`), ontology package (`packages/ontology`), and Docker infrastructure.

- **Dependencies:** None.
- **Files/Systems Affected:**
  - `05-careertwin-monorepo/package.json`
  - `05-careertwin-monorepo/pyproject.toml`
  - `05-careertwin-monorepo/turbo.json`
  - `05-careertwin-monorepo/apps/web/`
  - `05-careertwin-monorepo/apps/api/`
  - `05-careertwin-monorepo/infra/compose.yaml`
- **Acceptance Criteria:**
  1. Monorepo builds cleanly with `pnpm build` and `uv sync`.
  2. `apps/web` launches Next.js employer dashboard at `http://localhost:3000`.
  3. `apps/api` responds to `GET /health/ready` at `http://localhost:8000`.
  4. Docker Compose starts PostgreSQL, Redis, MinIO, and ClamAV containers cleanly.
- **Rollback Plan:** Clear `05-careertwin-monorepo` and restore from root template commit.
- **Founder-Verifiable Evidence:** Command line output of `make verify-core` and browser access to `http://localhost:8000/docs`.

---

## Milestone 2: Governed Hiring Memory & Hiring Genome Engine

### Objective
Port and implement IP Specs 001, 002, 004, 065, 094, 096 to ingest company hiring memory, parse past high-performer profiles/rejection criteria, and compile versioned, governed Hiring Genomes.

- **Dependencies:** Milestone 1.
- **Files/Systems Affected:**
  - `packages/domain/python/careertwin/domain/models.py`
  - `apps/api/src/careertwin/api/routes/genome.py`
  - `apps/api/src/careertwin/ai/gemini.py`
  - `apps/web/app/employer/brief/page.jsx`
- **Acceptance Criteria:**
  1. Uploading hiring memory documents produces a structured `HiringGenome` object with explicit version ID.
  2. Company-level vs. role-level memory weighting is preserved.
  3. Output matches `expected_hiring_genomes.jsonl` and `expected_company_pattern_extractions.jsonl` in Golden Dataset v2.
- **Rollback Plan:** Revert `genome.py` and fall back to manual role intake schemas.
- **Founder-Verifiable Evidence:** Execution of `python golden_dataset/tools/validate_v2_dataset.py` asserting zero genome schema errors.

---

## Milestone 3: Role Proof Contract & Requirement Compiler

### Objective
Port and implement IP Specs 003, 005, 006, 008, 009 to transform raw job descriptions and Hiring Genomes into deterministic Role Proof Contracts with explicit proof weights and accepted proof routes.

- **Dependencies:** Milestone 2.
- **Files/Systems Affected:**
  - `apps/api/src/careertwin/orchestration/pipeline.py`
  - `apps/api/src/careertwin/api/routes/roles.py`
  - `apps/web/app/employer/brief/`
- **Acceptance Criteria:**
  1. Submitting a job description generates a complete `ProofContract` object containing required/optional dimensions, acceptable evidence routes, and semantic anchors.
  2. Output matches `expected_proof_contracts.jsonl` from Golden Dataset v2.
- **Rollback Plan:** Revert pipeline stage to basic requirement listing without proof weights.
- **Founder-Verifiable Evidence:** Viewing compiled Proof Contract JSON in Next.js Role Brief page (`/employer/brief`).

---

## Milestone 4: Candidate Claim-to-Proof Ledger & Separated Fit/Proof Engine

### Objective
Implement IP Specs 010, 011, 012, 013, 016, 017, 018, 019, 022, 023 to parse candidate resumes into atomic claims, build attributable Claim-to-Proof Ledgers, and compute independent **Role Fit %**, **Proof Strength %**, and **Uncertainty Index %**.

- **Dependencies:** Milestone 3.
- **Files/Systems Affected:**
  - `apps/api/src/careertwin/ai/contracts.py`
  - `apps/api/src/careertwin/domain/scoring.py`
  - `apps/web/app/employer/shortlist/page.jsx`
- **Acceptance Criteria:**
  1. Every extracted candidate claim contains exact page/line offsets, text excerpt, excerpt SHA-256 hash, and confidence score.
  2. Candidate scoring strictly separates Fit Score, Proof Strength, and Uncertainty Index on visual UI pills.
  3. Contradictions between claims and evidence are flagged and penalized.
- **Rollback Plan:** Fall back to single-score view with warning banner.
- **Founder-Verifiable Evidence:** Screenshot of shortlist page showing candidate cards with separate Fit (e.g. 88%), Proof (e.g. 42%), and Uncertainty (e.g. 56%) badges with linked evidence excerpts.

---

## Milestone 5: Decision Blocker & Minimum Proof Request Optimizer

### Objective
Implement IP Specs 031, 032, 033, 034, 035, 036, 037 to detect candidate decision blockers and generate optimal Minimum Proof Requests that maximize expected confidence lift while minimizing candidate burden.

- **Dependencies:** Milestone 4.
- **Files/Systems Affected:**
  - `apps/api/src/careertwin/orchestration/blockers.py`
  - `apps/web/app/employer/packet/page.jsx`
- **Acceptance Criteria:**
  1. Candidates in state `near_fit_needs_proof` receive at most 1–2 targeted proof requests.
  2. Blocker priority calculation correctly orders missing evidence gaps.
  3. Expected Confidence Lift vs. Burden Ratio is calculated for each request.
- **Rollback Plan:** Disable automatic proof request optimization and display raw gap list.
- **Founder-Verifiable Evidence:** Displaying active Decision Blockers in Candidate Packet View (`/employer/packet`).

---

## Milestone 6: Candidate Proof Submission Portal

### Objective
Implement IP Specs 043, 044, 092 to build the candidate-facing proof submission web flow (`/candidate/proof`), enabling candidates to upload work artifacts or text explanations, triggering real-time re-evaluation.

- **Dependencies:** Milestone 5.
- **Files/Systems Affected:**
  - `apps/web/app/candidate/proof/page.jsx`
  - `apps/api/src/careertwin/api/routes/proof.py`
- **Acceptance Criteria:**
  1. Candidates can access their specific proof request via secure magic link token.
  2. Uploading code/text proof triggers Celery background re-evaluation.
  3. Proof strength updates automatically upon successful verification.
- **Rollback Plan:** Disable candidate upload portal and support manual employer proof input.
- **Founder-Verifiable Evidence:** End-to-end proof submission walkthrough: submitting a proof snippet as candidate updates proof score on employer shortlist in real time.

---

## Milestone 7: Employer Decision Review Queue & Human Authority Protocol

### Objective
Implement IP Specs 028, 046, 080, 100 to establish the Employer Decision Review Queue, enforcing strict human decision authority for **Advance**, **Hold**, and **Reject** actions with required decision rationale logging.

- **Dependencies:** Milestone 6.
- **Files/Systems Affected:**
  - `apps/web/app/employer/shortlist/page.jsx`
  - `apps/web/app/employer/packet/page.jsx`
  - `apps/api/src/careertwin/api/routes/decisions.py`
- **Acceptance Criteria:**
  1. Employers can filter candidates by Interview Ready, Near Fit Needs Proof, and Unsupported.
  2. Advance / Hold / Reject buttons open a modal requiring mandatory decision rationale.
  3. System strictly blocks automated candidate rejections or auto-advancements.
- **Rollback Plan:** Maintain read-only decision packet without recording decision updates.
- **Founder-Verifiable Evidence:** Executing an Advance action with mandatory rationale text and verifying entry in backend audit log.

---

## Milestone 8: Approved Outcome Learning Loop & Audit Ledger

### Objective
Implement IP Specs 054, 055, 066, 091, 095, 098 to capture approved hiring outcomes (technical screen pass, offer accept, rejection) and update Hiring Memory without model drift while maintaining tamper-evident audit logs.

- **Dependencies:** Milestone 7.
- **Files/Systems Affected:**
  - `apps/api/src/careertwin/persistence/audit.py`
  - `apps/api/src/careertwin/orchestration/learning.py`
  - `apps/web/app/employer/profile/page.jsx`
- **Acceptance Criteria:**
  1. Approved decisions write append-only records to audit log table with SHA-256 state hashes.
  2. Outcome learning updates role memory weights conservatively without altering core baseline rules.
  3. Exportable audit JSON bundle contains full provenance trace.
- **Rollback Plan:** Pause automatic memory updates while maintaining raw audit log records.
- **Founder-Verifiable Evidence:** Exporting downloadable Hiring Genome Audit Bundle (`.json`) from organization profile page.

---

## Milestone 9: End-to-End Evaluation & Safety Hardening

### Objective
Execute full evaluation suite against Golden Dataset v2 (`golden_dataset/`), verifying claim precision/recall, protected-attribute invariance, tenant isolation, and zero hallucination gates.

- **Dependencies:** Milestone 8.
- **Files/Systems Affected:**
  - `packages/eval/`
  - `golden_dataset/tools/validate_v2_dataset.py`
- **Acceptance Criteria:**
  1. 100% pass rate on `protected_attribute_leakage_tests.jsonl` and `expected_safety_invariance_tests.jsonl`.
  2. Zero verified claim hallucinations reported by test harness.
  3. Cross-tenant data isolation verified with zero data leaks.
- **Rollback Plan:** Halt production pilot deployment until all eval gates pass.
- **Founder-Verifiable Evidence:** Terminal test output showing 100% pass on Golden Dataset v2 evaluation suite.
