# WorkByLine V3 — Founder & Customer Demo Runbook

**Date of Demo:** Monday, November 2, 2026  
**Audience:** Founders, Pilot Customer Executives, and Technical Reviewers  
**Demonstrators:** Parth / Darshil  
**Release Candidate:** WorkByLine V3  

---

## 1. Demo Objectives & Narrative

The purpose of this live demonstration is to prove that WorkByLine V3 is **truthful, reliable, and auditable**:
- **Zero Mock Answers**: If an external subsystem (e.g. generative AI or knowledge graph) is unprovisioned, the system returns a truthful, actionable status notice (`503 Service Unavailable`) rather than generating fabricated hallucinated text.
- **Deterministic Storage & Identity**: Files with the same filename are cleanly disambiguated. Explicit revisions allow comparing historical versions against current versions.
- **Resilient Background Execution**: Documents are parsed, chunked, and embedded asynchronously via Temporal with heartbeat monitoring and lease fencing.
- **Dense + Lexical Hybrid Search**: Queries retrieve grounded passages combining full-text keywords and semantic embeddings with Reciprocal Rank Fusion (RRF) scoring.
- **Multi-Tenant Run Isolation**: Operations in one hiring run never leak into another run, even when switching runs while a query is in flight.
- **Durable Document Revocation**: Revoked documents immediately disappear from active search and historical queries.

---

## 2. Pre-Flight Preparation (15 Minutes Before Demo)

1. Open a terminal and navigate to the worktree:
   ```bash
   cd /Users/darshilparmar/Desktop/Genome/careertwin-v2-memory-expansion-worktree
   ```
2. Check database connectivity:
   ```bash
   pg_isready -h 127.0.0.1 -p 54399
   ```
3. Start the WorkByLine V3 stack cleanly:
   ```bash
   ./infra/scripts/launch_workbyline_v3.sh all
   ```
4. Verify operational readiness:
   ```bash
   curl -s http://127.0.0.1:8011/health | jq .
   ```
   Confirm `"status": "ready"`, `"database": "connected"`, `"schema": "ready"`, `"temporal": "ready"`, and `"embedding": "ready"`.
5. Open Google Chrome and navigate to:
   ```
   http://localhost:3004/auth
   ```

---

## 3. Scripted Live Demonstration Walkthrough

### Part A: Primary Recruiter Journey (Sourcing to Decision)

#### Step 1: Sign In & Authentication
- **Action**: Enter credentials at `/auth`:
  - Email: `synthetic.employer.alpha@example.invalid`
  - Password: `TestPassword123!`
- **Narration**: *"WorkByLine enforces authenticated access with organization and role validation. The employer signs into Organization Alpha Corp."*
- **Verification**: Authenticated and directed to the Employer Dashboard (`/employer`).

#### Step 2: Open Role & Approve Rubric Criteria
- **Action**: Click into role **Lead Systems Engineer** (`1bea003e-9466-4e4e-a185-6cc7cdd06ff1`) to view the Role Brief (`/employer/brief/[id]`). Review the evaluation rubric and approve criteria where required.
- **Narration**: *"Hiring requirements and rubrics are human-approved. The system records the approved rubric version for truthful candidate evaluations."*
- **Verification**: Role brief displays approved rubric badge and unlocks candidate sourcing.

#### Step 3: Search DataVertex for Candidates
- **Action**: Click **Source with DataVertex** to navigate to `/employer/sourcing/[id]`.
  - Enter structured filters (e.g. Title: `Distributed Systems Engineer`, Location: `San Francisco`, Skills: `Go, Raft, Distributed Systems`).
  - Or switch to natural language search (max 300 characters) or job description search (cost: 2 credits).
  - Observe the credit meter (`20/20 Credits remaining`).
  - Click **Search Candidates**.
- **Narration**: *"WorkByLine queries DataVertex's live index of 800M+ profiles using server-authenticated endpoints. The session is protected by a 20-credit ceiling, and phone/email reveals are strictly disabled."*
- **Verification**: Candidate summary cards appear with truthful unverified profile badges and provider-interpreted criteria.

#### Step 4: Inspect Candidate Profile Detail
- **Action**: Click **Load Full Profile** on a candidate card.
- **Narration**: *"The system executes an authenticated single-profile lookup, displaying employment history, education, and skills in a clean slide-over sheet. Data is truthfully labeled as provider-supplied without fabricated verification claims. If DataVertex returns limited or missing contact records, the UI explicitly alerts: 'Full profile unavailable; showing search summary.'"*
- **Verification**: Profile detail sheet opens with full career history, credit status update, and clear notice that contact reveals are disabled.

#### Step 5: Add Candidate to Shortlist
- **Action**: Click **Add to Shortlist**.
- **Narration**: *"The candidate is persisted directly into the role's shortlist table using an atomic transactional database RPC (`public.shortlist_candidate_from_provider_transactional`) with concurrency-safe deduplication indexes. Provenance (DataVertex candidate ID, retrieval timestamp, source URL) is truthfully preserved with status `sourced` and fit_score `NULL`. Unverified profiles increment pending_evaluation and do not falsely inflate evaluations_completed."*
- **Verification**: Button transitions to `Shortlisted ✓` and candidate is stored in the database without ungrounded fit scores.

