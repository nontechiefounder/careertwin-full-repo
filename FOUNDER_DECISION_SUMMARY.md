# Founder Decision Summary: Preparing CareerTWiN for Private Pilot Launch

**Author:** Antigravity AI Engineering  
**Audience:** Founders, Product Leaders, & Executive Stakeholders  
**Tone:** Plain, non-technical executive language  

---

## 1. Strategic Vision: The Hiring Genome OS

CareerTWiN is evolving from a resume-matching tool into the **Hiring Genome OS**—an evidence-grounded intelligence platform for employer hiring decisions. 

Unlike traditional recruiting software that ranks candidates using black-box AI scores or simple keyword matching, CareerTWiN strictly separates **how well a candidate fits a role** from **how much hard evidence proves their claims**, while identifying the exact **missing proof required to make a confident decision**.

The required private-pilot workflow is:
$$\text{Hiring Memory Upload} \longrightarrow \text{Governed Hiring Genome} \longrightarrow \text{Role Proof Contract} \longrightarrow \text{Claim-to-Proof Ledger}$$
$$\Downarrow$$
$$\text{Fit / Proof / Uncertainty Separation} \longrightarrow \text{Decision Blocker} \longrightarrow \text{Minimum Proof Request}$$
$$\Downarrow$$
$$\text{Candidate Proof Submission} \longrightarrow \text{Human Decision} \longrightarrow \text{Approved Outcome Learning}$$

---

## 2. What Is Already Usable (Current Assets)

We are starting with strong foundational assets across our read-only source directories:

1. **Live Visual User Interface (`01-live-mvp-readonly`):** A sleek, modern employer web application built in Next.js 16 with dark/light themes, employer dashboard, intake flow, role brief viewer, candidate shortlist cards, and candidate packet displays.
2. **Backend Engineering Starter (`02-backend-starter-readonly`):** A robust Python 3.12 / FastAPI engine containing typed domain models, PostgreSQL + vector database persistence, background worker task structures, and Task-based Google Gemini model routing.
3. **Product & IP Specifications (`03-ip-specs-readonly`):** 100 comprehensive architectural specification documents defining mathematical formulas, state transitions, and safety protocols.
4. **Golden Dataset v2 (`04-golden-dataset-readonly`):** A world-class synthetic evaluation benchmark with 20 roles, 60 candidates, 192 historical decisions, and ground-truth expectation files for testing every system feature.

---

## 3. What Is Missing (Gaps to Pilot Readiness)

While the frontend looks great and the backend starter is well-structured, the system currently has key functional gaps that must be bridged before welcoming private pilot customers:

1. **Frontend-to-Backend Disconnect:** The Next.js visual app currently relies on client-side mock data or unstructured AI calls. It needs to be connected to the structured Python FastAPI engine.
2. **Hiring Memory & Governed Genome Compiler:** The ability for an employer to upload past company hiring rules, high-performer patterns, or team rubrics and turn them into a versioned "Hiring Genome."
3. **Atomic Claim-to-Proof Ledger:** A parser that breaks resumes down into atomic claims and links every claim to exact character offsets and page numbers in candidate source documents.
4. **Dimensional Score Separation:** Replacing single 0–100 candidate match scores with separate badges for **Role Fit %**, **Proof Strength %**, and **Uncertainty Index %**.
5. **Decision Blocker & Proof Request Engine:** System logic that automatically detects what missing proof blocks an interview decision and drafts a 1-click proof request for the candidate.
6. **Candidate Proof Portal:** A web page where candidates can upload evidence (e.g. code sample, project link) to resolve missing proof gaps.
7. **Human Decision Authority & Rationale Logging:** Enforcing a strict rule where employers must click **Advance**, **Hold**, or **Reject** and provide brief written rationale, ensuring zero automated rejections.
8. **Outcome Learning Loop:** A mechanism that learns from hired vs. rejected candidates over time without degrading initial hiring bars.

---

## 4. What Must Be Fixed First

