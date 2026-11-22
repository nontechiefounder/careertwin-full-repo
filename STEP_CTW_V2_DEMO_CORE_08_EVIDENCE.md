# STEP CTW-V2-DEMO-CORE-08 EVIDENCE: Integrity Verification & Hosted Acceptance Trace

**Deliverables Directory:** `/Users/darshilparmar/Desktop/CTW_V2_DEMO_CORE_08/`  
**Execution Timestamp:** 2026-10-06T07:13:00Z  
**Starting Commit:** `8f7d0b9`  
**Branch:** `antigravity/ctw-v2-demo-core-08`  
**Worktree:** `/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-v2-demo-worktree`

---

## 1. Migration Execution & Rollback Rehearsal Evidence

### A. Migration 3 Application Command
```bash
docker exec -i supabase_db_careertwin-local-baseline psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20260816000003_strict_rpc_validation_and_audit_history.sql
```
**Output:**
```
CREATE FUNCTION
REVOKE
REVOKE
REVOKE
GRANT
```

### B. Rollback Rehearsal Command (To Core-07 State)
```bash
docker exec -i supabase_db_careertwin-local-baseline psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/rehearsals/rollback_20260816000003.sql
```
**Output:**
```
CREATE FUNCTION
REVOKE
REVOKE
REVOKE
GRANT
```

### C. Live Function Definition and Security Grants Inspection (`live_function_grants.sql`)
```sql
SELECT 
    p.proname,
    pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    p.prosecdef AS is_security_definer,
    p.proconfig AS configuration_search_path,
    p.proacl AS function_grants
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.proname = 'allocate_claim_ledger_revision_and_persist';
```
**Live Database Inspection Output:**
```
-[ RECORD 1 ]---------------+----------------------------------------------------------------------------------------------------------------------------------------------------
proname                     | allocate_claim_ledger_revision_and_persist
identity_arguments          | p_candidate_profile_id uuid, p_hiring_run_id uuid, p_org_id uuid, p_evidence_refs jsonb, p_claims jsonb, p_claim_edges jsonb, p_evaluation_output jsonb, p_candidate_id uuid
is_security_definer         | t
configuration_search_path   | {search_path=public,pg_temp}
function_grants             | {postgres=X/postgres,service_role=X/postgres}
```
**Grant Verification:**
- `anon`: **REVOKED** (No execute access)
- `authenticated`: **REVOKED** (No direct client execute access)
- `public`: **REVOKED**
- `service_role`: **GRANTED**
- `postgres`: **GRANTED**

### D. Eight-Versus-Nine Argument Resolution
The RPC signature takes exactly **8 arguments**:
1. `p_candidate_profile_id` (`uuid`)
2. `p_hiring_run_id` (`uuid`)
3. `p_org_id` (`uuid`)
4. `p_evidence_refs` (`jsonb`)
5. `p_claims` (`jsonb`)
6. `p_claim_edges` (`jsonb`)
7. `p_evaluation_output` (`jsonb`)
8. `p_candidate_id` (`uuid`)

No 9-argument overload exists. Core-07 test and rehearsal references to "9 arguments" were an error in test documentation; the function signature has been verified and confirmed as 8 arguments.

---

## 2. Machine-Readable Vitest Test Suite Results

