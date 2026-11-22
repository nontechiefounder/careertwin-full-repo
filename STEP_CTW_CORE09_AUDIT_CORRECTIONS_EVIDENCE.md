# CareerTWiN v2 Demo — Core-09 Audit Corrections Evidence
**Task Identifier**: `CTW-CORE09-AUDIT-CORRECTIONS`  
**Patch Commit SHA**: `2129826a3646761728ccc31453697f23418be458`  
**Baseline Commit**: `128c7c7dce8979a9251858532ec4de497d67f58a`  
**Worktree**: `/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-v2-demo-worktree`  
**Branch**: `antigravity/ctw-v2-demo-core-09`  
**Local Supabase DB**: `supabase_db_careertwin-local-baseline` (PostgreSQL 17.6 on port 54332)

---

## 1. Initial State & Preservation Checkpoints

Before modifying any source code, working-tree state was captured and recoverable local database backups were persisted:
- **Baseline Migration Diff**: `evidence/uncommitted_migration_baseline.patch` (7,050 bytes)
- **Database Dump**: `evidence/local_db_checkpoint_pre_core09_audit.sql` (1,266,484 bytes)
- **Target Verification**:
  ```bash
  $ docker ps --filter name=supabase_db_careertwin-local-baseline --format "{{.Names}} ({{.Status}})"
  supabase_db_careertwin-local-baseline (Up 2 hours)
  ```

---

## 2. Evidence by Audit Finding

### Finding C09-01: Action Route & Decision RPC Revision Contract
- **Status**: `FIXED`
- **Diff Highlights**:
  ```diff
  --- a/apps/web/app/api/employer/packets/[extractionId]/action/route.js
  +++ b/apps/web/app/api/employer/packets/[extractionId]/action/route.js
  @@ -32,6 +32,18 @@ export async function POST(req, { params }) {
  +    const { action, rationale, expected_ledger_revision, expected_rubric_version } = body;
  +    if (typeof expected_ledger_revision !== 'number' || !Number.isInteger(expected_ledger_revision) || expected_ledger_revision <= 0) {
  +      return NextResponse.json({ error: 'INVALID_REVISION', details: 'Positive integer expected_ledger_revision required' }, { status: 400 });
  +    }
  +    if (!expected_rubric_version || typeof expected_rubric_version !== 'string' || !expected_rubric_version.trim()) {
  +      return NextResponse.json({ error: 'INVALID_RUBRIC_VERSION', details: 'Non-empty expected_rubric_version required' }, { status: 400 });
  +    }
  +    const currentPacket = candidateRow.decision_packet;
  +    if (!currentPacket || currentPacket.ledger_revision == null || !currentPacket.rubric_version) {
  +      return NextResponse.json({ error: 'REVIEW_REVISION_CONFLICT', requires_refresh: true }, { status: 409 });
  +    }
  ```
- **Exact Assertions**:
  ```javascript
  // apps/web/__tests__/evals/Core09RouteSecurityAndDecoupling.test.js
  it('3.3 rejects request when expected_ledger_revision is missing (HTTP 400 INVALID_REVISION)');
  it('3.4 rejects request when expected_ledger_revision is malformed (HTTP 400 INVALID_REVISION)');
  it('3.5 rejects request when expected_rubric_version is missing or empty (HTTP 400 INVALID_REVISION)');
  it('3.6 fails closed with HTTP 409 when candidate decision_packet metadata is missing');
  it('3.7 returns HTTP 409 when expected_rubric_version does not match current packet rubric_version');
  ```
- **Raw Test Result**:
  ```
  ✓ 3.3 rejects request when expected_ledger_revision is missing (HTTP 400 INVALID_REVISION) 0ms
  ✓ 3.4 rejects request when expected_ledger_revision is malformed (HTTP 400 INVALID_REVISION) 0ms
  ✓ 3.5 rejects request when expected_rubric_version is missing or empty (HTTP 400 INVALID_REVISION) 0ms
  ✓ 3.6 fails closed with HTTP 409 when candidate decision_packet metadata is missing 0ms
  ✓ 3.7 returns HTTP 409 when expected_rubric_version does not match current packet rubric_version 0ms
  ```

---