Before writing new features, three foundation items must be completed immediately:

1. **Monorepo Consolidation (`05-careertwin-monorepo`):** Combine the frontend web app, Python backend, IP specs, and evaluation dataset into a single workspace so all parts talk to each other seamlessly.
2. **Database Security & Multi-Tenant Isolation:** Enforce PostgreSQL Row Level Security (RLS) so Company A can never accidentally see Company B's candidate data or hiring memory.
3. **Demographic Signal Sanitization:** Install a privacy filter that strips age, gender, race, and graduation dates before candidate data reaches AI models, guaranteeing bias-free evaluation.

---

## 5. What Will Be Built

During the private pilot implementation, we will deliver the complete 10-stage Hiring Genome OS in `05-careertwin-monorepo`:

- **Employer Setup:** Ingest company memory and build governed Hiring Genomes and Role Proof Contracts.
- **Candidate Processing:** Extract atomic candidate claims into verifiable Claim-to-Proof Ledgers.
- **Evaluation Dashboard:** Display candidate cards with clear **Fit %**, **Proof %**, and **Uncertainty %** metrics alongside identified **Decision Blockers**.
- **Candidate Engagement:** Send targeted 1-click **Minimum Proof Requests** via candidate magic links.
- **Employer Decision Queue:** Allow hiring managers to review complete decision packets and record **Advance**, **Hold**, or **Reject** decisions with logged rationale.
- **Continuous Calibration:** Feed approved decision outcomes back into company memory to refine future role contracts automatically.

---

## 6. Top Ten Risks & Mitigation Plan

| # | Identified Risk | Impact | Mitigation Strategy |
|---|---|---|---|
| 1 | **AI Model Hallucination** | System claims candidate has proof when none exists. | Require exact document text excerpts, line numbers, and SHA-256 hashes for all verified claims. |
| 2 | **Candidate Submission Friction** | Candidates abandon proof requests if too tedious. | Restrict requests to 1–2 low-effort items (e.g. link or short text block) with clear explanations. |
| 3 | **Demographic Bias Leakage** | Protected signals bias evaluation results. | Run pre-evaluation sanitization pipeline and mandate 100% pass on Golden Dataset safety tests. |
| 4 | **Cross-Tenant Data Leakage** | One customer accesses another's candidate records. | Enforce FastAPI tenant middleware and PostgreSQL Row Level Security (RLS) on all tables. |
| 5 | **AI Model Drift** | Model updates alter scoring criteria unexpectedly. | Use versioned Hiring Genomes and lock Gemini model configurations. |
| 6 | **Interface Visual Clutter** | Employers overwhelmed by complex evidence data. | Present simple 3-Axis visual metric bars with expandable detail drawers. |
| 7 | **Employer Decision Bypass** | Employers skip rationale logging or expect auto-hiring. | Strictly block status changes until mandatory rationale text is entered; disable auto-rejection. |
| 8 | **Document Parsing Latency** | Slow response times during peak resume uploads. | Process parsing asynchronously in background Celery worker queues with real-time UI progress bars. |
| 9 | **ATS Sync Complexity** | High effort required to integrate with multiple enterprise ATS platforms. | Focus private pilot on direct PDF upload and clean CSV exports before building complex API syncs. |
| 10 | **Candidate Non-Response** | Candidates do not respond to proof requests. | Provide employer fallback option to advance candidate to interview with specific probe questions. |

---

## 7. Recommended First Coding Task

To launch implementation efficiently without wasted effort, the engineering team should begin with:

> **Recommended Task:** Milestone 1 — Monorepo Foundation Setup (`05-careertwin-monorepo`)  
> Establish the Turborepo and Python `uv` workspace structure in `05-careertwin-monorepo`, migrate the Next.js visual app into `apps/web`, migrate the FastAPI engine into `apps/api`, link the shared UI and domain packages, and verify that `pnpm dev` and `uv run` launch both frontend and backend on local infrastructure with healthy status checks.