#### Step 6: Review Candidate Evidence & Record Human Decision
- **Action**: Click **Shortlist** in the navigation header to view `/employer/shortlist/[roleId]`. Open the candidate's packet (`/employer/packet/[extractionId]`). Review available source evidence, and record a human hiring decision (`Advance`, `Hold`, or `Decline`).
- **Narration**: *"Recruiters review genuine candidate statements and corroborated source evidence. All hiring decisions are made and recorded by human authority."*
- **Verification**: Decision state updates persistently and is logged in the audit trail.

---

### Part B: Technical Infrastructure & Evidence Engine Verification

#### Step 7: Context Evidence Panel — Multi-Format Upload
- **Action**:
  1. In the hiring run, navigate to the **Context Evidence Panel**.
  2. Drag and drop or upload sample files:
     - `alex_chen_systems_resume.pdf`
     - `platform_architect_spec.docx`
     - `backend_service_guide.txt`
- **Narration**: *"Recruiters can upload resumes, job descriptions, and team architectural notes across PDF, Word DOCX, and plain text. The documents are ingested into private encrypted storage and registered in the database with strict tenant and run scoping."*
- **Verification**: All three documents appear in the source list with `pending` / `processing` badges.

#### Step 8: Same-Filename Disambiguation & Idempotency
- **Action**: Upload a second file named `platform_architect_spec.docx` with different candidate notes.
- **Narration**: *"In traditional systems, uploading two documents with the same filename often overwrites the original or creates collision errors. WorkByLine treats each independent upload as a distinct, immutable Source with its own unique UUID."*
- **Verification**: Both documents appear in the table with distinct source IDs and independent version histories.

#### Step 9: Real-Time Subsystem Processing Badges
- **Action**: Observe the badge transitions on the uploaded documents.
- **Narration**: *"Temporal orchestrates the workflow. As the worker parses text and generates embeddings using our PyTorch BGE model, the UI updates through live polling: Parsing: Completed, Indexing: Indexed, Graph: Disabled."*
- **Verification**: The badges display `Completed` (green) for parsing and `Indexed` (purple) for dense vector generation.

#### Step 10: Version Revision & Historical Inspection
- **Action**:
  1. Click on a document and choose **Upload New Revision**.
  2. Upload an updated version with new qualifications.
  3. Toggle the version dropdown between `v2 (Current)` and `v1 (Historical)`.
- **Narration**: *"WorkByLine supports explicit document revisions. Previous versions are never overwritten; they remain fully auditable in the version history for compliance."*
- **Verification**: The UI displays the updated text for `v2` and historical text for `v1`.

#### Step 11: Hybrid Dense + Lexical Search with RRF Scoring
- **Action**:
  1. In the search box, enter: `"distributed consensus Paxos replication"`
  2. Click **Search**.
- **Narration**: *"The search engine runs a dual-ranking retrieval combining PostgreSQL full-text search with pgvector cosine distance over 384-dimensional dense vectors. The results are fused using Reciprocal Rank Fusion (RRF). Notice the highlighted matching passages and exact RRF scores."*
- **Verification**: Matching passages are displayed with scores, source filename, and span highlights.

#### Step 12: Transparent Fail-Closed Feature Notice (Zero Mocking)
- **Action**:
  1. Click the **Related Entities** tab or **Ask AI** button.
  2. Observe the clear warning banner.
- **Narration**: *"Notice that instead of fabricating a fake generative AI answer or using a mock fallback, the system truthfully returns a Service Unavailable notice explaining that generative Q&A and knowledge graphs are feature-gated pending customer authorization. This guarantees zero hallucination."*
- **Verification**: Yellow warning banner states: *"Generative Q&A is feature-gated until formal acceptance testing phase."*

#### Step 13: Zero Cross-Run Bleed During In-Flight Switching
- **Action**:
  1. Perform a search query.
  2. Immediately switch hiring runs using the top dropdown selector.
- **Narration**: *"Our UI and API architecture enforces strict context boundaries. If a user switches hiring runs while a query is loading, the previous run's results are immediately canceled, preventing any cross-run state bleed."*
- **Verification**: The new hiring run shows only its own context sources and empty search results.

#### Step 14: Immediate Document Revocation
- **Action**:
  1. Select a document and click **Revoke Source**.
  2. Confirm the revocation dialog.
  3. Repeat the search query.
- **Narration**: *"When an employer revokes a document (e.g. for GDPR right-to-be-forgotten or candidate withdrawal), it is immediately excluded from active UI views and both current and historical search queries."*
- **Verification**: The document disappears from the table, and subsequent searches return 0 results for that document.

---

## 4. Post-Demo Teardown

```bash
# Cleanly terminate all background candidate services
./infra/scripts/launch_workbyline_v3.sh stop
```

