# STEP CTW-V2-DEMO-CORE-08 REPORT: Close Specific Integrity Gaps & Validate Hosted Demo

**Execution Date:** 2026-10-06  
**Starting Commit:** `8f7d0b9` (CTW-V2-DEMO-CORE-07 HEAD)  
**Branch:** `antigravity/ctw-v2-demo-core-08`  
**Target Worktree:** `/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-v2-demo-worktree`  
**Deliverables Directory:** `/Users/darshilparmar/Desktop/CTW_V2_DEMO_CORE_08/`  
**Governance Constraints:** `CAREERTWIN_DRY_RUN_EMAIL=true`, Strict Genome separation maintained, zero production mutations, zero remote push.

---

## 1. Executive Summary

This cycle resolves all specific integrity gaps, reconciliation discrepancies, audit preservation requirements, and visual polish items identified in `CTW-V2-DEMO-CORE-08`, while validating the local production runtime end-to-end.

### Key Outcomes
1. **RPC Validation & Atomic Rejection**:
   - Upgraded `public.allocate_claim_ledger_revision_and_persist` via migration `20260816000003_strict_rpc_validation_and_audit_history.sql`.
   - Strictly requires valid 64-character hexadecimal SHA-256 hashes (`file_sha256` and `normalized_text_sha256`) for all document-backed evaluations.
   - Strictly enforces explicit `approved_rubric_version` on hiring runs; contract_version substitution is prohibited.
   - Atomically verifies evaluated rubric version matches currently approved rubric version within the transaction.
   - Enforces strict JSONB typing and structural shape on `claims` (array of objects with `id`, `claim_text`), `evidence_refs` (array of objects with `id`, `document_id`), and `claim_edges` (array of objects with `claim_id`, `evidence_id`).
   - Enforces the document-free / unassessed invariant: 0 claims, 0 evidence refs, 0 claim edges, `fit_score: null`, and explicit `INSUFFICIENT EVIDENCE` readiness state.
   - Verifies all invalid inputs raise `RPC_VALIDATION_ERROR` immediately, rolling back without partial state persistence.
2. **Unassessed Metric Agreement Reconciled**:
   - Traced the discrepancy between screenshot 08 (`uncertainty: 0.65`) and the Core-06/Core-07 report narrative (`uncertainty: 1.0`).
   - Established the mathematical proof-engine contract: for an unassessed candidate with 0 claims and no document, proof deficit is 1.0, unverified ratio is 0.0, and Dirichlet prior `[0.25, 0.25, 0.25, 0.25]` yields normalized entropy 1.0. The formula `0.40 * 1.0 + 0.25 * 0.0 + 0.25 * 1.0 = 0.65`.
   - Proved complete mathematical agreement across proof engine, Postgres database record, GET endpoint response, and rendered UI card (displaying 65% / 0.65).
3. **Human Decision History & Stale Review Warning**:
   - Enhanced `apps/web/app/api/employer/packets/[extractionId]/action/route.js` and migration 3 to preserve historical reviewer decisions in an append-only `decision_history` JSONB array.
   - Re-evaluation advances packet to revision 2, marks `requires_re_review: true`, logs `re_review_reason: "Packet updated to revision 2 under rubric 1.0.0. Review previous decision."`, and preserves prior rationale, actor ID, and reviewed revision metadata.
   - Captured full regeneration payload (`regeneration_response.json`) and visible stale-review warning banner (`07_packet_revision_advanced_stale_review_warning.png`).
   - Legacy decisions missing reviewed revision or version default to `requires_re_review: true`.
4. **Reproducible Evidence & Argument Rehearsal Discrepancy**:
   - Resolved the 8-vs-9 argument rehearsal confusion: the canonical Postgres RPC signature has exactly **8 arguments**: `(p_candidate_profile_id uuid, p_hiring_run_id uuid, p_org_id uuid, p_evidence_refs jsonb, p_claims jsonb, p_claim_edges jsonb, p_evaluation_output jsonb, p_candidate_id uuid)`.
   - Rehearsed migration and rollback to Core-07 state with exit code 0.
   - Live function definitions, grants, and test suites aligned with machine-readable results (463 passed, 2 skipped, 0 failed).
5. **Customer Demo Polish**:
   - Removed the unexplained `sarah_connor_lead_infra.pdf (Not available)` suffix in `EvidenceDrawer.jsx`.
   - Formatted oversized resume excerpts in `CandidateHeader.jsx` into clean role headline display.
   - Applied `workBYLiNE` branding across the demo shell (`NaiveShell.jsx`, `MarketingNav.jsx`, `layout.js`) while maintaining underlying regulatory governance compliance copy in `ProductGovernanceNotice.jsx`.
