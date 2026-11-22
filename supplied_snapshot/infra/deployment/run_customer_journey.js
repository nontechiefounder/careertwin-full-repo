#!/usr/bin/env node
// ==============================================================================
// WorkByline V2 — Authenticated Customer Journey Acceptance Runner
// Strict Mandatory Assertions Only (Zero Permissive Fallbacks / Zero Skipped)
// Exercises 14 Core Workflow Steps:
//   1. Alpha Authentication (HTTP 200, Bearer token)
//   2. Beta Authentication (HTTP 200, Bearer token)
//   3. Role Brief & Rubric Creation (HTTP 200)
//   4. Rubric Approval Persistence (HTTP 200, contract_approved = true)
//   5. Genuine Multi-Page Resume PDF Upload (HTTP 200)
//   6. Original Document Retrieval & SHA-256 Hash Match (HTTP 200)
//   7. Packet Generation & Page-Two Citation Provenance (HTTP 200)
//   8. Human Decision Action HOLD with OCC Contract (HTTP 200)
//   9. Stale-Review OCC Rejection (HTTP 409 REVIEW_REVISION_CONFLICT)
//  10. Fresh Review Action ADVANCE on Latest Revision (HTTP 200)
//  11. Unassessed Candidate Invariant (HTTP 200, null fit score, uncertainty 0.65)
//  12. Strict Cross-Tenant Denials (HTTP 404/403)
//  13. Declared Chat Pipeline Summary Workflow (HTTP 200)
//  14. Declared Chat Candidate Shortlist Workflow (HTTP 200)
// ==============================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE_URL = (process.env.APP_URL || process.env.STAGING_APP_URL || 'http://localhost:3004').replace(/\/$/, '');
function resolveFixturePath() {
  if (process.env.FIXTURE_PATH && fs.existsSync(process.env.FIXTURE_PATH)) {
    return process.env.FIXTURE_PATH;
  }
  const candidatePaths = [
    path.resolve(__dirname, '../../fixtures/sarah_connor_lead_infra.pdf'),
    path.resolve(__dirname, '../source/fixtures/sarah_connor_lead_infra.pdf'),
    path.resolve(__dirname, '../../source/fixtures/sarah_connor_lead_infra.pdf'),
    path.resolve(__dirname, 'fixtures/sarah_connor_lead_infra.pdf'),
    path.resolve(process.cwd(), 'fixtures/sarah_connor_lead_infra.pdf'),
    path.resolve(process.cwd(), 'source/fixtures/sarah_connor_lead_infra.pdf')
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }
  return candidatePaths[0];
}
const FIXTURE_PATH = resolveFixturePath();