### Finding C09-02: Organization Ownership & Permitted Hiring-Run Relationships
- **Status**: `FIXED`
- **Diff Highlights**:
  ```diff
  --- a/apps/web/app/api/employer/candidate-documents/upload/route.js
  +++ b/apps/web/app/api/employer/candidate-documents/upload/route.js
  @@ -176,6 +176,30 @@ export async function POST(req) {
  +        const { data: candLinks } = await supabaseService.from('candidates')
  +          .select('id, hiring_run_id, hiring_runs(id, org_id)')
  +          .eq('candidate_id', existingProf.id);
  +        const candInTargetOrg = candLinks?.filter(c => c.hiring_runs?.org_id === orgId) || [];
  +        const candInOtherOrg = candLinks?.filter(c => c.hiring_runs?.org_id && c.hiring_runs.org_id !== orgId) || [];
  +        const { data: docLinks } = await supabaseService.from('candidate_documents')
  +          .select('id, org_id').eq('candidate_id', existingProf.id);
  +        const docInTargetOrg = docLinks?.filter(d => d.org_id === orgId) || [];
  +        const docInOtherOrg = docLinks?.filter(d => d.org_id && d.org_id !== orgId) || [];
  +        if ((candInOtherOrg.length > 0 || docInOtherOrg.length > 0) && candInTargetOrg.length === 0 && docInTargetOrg.length === 0) {
  +          return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  +        }
  ```
- **Exact Assertions**:
  ```javascript
  it('1.8 rejects candidate document upload when candidate belongs to a foreign organization (no storage/db writes)', async () => {
    const res = await uploadRoute(req);
    expect(res.status).toBe(403);
    expect(mockStorage.from().upload).not.toHaveBeenCalled();
  });

  it('1.9 rejects direct candidate_profiles lookup when candidate_profile has no relationship to caller organization', async () => {
    const res = await uploadRoute(req);
    expect(res.status).toBe(403);
    expect(mockStorage.from().upload).not.toHaveBeenCalled();
  });
  ```
- **Raw Test Result**:
  ```
  ✓ 1.8 rejects candidate document upload when candidate belongs to a foreign organization (no storage/db writes) 0ms
  ✓ 1.9 rejects direct candidate_profiles lookup when candidate_profile has no relationship to caller organization 0ms
  ```

---

### Finding C09-03: RPC Rubric Approval Verification & Dangling Edge Integrity
- **Status**: `FIXED`
- **Diff Highlights**:
  ```diff
  --- a/supabase/migrations/20260817000001_core09_transactional_decisions_and_storage.sql
  +++ b/supabase/migrations/20260817000001_core09_transactional_decisions_and_storage.sql
  @@ -360,6 +360,20 @@ BEGIN
  +    IF (v_run_rec.brief_json->>'contract_approved')::boolean IS NOT TRUE THEN
  +        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Rubric has not been explicitly approved for hiring run %', p_hiring_run_id;
  +    END IF;
  +    IF v_run_rec.brief_json->>'approved_by' IS NULL OR length(trim(v_run_rec.brief_json->>'approved_by')) = 0 THEN
  +        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Missing rubric approval metadata approved_by for hiring run %', p_hiring_run_id;
  +    END IF;
  +    IF v_run_rec.brief_json->>'approved_at' IS NULL OR length(trim(v_run_rec.brief_json->>'approved_at')) = 0 THEN
  +        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Missing rubric approval metadata approved_at for hiring run %', p_hiring_run_id;
  +    END IF;
  @@ -345,6 +360,18 @@ BEGIN
  +        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_claims, '[]'::jsonb)) c WHERE (c->>'id') = v_edge_claim_id) THEN
  +            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Claim edge references nonexistent claim id %', v_edge_claim_id;
  +        END IF;
  +        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_evidence_refs, '[]'::jsonb)) e WHERE (e->>'id') = v_edge_ev_id) THEN
  +            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Claim edge references nonexistent evidence id %', v_edge_ev_id;
  +        END IF;
  ```
- **Exact Assertions**:
  ```javascript
  it('1.7 RPC rejects dangling claim edge when claims array is empty (C09-03)');
  it('1.8 RPC rejects dangling claim edge when evidence array is empty (C09-03)');
  it('1.9 RPC rejects persistence when hiring-run rubric is not approved (C09-03)');
  it('1.10 RPC rejects persistence when hiring-run rubric is missing approval metadata (C09-03)');
  it('1.11 RPC rejects persistence when evaluated rubric_version mismatches approved_rubric_version (C09-03)');
  ```