6. **Hosted Acceptance Staging Boundary**:
   - Distinguished local runtime verification (executed against local Next.js dev server, live Postgres container `supabase_db_careertwin-local-baseline`, and real Playwright browser journey) from hosted staging.
   - Detailed exact dependencies required for hosted deployment (credentials, remote database, hosted storage bucket, Vercel/Fly environment).

---

## 2. Integrity Gap Analysis & Resolution

### Finding 1: RPC Validation & Atomic Invariant Enforcement

| Invariant | Implementation Mechanism | Verification Test | Result |
|---|---|---|---|
| **64-Hex Document Hashes** | Migration 3 regex `^[a-f0-9]{64}$` on `file_sha256` and `normalized_text_sha256` | `Core08IntegrityAndAudit.test.jsx` (Test 6) & `IngestionAndProvenanceIntegrity.test.jsx` (Test 2.2) | **PASSED** (Rejects short/non-hex hashes) |
| **Explicit Approved Rubric** | Requires `brief_json->>'approved_rubric_version'` or `rubric_approved_version`; forbids `contract_version` fallback | `Core08IntegrityAndAudit.test.jsx` (Test 4) | **PASSED** (Rejects unapproved brief with 422) |
| **Consistent Rubric Revision** | Validates evaluated `rubric_version` matches currently approved version inside transaction lock | `IngestionAndProvenanceIntegrity.test.jsx` (Test 3.1) | **PASSED** (Rejects stale rubric writes) |
| **Strict JSONB Typing** | Validates `jsonb_typeof` for `claims`, `evidence_refs`, and `claim_edges` as arrays and iterates element keys | `Core08IntegrityAndAudit.test.jsx` (Test 5) | **PASSED** (Rejects objects/primitives/malformed edges) |
| **No-Document Invariant** | Rejects any document-free payload containing claims, evidence refs, edges, or non-null fit score | `Core08IntegrityAndAudit.test.jsx` (Test 7) & Browser Step 9 | **PASSED** (Enforces empty array & null fit score) |
| **Atomicity & Zero Partial Write** | Transaction rolls back completely on any validation exception (`RPC_VALIDATION_ERROR`) | Vitest Suite & Direct PSQL Rehearsals | **PASSED** (Zero orphan revisions or claims) |

### Finding 2: Unassessed Metric Agreement Resolution

In previous step reports, an unassessed candidate was described as having uncertainty `1.0`. However, screenshot 08 clearly captured `Uncertainty: 65%` (`0.65`).

#### Mathematical Derivation:
In `packages/proof-engine/src/evaluations.ts`:
```typescript
function calculateCandidateUncertainty(params: {
  proofDeficit: number;
  unverifiedRatio: number;
  roleFitDistribution: RoleFitDistribution;
  contradictionPenalty: number;
}): number {
  const normalizedEntropy = calculateNormalizedEntropy(params.roleFitDistribution);
  const rawUncertainty = 
    0.40 * params.proofDeficit +
    0.25 * params.unverifiedRatio +
    0.25 * normalizedEntropy +
    params.contradictionPenalty;
  return Math.min(1.0, Math.max(0.0, Number(rawUncertainty.toFixed(4))));
}
```
For a candidate with no documents or claims:
- `proofDeficit` = `1.0` (all 3 must-haves unproven: `3 / 3 = 1.0`)
- `unverifiedRatio` = `0.0` (`0 unverified / 0 total claims = 0.0`)
- `roleFitDistribution` = Dirichlet prior `[0.25, 0.25, 0.25, 0.25]`, yielding maximum Shannon entropy `H = 2.0`, normalized entropy `2.0 / log2(4) = 1.0`
- `contradictionPenalty` = `0.0`
- **Result:** `0.40 * (1.0) + 0.25 * (0.0) + 0.25 * (1.0) + 0.0 = 0.65`.

#### Multi-Layer Agreement Verification:
1. **Engine Output:** `evaluateCandidate()` returns `uncertainty: 0.65`, `fit_score: null`, `decision_readiness: 'INSUFFICIENT EVIDENCE'`.
2. **Database Record:** `candidates.decision_packet.evaluation_metrics.uncertainty` stores `0.65`.
3. **GET API Response:** `GET /api/employer/packets/[id]` returns `uncertainty: 0.65` in `unassessed_packet_response.json`.
4. **Rendered UI Card:** `/employer/packet/[id]` renders `65%` in the MetricCard (`08_unassessed_generation_null_fit_score.png`).