console.log('=== WORKBYLINE V2: AUTHENTICATED CUSTOMER JOURNEY ACCEPTANCE ===');
console.log('Base URL:', BASE_URL);
console.log('Fixture PDF:', FIXTURE_PATH);
console.log('Execution Timestamp:', new Date().toISOString());

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    failedCount++;
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  [PASS] ${message}`);
    passedCount++;
  }
}

async function apiFetch(endpoint, options = {}, token = null) {
  const headers = { ...options.headers };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, { ...options, headers });
  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else if (contentType.includes('text/')) {
    data = await res.text();
  } else {
    data = await res.arrayBuffer();
  }
  return { status: res.status, headers: res.headers, data };
}

async function run() {
  try {
    // --------------------------------------------------------------------------
    // Step 1: Employer Alpha Authentication
    // --------------------------------------------------------------------------
    console.log('\n--- Step 1: Authenticate Employer Alpha ---');
    const alphaAuth = await apiFetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'synthetic.employer.alpha@example.invalid',
        password: 'TestPassword123!'
      })
    });
    assert(alphaAuth.status === 200, 'Alpha sign-in returns HTTP 200');
    assert(alphaAuth.data?.session?.access_token != null, 'Alpha receives valid session access token');
    const alphaToken = alphaAuth.data.session.access_token;

    // --------------------------------------------------------------------------
    // Step 2: Employer Beta Authentication (for Isolation Tests)
    // --------------------------------------------------------------------------
    console.log('\n--- Step 2: Authenticate Employer Beta ---');
    const betaAuth = await apiFetch('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'synthetic.employer.beta@example.invalid',
        password: 'TestPassword123!'
      })
    });
    assert(betaAuth.status === 200, 'Beta sign-in returns HTTP 200');
    assert(betaAuth.data?.session?.access_token != null, 'Beta receives valid session access token');
    const betaToken = betaAuth.data.session.access_token;

    // --------------------------------------------------------------------------
    // Step 3: Hiring Run & Brief Requirements
    // --------------------------------------------------------------------------
    console.log('\n--- Step 3: Create Hiring Run & Role Brief ---');
    const runRes = await apiFetch('/api/employer/hiring-runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role_title: 'Staff Cloud & Kubernetes Platform Architect',
        target_headcount: 1,
        location: 'San Francisco, CA / Remote',
        job_description: 'Staff Kubernetes Architect leading distributed systems',
        must_haves: ['Kubernetes', 'Distributed Systems', 'Go']
      })
    }, alphaToken);
    assert(runRes.status === 200, 'Hiring run created with exact HTTP 200');
    const hiringRunId = runRes.data?.id || runRes.data?.hiring_run?.id;
    assert(hiringRunId != null, `Hiring run ID assigned: ${hiringRunId}`);

    // --------------------------------------------------------------------------
    // Step 4: Rubric Approval Persistence
    // --------------------------------------------------------------------------
    console.log('\n--- Step 4: Rubric Approval Persistence ---');
    const approveRes = await apiFetch(`/api/employer/brief/${hiringRunId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }, alphaToken);
    assert(approveRes.status === 200, 'Rubric approved with exact HTTP 200');

    const briefCheck = await apiFetch(`/api/employer/brief/${hiringRunId}`, {}, alphaToken);
    assert(briefCheck.status === 200, 'Brief fetched successfully with HTTP 200');
    assert(
      briefCheck.data?.brief?.contract_approved === true ||
      briefCheck.data?.hiring_run?.brief_json?.contract_approved === true,
      'Rubric approval persisted: contract_approved = true'
    );

    // --------------------------------------------------------------------------
    // Step 5: Genuine Resume PDF Upload
    // --------------------------------------------------------------------------
    console.log('\n--- Step 5: Genuine Multi-Page Resume Upload ---');
    assert(fs.existsSync(FIXTURE_PATH), 'Sarah Connor 2-page PDF fixture exists on disk');
    const fileBytes = fs.readFileSync(FIXTURE_PATH);
    const expectedFileSha256 = crypto.createHash('sha256').update(fileBytes).digest('hex');

    const formData = new FormData();
    formData.append('file', new Blob([fileBytes], { type: 'application/pdf' }), 'sarah_connor_lead_infra.pdf');
    formData.append('hiring_run_id', hiringRunId);

    const uploadRes = await apiFetch('/api/employer/candidate-documents/upload', {
      method: 'POST',
      body: formData
    }, alphaToken);
    assert(uploadRes.status === 200, 'Document upload returns exact HTTP 200');
    const documentId = uploadRes.data?.document?.id || uploadRes.data?.document_id;
    const candidateId = uploadRes.data?.candidate_id || uploadRes.data?.extraction_id;
    assert(documentId != null, `Document record created with ID: ${documentId}`);
    assert(candidateId != null, `Candidate record created with ID: ${candidateId}`);

    // --------------------------------------------------------------------------
    // Step 6: Original Document Retrieval & SHA-256 Hash Match
    // --------------------------------------------------------------------------
    console.log('\n--- Step 6: Document Retrieval & SHA-256 Hash Match ---');
    const downloadRes = await apiFetch(`/api/employer/candidate-documents/${documentId}/download`, {}, alphaToken);
    assert(downloadRes.status === 200, 'Original document download returns HTTP 200');
    const downloadedBytes = Buffer.from(downloadRes.data);
    const downloadedSha256 = crypto.createHash('sha256').update(downloadedBytes).digest('hex');
    assert(downloadedSha256 === expectedFileSha256, `SHA-256 hash match verified: ${downloadedSha256}`);

    // --------------------------------------------------------------------------
    // Step 7: Packet Generation & Citation Provenance
    // --------------------------------------------------------------------------
    console.log('\n--- Step 7: Packet Generation & Evidence Citations ---');
    const genRes = await apiFetch(`/api/employer/packets/${candidateId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }, alphaToken);
    assert(genRes.status === 200, 'Packet generation returns HTTP 200');
    assert(genRes.data?.evidence_refs?.length > 0, `Generated ${genRes.data?.evidence_refs?.length} evidence references`);
    const pageTwoCitation = genRes.data?.evidence_refs?.find(ref => ref.source_offset?.page === 2);
    assert(pageTwoCitation != null, 'Citation drawer contains verified Page 2 citation');

    // --------------------------------------------------------------------------
    // Step 8: Human Review Decision Action (HOLD)
    // --------------------------------------------------------------------------
    console.log('\n--- Step 8: Human Review Decision Action (OCC Contract) ---');
    const actionHold = await apiFetch(`/api/employer/packets/${candidateId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'hold',
        rationale: 'Placed on initial technical review hold.',
        expected_ledger_revision: 1,
        expected_rubric_version: '1.0.0'
      })
    }, alphaToken);
    assert(actionHold.status === 200, 'Human decision HOLD accepted with HTTP 200');

    // --------------------------------------------------------------------------
    // Step 9: Stale-Review OCC Rejection (HTTP 409)
    // --------------------------------------------------------------------------
    console.log('\n--- Step 9: Stale-Review Conflict Rejection (HTTP 409) ---');
    // Bump revision via second generate call
    const genRev2 = await apiFetch(`/api/employer/packets/${candidateId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }, alphaToken);
    assert(genRev2.status === 200, 'Regeneration to revision 2 succeeded');

    // Attempt action with stale revision 1
    const staleAction = await apiFetch(`/api/employer/packets/${candidateId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'advance',
        rationale: 'Attempting action on stale revision',
        expected_ledger_revision: 1,
        expected_rubric_version: '1.0.0'
      })
    }, alphaToken);
    assert(staleAction.status === 409, 'Stale revision rejected with exact HTTP 409');
    assert(staleAction.data?.requires_refresh === true, 'Conflict response signals requires_refresh: true');

    // --------------------------------------------------------------------------
    // Step 10: Fresh Review Action on Latest Revision
    // --------------------------------------------------------------------------
    console.log('\n--- Step 10: Fresh Review Action on Latest Revision ---');
    const freshAction = await apiFetch(`/api/employer/packets/${candidateId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'advance',
        rationale: 'Advanced following re-review of revision 2.',
        expected_ledger_revision: 2,
        expected_rubric_version: '1.0.0'
      })
    }, alphaToken);
    assert(freshAction.status === 200, 'Fresh review action accepted on revision 2 with HTTP 200');

    // --------------------------------------------------------------------------
    // Step 11: Unassessed Candidate Invariant Check (Mandatory Assertions)
    // --------------------------------------------------------------------------
    console.log('\n--- Step 11: Unassessed Candidate Invariant Check ---');
    // Inject document-free candidate profile via candidate-extractions endpoint
    const injectRes = await apiFetch('/api/employer/candidate-extractions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hiring_run_id: hiringRunId,
        candidate_name: 'Unassessed Document-Free Candidate',
        current_role: 'Backend Systems Engineer',
        current_company: 'Synthetic Labs',
        skills: ['Distributed Systems', 'Go']
      })
    }, alphaToken);
    assert(injectRes.status === 200, 'Unassessed candidate created via extraction route with HTTP 200');
    const unassessedCandId = injectRes.data?.candidate?.id || injectRes.data?.candidate_id;
    assert(unassessedCandId != null, `Unassessed candidate ID assigned: ${unassessedCandId}`);

    // Generate evaluation for the document-free candidate
    const unassessedGen = await apiFetch(`/api/employer/packets/${unassessedCandId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }, alphaToken);

    assert(unassessedGen.status === 200, 'Unassessed candidate evaluation returns exact HTTP 200');
    assert(unassessedGen.data?.fit_score === null, 'Unassessed candidate has null fit_score');
    assert(unassessedGen.data?.claims?.length === 0, 'Unassessed candidate has exactly 0 claims');
    assert(unassessedGen.data?.evidence_refs?.length === 0, 'Unassessed candidate has exactly 0 evidence references');
    assert(
      unassessedGen.data?.evaluation_metrics?.decision_readiness === 'INSUFFICIENT EVIDENCE',
      'Unassessed candidate readiness is INSUFFICIENT EVIDENCE'
    );
    assert(
      unassessedGen.data?.evaluation_metrics?.uncertainty === 0.65,
      'Unassessed candidate uncertainty is exactly 0.65'
    );

    // --------------------------------------------------------------------------
    // Step 12: Strict Cross-Tenant Isolation Denials (Exact Statuses)
    // --------------------------------------------------------------------------
    console.log('\n--- Step 12: Strict Cross-Tenant Isolation Denials ---');
    const betaGetPacket = await apiFetch(`/api/employer/packets/${candidateId}`, {}, betaToken);
    assert(betaGetPacket.status === 404, 'Beta GET packet denied by RLS (exact HTTP 404)');

    const betaAction = await apiFetch(`/api/employer/packets/${candidateId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'reject',
        rationale: 'Cross tenant breach attempt',
        expected_ledger_revision: 2,
        expected_rubric_version: '1.0.0'
      })
    }, betaToken);
    assert(betaAction.status === 404, 'Beta action mutation denied by RLS (exact HTTP 404)');

    const betaDownload = await apiFetch(`/api/employer/candidate-documents/${documentId}/download`, {}, betaToken);
    assert(betaDownload.status === 403, 'Beta document download denied (exact HTTP 403 Forbidden)');

    const betaUpload = await apiFetch('/api/employer/candidate-documents/upload', {
      method: 'POST',
      body: formData
    }, betaToken);
    assert(betaUpload.status === 404, 'Beta upload to foreign hiring run denied by RLS (exact HTTP 404)');

    // --------------------------------------------------------------------------
    // Step 13: Declared Chat Workflow — Pipeline Summary
    // --------------------------------------------------------------------------
    console.log('\n--- Step 13: Declared Chat Workflow — Pipeline Summary ---');
    const chatPipeline = await apiFetch('/api/employer/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'pipeline summary' })
    }, alphaToken);
    assert(chatPipeline.status === 200, 'Chat pipeline query returns exact HTTP 200');
    assert(chatPipeline.data?.reply != null, 'Chat returns structured pipeline reply');
    assert(chatPipeline.data?.suggestions?.length > 0, 'Chat returns contextual suggestion chips');

    // --------------------------------------------------------------------------
    // Step 14: Declared Chat Workflow — Candidate Shortlist
    // --------------------------------------------------------------------------
    console.log('\n--- Step 14: Declared Chat Workflow — Candidate Shortlist ---');
    const chatCandidates = await apiFetch('/api/employer/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'candidates' })
    }, alphaToken);
    assert(chatCandidates.status === 200, 'Chat candidates query returns exact HTTP 200');
    assert(chatCandidates.data?.reply != null, 'Chat returns candidate shortlist response');

    console.log('\n================================================================');
    console.log(`ACCEPTANCE SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('================================================================');
    if (failedCount === 0) {
      console.log('[Status] ALL 14 CUSTOMER JOURNEY ACCEPTANCE STEPS PASSED WITH 100% SUCCESS.');
      process.exit(0);
    } else {
      console.error('[Status] ACCEPTANCE FAILED.');
      process.exit(1);
    }
  } catch (err) {
    console.error('Customer journey fatal error:', err);
    process.exit(1);
  }
}

run();
