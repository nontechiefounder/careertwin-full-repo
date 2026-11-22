# CareerTWiN v2 Demo — Core-09 Audit Corrections Report
**Task Identifier**: `CTW-CORE09-AUDIT-CORRECTIONS`  
**Baseline Commit**: `128c7c7dce8979a9251858532ec4de497d67f58a`  
**Corrective Patch Commit SHA**: `2129826a3646761728ccc31453697f23418be458`  
**Worktree Location**: `/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-v2-demo-worktree`  
**Branch**: `antigravity/ctw-v2-demo-core-09`  
**Status**: All 6 Audit Findings `FIXED` | 509/509 Suite Tests Passed (100%) | Customer Journey Passed

---

## Executive Summary & Audit Resolution

Following independent inspection of the baseline implementation (`128c7c7`), all six audit findings (`C09-01` through `C09-06`) were resolved and verified with real database assertions, deterministic concurrency synchronization, actual PDF ingestion, and visible DOM assertions.

| Finding | Description | Baseline Defect | Resolution Status | Primary Verification Suite |
| :--- | :--- | :--- | :--- | :--- |
| **C09-01** | Revision & Rubric Optimistic Concurrency | Optional or missing parameters could permit unversioned review mutation; missing candidate packet metadata did not fail closed | **FIXED** | `Core09RouteSecurityAndDecoupling.test.js` (Tests 3.1–3.7) |
| **C09-02** | Upload Tenant Authorization & Profile Security | Supplying `candidate_id` without `hiring_run_id` or direct `candidate_profiles` lookup did not assert org ownership before storage writes | **FIXED** | `Core09RouteSecurityAndDecoupling.test.js` (Tests 1.5, 1.6, 1.8, 1.9) |
| **C09-03** | Rubric Approval Verification & Dangling Edge RPC Integrity | Rubric approval metadata (`approved_by`, `approved_at`) not validated under transaction lock; nullable `bool_or` allowed dangling edges | **FIXED** | `Core09UploadAndProvenanceIntegrity.test.jsx` (Tests 1.4–1.11) |
| **C09-04** | 3-Way Skill List vs Resume Assertion vs Code Corroboration | Resume action verbs inflated self-reported claims to `VERIFIED`; heading lookback misclassified experience paragraphs as skill lists | **FIXED** | `Core09UploadAndProvenanceIntegrity.test.jsx` (Tests 2.1–2.5) |
| **C09-05** | Multi-Page PDF Parser Ingestion & Page-Two Provenance | Parser metadata omitted `page_spans` array in schema persistence; page 2 citations defaulted to page 1 or ungrounded character offsets | **FIXED** | `Core09UploadAndProvenanceIntegrity.test.jsx` (Tests 3.3–3.5) |
| **C09-06** | Concurrency Synchronization, Rollback Proof & Warning DOM | Concurrency lacked deterministic overlap proof; rollback test did not force post-update failure; stale warning lacked DOM assertion | **FIXED** | `Core09TransactionalDecisionsAndConcurrency.test.jsx` (Tests B, D, F) |

---

## Detailed Finding Analysis & Fix Validations

### C09-01: Action Route & Decision RPC Revision Contract
- **Requirement**: Require `expected_ledger_revision` and `expected_rubric_version` in the action route (`/api/employer/packets/[extractionId]/action`) and decision RPC (`record_human_decision_transactional`). Reject missing, malformed, or stale values without mutation. Missing current packet metadata must fail closed.
- **Implementation**:
  - `action/route.js` validates that `expected_ledger_revision` is a positive integer (`typeof === 'number' && Number.isInteger && > 0`) and `expected_rubric_version` is a non-empty string. Rejects invalid inputs with HTTP 400 (`INVALID_REVISION` / `INVALID_RUBRIC_VERSION`).
  - `action/route.js` checks candidate `decision_packet`. If missing or lacking valid `ledger_revision` / `rubric_version`, it fails closed with HTTP 409 `REVIEW_REVISION_CONFLICT` and `requires_refresh: true`.
  - Database RPC `record_human_decision_transactional` verifies that `v_cand_rec.decision_packet` has a valid `ledger_revision` and `rubric_version`, matching `p_expected_ledger_revision` and `p_expected_rubric_version`.
- **Verdict**: **FIXED**

---

### C09-02: Organization Ownership & Permitted Hiring-Run Relationships
- **Requirement**: Validate organization ownership and permitted hiring-run relationships for every supplied candidate/profile identifier, including uploads without `hiring_run_id` and direct `candidate_profiles` ID lookups. Reject unauthorized relationships before storage or database writes.
- **Implementation**:
  - `candidate-documents/upload/route.js` Step 5 now inspects both candidate rows and direct `candidate_profiles` lookups.
  - If a caller supplies a `candidate_id` belonging to a foreign tenant (via candidate row or linked hiring runs/documents), it returns HTTP 403 `FORBIDDEN` or HTTP 404 before calling `supabaseService.storage.from(...).upload()`.
  - Direct `candidate_profiles` lookups verify that the profile is associated with at least one candidate record or document owned by the caller's organization. Isolated foreign profiles are rejected with HTTP 403 `FORBIDDEN`.
- **Verdict**: **FIXED**

---