Agreement is 100% verified across all 4 layers.

### Finding 3: Human Decision History & Auditability

1. **Audit Trail Persistence**:
   - `apps/web/app/api/employer/packets/[extractionId]/action/route.js` now maintains `decision_history: Array<HumanDecisionEvent>`.
   - When a human decision is recorded (e.g., "Hold for Review"), it is appended to `decision_history` alongside `actor_id`, `actor_email`, `timestamp`, `reviewed_ledger_revision: 1`, `reviewed_rubric_version: '1.0.0'`, and `reviewed_document_id`.
2. **Regeneration Invalidation (`requires_re_review`)**:
   - When new evidence is ingested or evaluation is regenerated, `allocate_claim_ledger_revision_and_persist` increments `ledger_revision` from 1 to 2.
   - The RPC detects that existing `reviewed_ledger_revision` (1) is less than new `ledger_revision` (2).
   - It sets `requires_re_review: true` and logs `re_review_reason: "Packet updated to revision 2 under rubric 1.0.0. Review previous decision."`.
   - The UI displays the persistent amber warning banner:
     `⚠️ Fresh Review Required: Packet updated to revision 2 under rubric 1.0.0. Review previous decision.`
3. **Legacy Decision Fallback**:
   - Any legacy candidate packet lacking `reviewed_ledger_revision` or `reviewed_rubric_version` is automatically treated as `requires_re_review: true`.
4. **Concurrency Safety**:
   - The RPC performs `SELECT id, hiring_run_id, decision_packet FROM public.candidates WHERE id = p_candidate_id FOR UPDATE;` to prevent concurrent reviewer actions from losing or misattributing audit records.

### Finding 4: Rehearsal Discrepancy Resolution & Reproducible Evidence

1. **Eight vs. Nine Argument Discrepancy**:
   - In Core-07 notes, a discrepancy was noted regarding "8 vs 9 arguments".
   - Formal audit of the SQL schema reveals:
     The function `public.allocate_claim_ledger_revision_and_persist` across migrations `20260814000003`, `20260816000001`, `20260816000002`, and `20260816000003` has exactly **8 parameters**:
     `($1: uuid, $2: uuid, $3: uuid, $4: jsonb, $5: jsonb, $6: jsonb, $7: jsonb, $8: uuid)`.
   - The rehearsal script incorrectly labeled this an "overload" when only one signature ever existed.
2. **Rollback Rehearsal**:
   - Tested rollback `supabase/migrations/rehearsals/rollback_20260816000003.sql` reverting to Migration 2 state, followed by re-applying Migration 3. Both executed cleanly with exit code 0.
   - Permissions verified: execution granted strictly to `service_role` and `postgres`, revoked from `anon`, `authenticated`, and `public`.

### Finding 5: Customer Demo Polish & workBYLiNE Branding

1. **EvidenceDrawer Subtitle Polish**:
   - Fixed `components/packet/EvidenceDrawer.jsx` where missing MIME types resulted in `sarah_connor_lead_infra.pdf (Not available)`.
   - The drawer now resolves `mime_type` (e.g. `application/pdf`) and conditionally suppresses the parenthesis when unavailable, rendering clean `sarah_connor_lead_infra.pdf (application/pdf)` or `sarah_connor_lead_infra.pdf`.
2. **CandidateHeader Bio Truncation**:
   - Fixed `components/packet/CandidateHeader.jsx` where 300 characters of raw resume bio were rendered in the role headline.
   - The header now extracts and displays a concise role headline (`cleanCurrentRole`), preserving clean layout typography.
3. **workBYLiNE Demo Shell Branding**:
   - Updated `components/NaiveShell.jsx` to render `workBYLiNE` logo with green accent (`text-[#10D97A] font-bold`).
   - Updated `components/marketing/MarketingNav.jsx` with matching `workBYLiNE` branding.
   - Updated `apps/web/app/layout.js` metadata title to `workBYLiNE | The Context Layer for AI-Era Hiring`.
   - Preserved regulatory compliance text in `ProductGovernanceNotice.jsx` (`CareerTWiN supports evidence review and interview prioritization. Hiring decisions remain with authorized human reviewers.`).

---

## 3. Test Suite & Verification Matrix