- **Raw Test Result**:
  ```
  ✓ 1.7 RPC rejects dangling claim edge when claims array is empty (C09-03) 37ms
  ✓ 1.8 RPC rejects dangling claim edge when evidence array is empty (C09-03) 38ms
  ✓ 1.9 RPC rejects persistence when hiring-run rubric is not approved (C09-03) 78ms
  ✓ 1.10 RPC rejects persistence when hiring-run rubric is missing approval metadata (C09-03) 78ms
  ✓ 1.11 RPC rejects persistence when evaluated rubric_version mismatches approved_rubric_version (C09-03) 38ms
  ```

---

### Finding C09-04: 3-Way Signal Separation & Anti-Inflation Engine
- **Status**: `FIXED`
- **Diff Highlights**:
  ```diff
  --- a/apps/web/lib/evidenceExtractor.js
  +++ b/apps/web/lib/evidenceExtractor.js
  @@ -314,35 +314,56 @@ export function extractMultiSpanEvidenceAndClaims(candDoc, run) {
  +          const isSkillList = (isSkillListHeader || isCommaDelimitedList) && !hasSentenceStructure;
  +          let classification = 'self_reported';
  +          let sourceType = 'resume_assertion';
  +          let claimStatus = 'INFERRED';
  +          let confidence = 0.50;
  +          if (isCode || candDoc.source_tier === 'code') {
  +            classification = 'corroborated';
  +            sourceType = 'corroborated';
  +            claimStatus = 'VERIFIED';
  +            confidence = 0.95;
  +          } else if (isSkillList) {
  +            sourceType = 'skill_list';
  +            claimStatus = 'INFERRED';
  +            confidence = 0.40;
  +          } else {
  +            sourceType = 'resume_assertion';
  +            claimStatus = 'INFERRED';
  +            confidence = 0.60;
  +          }
  ```
- **Exact Assertions**:
  ```javascript
  it('2.3 does not mislabel experience paragraph as skill list because of a nearby heading (C09-04)', () => {
    const { claims } = extractMultiSpanEvidenceAndClaims(doc, run);
    const k8sClaim = claims.find(c => c.requirement_id === 'req_k8s');
    expect(k8sClaim.source_type).toBe('resume_assertion');
    expect(k8sClaim.status).toBe('INFERRED');
    expect(k8sClaim.status).not.toBe('VERIFIED');
  });

  it('2.4 classifies comma-delimited skill listing as skill_list (C09-04)');
  it('2.5 corroborating code repository file is classified as corroborated / VERIFIED (C09-04)');
  ```
- **Raw Test Result**:
  ```
  ✓ 2.3 does not mislabel experience paragraph as skill list because of a nearby heading (C09-04) 1ms
  ✓ 2.4 classifies comma-delimited skill listing as skill_list (C09-04) 0ms
  ✓ 2.5 corroborating code repository file is classified as corroborated / VERIFIED (C09-04) 0ms
  ```

---

### Finding C09-05: Multi-Page PDF Parser Ingestion & Page-Two Provenance
- **Status**: `FIXED`
- **Diff Highlights**:
  ```diff
  --- a/apps/web/lib/evidenceExtractor.js
  +++ b/apps/web/lib/evidenceExtractor.js
  @@ -95,4 +95,6 @@ export function extractMultiSpanEvidenceAndClaims(candDoc, run) {
  +      const matchSpan = candDoc.parser_metadata.page_spans.find(s => startOffset >= s.start_char && startOffset <= s.end_char);
  +      if (matchSpan) pageNum = matchSpan.page_number;
  ```
- **Exact Assertions**:
  ```javascript
  it('3.3 genuine parser on fixtures/sarah_connor_lead_infra.pdf proves 2 pages and page_spans (C09-05)', async () => {
    const parsed = await parseDocument({ buffer, filename: 'sarah_connor_lead_infra.pdf', mimeType: 'application/pdf' });
    expect(parsed.total_pages).toBe(2);
    expect(parsed.parser_metadata.page_spans.length).toBe(2);
  });

  it('3.5 proves page-two citation has exact page number 2 and truthful character offsets (C09-05)', async () => {
    const { evidenceRefs } = extractMultiSpanEvidenceAndClaims(candDoc, runWithGitOps);
    const gitopsRef = evidenceRefs.find(r => r.excerpt.toLowerCase().includes('gitops'));
    expect(gitopsRef.source_offset.page).toBe(2);
    expect(gitopsRef.source_offset.start_offset).toBeGreaterThanOrEqual(474);
    expect(gitopsRef.source_offset.end_offset).toBeLessThanOrEqual(951);
  });
  ```
