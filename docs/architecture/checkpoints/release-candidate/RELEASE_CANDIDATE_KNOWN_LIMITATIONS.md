# Release Candidate (RC) — Known Limitations & Operational Boundaries

**Date:** 2026-08-12  
**Baseline Commit:** `0279a9c5d963df65d6927b98876b61e66930f6d2`  
**Target Staging Project:** `headwayos-secondary` (masked ref: `phli...xskd`), Region: `ap-northeast-2`  
**Readiness Classification:** `STATE C — SPECIFIC OPERATIONAL CAPABILITY DEFECT`

---

## Operational Boundaries & Non-Automated Areas

1. **Native Binary PDF/DOCX File Upload Route (STATE C Defect)**:
   - **Current Implementation**: Candidates enter the system via structured JSON extractions (`POST /api/employer/candidate-extractions`).
   - **Missing Capability**: A native multipart HTTP API route (`POST /api/employer/candidate-files/upload`) for uploading and streaming raw PDF and DOCX files directly from the web client.
   - **Operational Mitigation**: For the founder-assisted private pilot, candidates are ingested via structured JSON extractions or batch CLI scripts into Supabase.

2. **Candidate Screening UI Scope**:
   - The candidate screening UI view (`/candidate/screen/[sessionId]`) displays questions, captures submitted answers, updates database state (`screening_answers`), and generates AI screening summaries (`screening_summaries`). Voice/video screening remains out of scope for the standalone MVP.

3. **External Systems Integrations**:
   - ATS (Greenhouse, Lever), HRIS, ERP, email/calendar automation, and scraping tools are strictly forbidden by architectural rules (`AGENTS.md`). All pilot operations run on synthetic files and hosted staging Supabase.

4. **Service-Role Privilege Boundary**:
   - Route authorization (`requireUser` + `getVerifiedOrgMembership`) executes **BEFORE** any `createSupabaseServerClient(request, true)` call is instantiated. Service-role key remains strictly server-side in Node.js runtime.

5. **Decision Authority**:
   - CareerTWiN supports human interview prioritization and evidence verification. It does NOT make autonomous hiring or rejection decisions. Final hiring authority remains 100% human.