Full JSON artifact: [`vitest_core08_results.json`](file:///Users/darshilparmar/Desktop/CTW_V2_DEMO_CORE_08/vitest_core08_results.json)

```json
{
  "numTotalTestSuites": 47,
  "numPassedTestSuites": 45,
  "numFailedTestSuites": 0,
  "numPendingTestSuites": 2,
  "numTotalTests": 465,
  "numPassedTests": 463,
  "numFailedTests": 0,
  "numPendingTests": 2,
  "startTime": 1791250995000,
  "success": true
}
```

### Targeted Test Suite: `Core08IntegrityAndAudit.test.jsx`
```
 ✓ __tests__/evals/Core08IntegrityAndAudit.test.jsx (8 tests) 504ms
   ✓ CTW-V2-DEMO-CORE-08 Integrity, RPC Validation & Decision History Tests (8)
     ✓ 1. Unassessed candidate evaluates to exactly uncertainty 0.65 and null fit score in engine 2ms
     ✓ 2. EvidenceDrawer renders clean filename without unexplained (Not available) suffix 78ms
     ✓ 3. CandidateHeader truncates oversized raw bio into a clean role display 9ms
     ✓ 4. allocate_claim_ledger_revision_and_persist rejects brief missing approved_rubric_version 183ms
     ✓ 5. allocate_claim_ledger_revision_and_persist rejects non-array or malformed claims and edges 53ms
     ✓ 6. allocate_claim_ledger_revision_and_persist requires valid 64-hex SHA-256 hashes for document evaluation 42ms
     ✓ 7. allocate_claim_ledger_revision_and_persist enforces no-document invariant 47ms
     ✓ 8. Human decision history preserves legacy decisions with requires_re_review flag 88ms
```

### Ingestion Suite: `IngestionAndProvenanceIntegrity.test.jsx`
```
 ✓ __tests__/evals/IngestionAndProvenanceIntegrity.test.jsx (10 tests) 544ms
   ✓ CTW-V2-DEMO-CORE-07 — Ingestion, Provenance Integrity & Release Hardening Suite (10)
     ✓ 1. Genuine Document Parsing & Parser Provenance (4 tests)
     ✓ 2. RPC Exact Document Binding & Provenance Integrity (3 tests)
     ✓ 3. Rubric Consistency & Stale Evaluation Rejection (1 test)
     ✓ 4. Human Decision History & Re-Review Required Marking (1 test)
     ✓ 5. Evidence Citation Drawer Complete Provenance Display (1 test)
```

---

## 3. Reviewer Persistence & Regeneration Payloads

### A. Initial Decision Persistence (`reviewer_persistence_response.json`)
```json
{
  "action": "hold",
  "status": "hold",
  "actor_id": "00000000-0000-4000-a000-000000000001",
  "actor_email": "synthetic.employer.alpha@example.invalid",
  "rationale": "Candidate demonstrates verified multi-cluster Kubernetes production mastery. Hold pending final compensation and scheduling review.",
  "timestamp": "2026-10-06T01:42:37.766Z",
  "recorded_at": "2026-10-06T01:42:37.766Z",
  "reviewed_ledger_revision": 1,
  "reviewed_rubric_version": "1.0.0",
  "reviewed_document_id": "9aa0be76-68c6-4203-b0bf-d77dc3a00fea",
  "requires_re_review": false,
  "decision_history": [
    {
      "action": "hold",
      "status": "hold",
      "actor_id": "00000000-0000-4000-a000-000000000001",
      "actor_email": "synthetic.employer.alpha@example.invalid",
      "rationale": "Candidate demonstrates verified multi-cluster Kubernetes production mastery. Hold pending final compensation and scheduling review.",
      "timestamp": "2026-10-06T01:42:37.766Z",
      "recorded_at": "2026-10-06T01:42:37.766Z",
      "reviewed_ledger_revision": 1,
      "reviewed_rubric_version": "1.0.0",
      "reviewed_document_id": "9aa0be76-68c6-4203-b0bf-d77dc3a00fea",
      "requires_re_review": false
    }
  ]
}
```

### B. Regeneration Response (`regeneration_response.json`)
```json
{
  "ledger_revision": 2,
  "rubric_version": "1.0.0",
  "approved_rubric_version": "1.0.0",
  "candidate_document_id": "9aa0be76-68c6-4203-b0bf-d77dc3a00fea",
  "filename": "sarah_connor_lead_infra.pdf",
  "file_sha256": "90ebc8dfa402e2da6a47e2e5bdbc8d971fce06f76b5c3a359144ef948473844f",
  "normalized_text_sha256": "ed4a40345abfeb19d4b310d672e7bc2f55c06f702d79e5564eed92bcdd66aae5",
  "parser_name": "pdf-parse@2.4.5",
  "human_decision": {
    "action": "hold",
    "status": "hold",
    "actor_id": "00000000-0000-4000-a000-000000000001",
    "actor_email": "synthetic.employer.alpha@example.invalid",
    "rationale": "Candidate demonstrates verified multi-cluster Kubernetes production mastery. Hold pending final compensation and scheduling review.",
    "reviewed_ledger_revision": 1,
    "reviewed_rubric_version": "1.0.0",
    "reviewed_document_id": "9aa0be76-68c6-4203-b0bf-d77dc3a00fea",
    "requires_re_review": true,
    "re_review_reason": "Packet updated to revision 2 under rubric 1.0.0. Review previous decision.",
    "decision_history": [
      {
        "action": "hold",
        "status": "hold",
        "actor_id": "00000000-0000-4000-a000-000000000001",
        "actor_email": "synthetic.employer.alpha@example.invalid",
        "rationale": "Candidate demonstrates verified multi-cluster Kubernetes production mastery. Hold pending final compensation and scheduling review.",
        "timestamp": "2026-10-06T01:42:37.766Z",
        "recorded_at": "2026-10-06T01:42:37.766Z",
        "reviewed_ledger_revision": 1,
        "reviewed_rubric_version": "1.0.0",
        "reviewed_document_id": "9aa0be76-68c6-4203-b0bf-d77dc3a00fea",
        "requires_re_review": false
      }
    ]
  }
}
```

### C. Unassessed Candidate Packet Response (`unassessed_packet_response.json`)
```json
{
  "fit_score": null,
  "claims": [],
  "evidence_refs": [],
  "claim_edges": [],
  "candidate_document_id": null,
  "filename": null,
  "file_sha256": null,
  "parser_name": null,
  "normalized_text_sha256": null,
  "evaluation_metrics": {
    "role_fit_distribution": {
      "p_low": 0.25,
      "p_limited": 0.25,
      "p_moderate": 0.25,
      "p_strong": 0.25
    },
    "role_fit_label": "Insufficient Evidence",
    "proof_strength": 0,
    "proof_strength_label": "None",
    "proof_coverage": 0,
    "uncertainty": 0.65,
    "entropy": 2,
    "gate_pass": false,
    "must_have_gates_passed": false,
    "blockers_count": 3,
    "decision_readiness": "INSUFFICIENT EVIDENCE"
  }
}
```

---

## 4. End-to-End Browser Screenshots & Acceptance Trace

All screenshots captured at 1440x950 resolution via Playwright against live local runtime:

### Screenshot 01: Fresh Role Intake & Unapproved Rubric
![Fresh Role Intake](/Users/darshilparmar/.gemini/antigravity-ide/brain/fdbd4720-da8d-4cea-ab18-69d6b63a60cf/screenshots/01_fresh_role_created_brief_unapproved.png)
*Role intake generates brief; yellow warning banner displays "Rubric Approval Required Before Evaluation".*

### Screenshot 02: Approved Rubric Persisted Across Reload
![Approved Rubric Persisted](/Users/darshilparmar/.gemini/antigravity-ide/brain/fdbd4720-da8d-4cea-ab18-69d6b63a60cf/screenshots/02_rubric_approved_brief_persisted.png)
*Rubric approved via UI; green banner confirms approval; survives full page reload without disappearing.*

### Screenshot 03: Genuine Document Ingestion via Shortlist Upload
![Genuine Document Ingestion](/Users/darshilparmar/.gemini/antigravity-ide/brain/fdbd4720-da8d-4cea-ab18-69d6b63a60cf/screenshots/03_candidate_ingested_via_genuine_ui_upload.png)
*Synthetic PDF `sarah_connor_lead_infra.pdf` uploaded via shortlist file input; real parser extracts text and registers candidate.*

### Screenshot 04: Packet Generated with Exact Document Binding & workBYLiNE Shell Branding
![Packet Generated with Binding](/Users/darshilparmar/.gemini/antigravity-ide/brain/fdbd4720-da8d-4cea-ab18-69d6b63a60cf/screenshots/04_packet_generated_with_exact_document_binding.png)
*Trust packet generated with exact SHA-256 binding. CandidateHeader renders clean role headline. Nav header displays `workBYLiNE` branding.*

### Screenshot 05: Evidence Citation Drawer Complete Provenance (Clean Filename)
![Evidence Drawer Provenance](/Users/darshilparmar/.gemini/antigravity-ide/brain/fdbd4720-da8d-4cea-ab18-69d6b63a60cf/screenshots/05_citation_drawer_complete_provenance_zero_missing.png)
*Evidence citation drawer displays `sarah_connor_lead_infra.pdf (application/pdf)` without any `(Not available)` suffix. All 9 provenance fields populated.*

### Screenshot 06: Human Decision Recorded with Rationale
![Human Hold Decision](/Users/darshilparmar/.gemini/antigravity-ide/brain/fdbd4720-da8d-4cea-ab18-69d6b63a60cf/screenshots/06_human_hold_decision_recorded_with_rationale.png)
*Reviewer sets status to "Hold for Review" with rationale; green status banner confirms persistence.*

### Screenshot 07: Packet Revision Advanced & Stale Review Warning Visible
![Stale Review Warning Banner](/Users/darshilparmar/.gemini/antigravity-ide/brain/fdbd4720-da8d-4cea-ab18-69d6b63a60cf/screenshots/07_packet_revision_advanced_stale_review_warning.png)
*Packet regenerated to revision 2; amber warning banner displays "⚠️ Fresh Review Required: Packet updated to revision 2 under rubric 1.0.0. Review previous decision."*

### Screenshot 08: Unassessed Candidate Generation (Null Fit Score & Uncertainty 0.65)
![Unassessed Candidate Packet](/Users/darshilparmar/.gemini/antigravity-ide/brain/fdbd4720-da8d-4cea-ab18-69d6b63a60cf/screenshots/08_unassessed_generation_null_fit_score.png)
*Unassessed candidate displays null fit score (`--`), readiness "INSUFFICIENT EVIDENCE", 0 claims, and uncertainty 65% (`0.65`), proving mathematical agreement.*

### Screenshot 09: Cross-Tenant Security Denial
![Cross Tenant Security Denial](/Users/darshilparmar/.gemini/antigravity-ide/brain/fdbd4720-da8d-4cea-ab18-69d6b63a60cf/screenshots/09_security_cross_tenant_denial.png)
*Beta employer context receives strict 404 denial when attempting to access Alpha candidate packet, generate evaluation, or record decisions.*

---

## 5. Sanitized Network Trace Summary (`sanitized_network_trace.json`)

The network trace recorded during browser automation includes 100+ requests with all bearer tokens, Supabase cookies, and passwords sanitized to `[SANITIZED_CREDENTIAL]`.

Key route interactions verified:
- `POST /api/auth/signin` -> 200 OK
- `GET /api/employer/brief/[id]` -> 200 OK
- `POST /api/employer/brief/[id]/approve-rubric` -> 200 OK
- `POST /api/employer/candidate-documents/upload` -> 200 OK
- `POST /api/employer/packets/[id]/generate` -> 200 OK
- `POST /api/employer/packets/[id]/action` -> 200 OK
- `GET /api/employer/packets/[alphaId]` (from Beta context) -> 404 Not Found
- `POST /api/employer/packets/[alphaId]/generate` (from Beta context) -> 404 Not Found
- `POST /api/employer/packets/[alphaId]/action` (from Beta context) -> 404 Not Found