- **Raw Test Result**:
  ```
  ✓ 3.3 genuine parser on fixtures/sarah_connor_lead_infra.pdf proves 2 pages and page_spans (C09-05) 51ms
  ✓ 3.4 persists 2-page document to database and verifies parser_metadata integrity (C09-05) 76ms
  ✓ 3.5 proves page-two citation has exact page number 2 and truthful character offsets (C09-05) 2ms
  ```

---

### Finding C09-06: Concurrency Serialization, Forced Rollback & Visible Warning DOM
- **Status**: `FIXED`
- **Diff Highlights**:
  ```diff
  --- a/apps/web/__tests__/evals/Core09TransactionalDecisionsAndConcurrency.test.jsx
  +++ b/apps/web/__tests__/evals/Core09TransactionalDecisionsAndConcurrency.test.jsx
  @@ -240,6 +240,30 @@
  +  it('B. Deterministic overlapping regeneration vs. review concurrency preserves newer evaluation data and serializes safely (C09-06)');
  +  it('D. Forces activity_events failure AFTER candidate decision update and proves complete transaction rollback (C09-06)');
  +  it('F. Captures Fresh Review Required warning with a visible DOM assertion in HumanDecisionRail (C09-06)');
  ```
- **Exact Assertions**:
  ```javascript
  // Test D: Forced activity failure after decision update
  const initialCand = runPsql(`SELECT status || '|' || decision_packet::text FROM public.candidates WHERE id = '${rollCandId}';`);
  const rpcRes = runPsql(`SELECT * FROM public.record_human_decision_transactional(...);`);
  expect(rpcRes).toContain('FORCED_ACTIVITY_EVENTS_FAILURE_AFTER_DECISION_UPDATE');
  const afterCand = runPsql(`SELECT status || '|' || decision_packet::text FROM public.candidates WHERE id = '${rollCandId}';`);
  expect(afterCand).toBe(initialCand); // 100% rollback proved!

  // Test F: Visible DOM assertion
  render(<HumanDecisionRail extraction={mockExtraction} onAction={() => {}} />);
  const banner = screen.getByTestId('stale-review-warning');
  expect(banner).toBeInTheDocument();
  expect(banner).toBeVisible();
  expect(banner.textContent).toContain('Fresh Review Required:');
  ```
- **Raw Test Result**:
  ```
  ✓ B. Deterministic overlapping regeneration vs. review concurrency preserves newer evaluation data and serializes safely (C09-06) 734ms
  ✓ D. Forces activity_events failure AFTER candidate decision update and proves complete transaction rollback (C09-06) 214ms
  ✓ F. Captures Fresh Review Required warning with a visible DOM assertion in HumanDecisionRail (C09-06) 58ms
  ```

---

## 3. Overall Test Suite & Runtime Proof

```bash
$ npm --prefix apps/web test -- --run
Test Files  48 passed | 2 skipped (50)
     Tests  509 passed | 2 skipped (511)
  Duration  8.85s
```

```bash
$ node scripts/capture_core09_journey_screenshots.js
[Step 1] Navigating to /auth and signing in as synthetic.employer.alpha...
[Step 2] Created Role Hiring Run ID: 89632990-b1c8-4ad2-aefe-8b62900dfc5d
[Captured] 01_fresh_role_created_brief_unapproved.png
[Captured] 02_rubric_approved_brief_persisted.png
[Captured] 03_candidate_ingested_via_genuine_ui_upload.png
[Captured] 04_packet_generated_with_exact_document_binding.png
[Captured] 05_citation_drawer_complete_provenance.png
[Captured] 06_human_hold_decision_recorded_with_rationale.png
[Fresh Review Required Banner Text]: ⚠️ Fresh Review Required: Packet updated to revision 2 under rubric 1.0.0. Review previous decision.
[Captured] 07_packet_revision_advanced_fresh_review_required.png
[Captured] 08_fresh_review_completed_revision_2.png
[Captured] 09_unassessed_candidate_packet_uncertainty_065.png
[Captured] 10_cross_tenant_isolation_denials.png
=== ALL 10 SCREENSHOTS & PRODUCTION RUNTIME ASSERTIONS PASSED WITH 100% SUCCESS ===
```