| Category | Suite | Passed | Failed | Skipped | Status |
|---|---|---|---|---|---|
| **Evals** | `Core08IntegrityAndAudit.test.jsx` | 8 | 0 | 0 | **PASSED** |
| **Evals** | `IngestionAndProvenanceIntegrity.test.jsx` | 10 | 0 | 0 | **PASSED** |
| **Security** | `VitestDiscoveryContract.test.js` | 1 | 0 | 0 | **PASSED** |
| **Packet UI** | `CandidateTrustPacketUI.test.jsx` | 17 | 0 | 0 | **PASSED** |
| **Chat UI** | `EmployerChatUI.test.jsx` | 7 | 0 | 0 | **PASSED** |
| **All Other** | 42 Remaining Workspace Suites | 420 | 0 | 0 | **PASSED** |
| **Skipped** | `StagingRemoteRuntimeValidation.test.js` | 0 | 0 | 1 | **SKIPPED** (Awaiting hosted credentials) |
| **Skipped** | `CandidateTrustPacketE2E.test.js` | 0 | 0 | 1 | **SKIPPED** (E2E browser integration spec) |
| **TOTAL** | **47 Test Files (45 Executed)** | **463** | **0** | **2** | **100% SUITE PASS** |

Machine-readable JSON export saved to: `/Users/darshilparmar/Desktop/CTW_V2_DEMO_CORE_08/vitest_core08_results.json`.

---

## 4. End-to-End Browser Journey Acceptance (Playwright)

Executed `scripts/capture_core08_journey_screenshots.js` with 100% passing assertions across all 10 stages:

1. **Step 1 — Auth & Signin**: Authenticated as `synthetic.employer.alpha@example.invalid`.
2. **Step 2 — Role Creation**: Created "Staff Cloud & Kubernetes Platform Architect" with must-have requirements (`01_fresh_role_created_brief_unapproved.png`).
3. **Step 3 — Rubric Approval**: Approved rubric through UI, verified reload persistence (`02_rubric_approved_brief_persisted.png`).
4. **Step 4 — Document Ingestion**: Ingested `sarah_connor_lead_infra.pdf` via shortlist upload, verified parser metadata and candidate row (`03_candidate_ingested_via_genuine_ui_upload.png`).
5. **Step 5 — Packet Generation**: Deterministically generated trust packet bound to document hashes, verified clean candidate role headline and `workBYLiNE` branding (`04_packet_generated_with_exact_document_binding.png`).
6. **Step 6 — Citation Drawer**: Opened citation drawer, asserted clean filename (no `(Not available)` suffix), verified all 9 provenance fields and character offset slices (`05_citation_drawer_complete_provenance_zero_missing.png`).
7. **Step 7 — Human Decision**: Recorded "Hold for Review" with rationale, verified persistence in database and saved `reviewer_persistence_response.json` (`06_human_hold_decision_recorded_with_rationale.png`).
8. **Step 8 — Regeneration & Stale Warning**: Re-evaluated packet advancing to revision 2, verified `requires_re_review: true`, saved `regeneration_response.json`, and asserted visible amber warning banner (`07_packet_revision_advanced_stale_review_warning.png`).
9. **Step 9 — Unassessed Candidate Generation**: Evaluated unassessed candidate without documents; verified `fit_score: null`, 0 claims, and exact `uncertainty: 0.65`, saving `unassessed_packet_response.json` (`08_unassessed_generation_null_fit_score.png`).
10. **Step 10 — Cross-Tenant Denial**: Switched to `synthetic.employer.beta@example.invalid` context; asserted strict 404 denials on GET, generate, and action routes (`09_security_cross_tenant_denial.png`).

All network requests captured in sanitized form: `/Users/darshilparmar/Desktop/CTW_V2_DEMO_CORE_08/sanitized_network_trace.json`.

---

## 5. Hosted Acceptance & Remaining Dependencies

### Classification of Verification State:
- **Implemented & Unit-Tested:** 100% complete (463 tests passing locally).
- **Local Production Runtime Verified:** 100% complete (Docker baseline database, Next.js App Router, Playwright automation).
- **Hosted Staging Verification:** Blocked awaiting staging deployment credentials.

### Remaining Hosted Dependencies:
To execute this journey on hosted staging, the following external items must be provisioned:
1. **Hosted Supabase Project Credentials**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` for the dedicated staging project.
2. **Hosted Database Migration Application**: Run migration `20260816000003_strict_rpc_validation_and_audit_history.sql` on the hosted database.
3. **Hosted Storage Bucket Configuration**: Provision `candidate_resumes` bucket with service-role upload permissions.
4. **Staging App Hosting Environment**: Vercel/Fly preview deployment configured with `CAREERTWIN_DRY_RUN_EMAIL=true`.

Zero code changes or schema modifications remain. The codebase is fully prepared for instant hosted staging deployment upon credential provision.