### C09-03: RPC Rubric Approval Verification & Dangling Edge Integrity
- **Requirement**: Under the packet RPC transaction lock, validate explicit rubric approval (`contract_approved`), approval metadata (`approved_by`, `approved_at`), and agreement with the current hiring-run rubric version. Replace nullable `bool_or` with null-safe existence checks (`EXISTS`). Test dangling edges with empty claims or evidence arrays.
- **Implementation**:
  - In `allocate_claim_ledger_revision_and_persist`, the `hiring_runs` row is locked (`FOR UPDATE`).
  - Validates `(v_run_rec.brief_json->>'contract_approved')::boolean = true`.
  - Requires non-empty `v_run_rec.brief_json->>'approved_by'` and `v_run_rec.brief_json->>'approved_at'`.
  - Replaced legacy `bool_or` with null-safe `NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_claims, '[]'::jsonb)) ...)` and `p_evidence_refs`.
  - Successfully rejects dangling edges when `p_claims` is empty array (`'[]'::jsonb`) and when `p_evidence_refs` is empty array (`'[]'::jsonb`).
- **Verdict**: **FIXED**

---

### C09-04: 3-Way Signal Separation & Anti-Inflation Engine
- **Requirement**: Separate skill-list mentions, detailed resume assertions, and independently corroborated evidence. Resume action words alone must not produce corroborated/`VERIFIED` status; do not label an experience paragraph as a skill list because of a nearby heading.
- **Implementation**:
  - `apps/web/lib/evidenceExtractor.js`: Replaced naive 120-character heading lookback with strict line-level boundary analysis. If a sentence has action verbs or work experience phrasing, it is classified as `source_type: 'resume_assertion'`, `status: 'INFERRED'` with confidence 0.60.
  - Resume action words no longer elevate status to `VERIFIED`. Only code files, repositories, or verified third-party proofs yield `source_type: 'corroborated'`, `status: 'VERIFIED'`.
  - `packages/proof-engine/src/evaluations.ts`: Detailed resume assertions provide proof coverage without inflating status to `VERIFIED` or confusing coverage with the Must-Have gate.
  - `packages/proof-engine/src/index.ts`: Candidates with detailed resume assertions compute expected fit score, resulting in `NEEDS PROOF` when Must-Haves are unsatisfied, while ungrounded/document-free candidates remain unassessed (`INSUFFICIENT EVIDENCE`).
- **Verdict**: **FIXED**

---

### C09-05: Multi-Page PDF Parser Ingestion & Page-Two Provenance
- **Requirement**: Ingest `parser_metadata.page_spans` and `total_pages` from actual parser return structure. Prove 2-page Sarah Connor PDF (`fixtures/sarah_connor_lead_infra.pdf`) persists 2 pages, and prove a page-two citation has exact page number and character offsets.
- **Implementation**:
  - `apps/web/lib/parser/documentParser.js`: Exposes `total_pages`, `page_count`, and `page_spans` at top-level and inside `parser_metadata`.
  - `apps/web/app/api/employer/candidate-documents/upload/route.js`: Persists `total_pages`, `page_count`, `char_count`, and `page_spans` into `candidate_documents.parser_metadata`.
  - `apps/web/lib/evidenceExtractor.js`: `createSpanEvidence` matches character offsets against `page_spans` boundaries (`startOffset >= s.start_char && startOffset <= s.end_char`) to assign truthful page numbers.
  - Tested on `fixtures/sarah_connor_lead_infra.pdf` (1,925 bytes): proves 2 pages parsed, persisted in database, and page 2 citation for "GitOps" carries `source_offset.page: 2` and character offsets `545-636` within page 2 boundaries (`474-951`).
- **Verdict**: **FIXED**

---

### C09-06: Concurrency Serialization, Forced Rollback & Visible Warning DOM
- **Requirement**: Execute an actual overlapping regeneration vs. review concurrency test; force an `activity_events` insertion failure after the decision update would occur and prove complete rollback. Verify the actual two-page PDF and page-two citation. Capture Fresh Review Required with a visible DOM assertion.
- **Implementation**:
  - **Overlapping Concurrency**: Test B in `Core09TransactionalDecisionsAndConcurrency.test.jsx` executes `allocate_claim_ledger_revision_and_persist` (holding row lock with `pg_sleep`) concurrently with `record_human_decision_transactional` (attempting action on revision 1). When regeneration commits revision 2, the serialized review catches the revision conflict and returns `REVIEW_REVISION_CONFLICT`.
  - **Forced Post-Update Rollback**: Test D installs a `BEFORE INSERT` trigger on `public.activity_events` that raises an exception specifically after the `UPDATE candidates SET status = ...` query executes. Proves complete atomic rollback: candidate row status and decision packet are 100% unchanged.
  - **Visible Warning DOM Assertion**: Test F renders `<HumanDecisionRail>` in jsdom with `requires_re_review: true`. Asserts `data-testid="stale-review-warning"` is present, visible (`toBeVisible()`), and contains `"Fresh Review Required:"`.
  - **Playwright Production Journey**: Automated journey executed against Next.js on port 3003; captured `07_packet_revision_advanced_fresh_review_required.png` with visible warning banner in browser.
- **Verdict**: **FIXED**

---

## Hosted-Staging Acceptance Readiness

Local hardening is complete. The build is frozen and prepared for founder review on hosted-staging without deployment:

1. **Email Dry-Run**: `CAREERTWIN_DRY_RUN_EMAIL=true` remains enabled and strictly enforced (zero external SMTP/Gmail transmissions).
2. **Genome Repository Integrity**: Repositories under `/Users/darshilparmar/Desktop/Genome` remain untouched.
3. **Customer Data Restrictions**: Zero real customer data, tokens, or credentials used or stored.
4. **Git Tree Cleanliness**: All fixes committed to branch `antigravity/ctw-v2-demo-core-09` at commit `2129826a3646761728ccc31453697f23418be458`.
