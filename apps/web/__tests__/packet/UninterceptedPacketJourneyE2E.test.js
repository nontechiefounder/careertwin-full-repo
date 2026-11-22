/**
 * Unintercepted End-to-End Verification:
 *  1. WORKBYLINE_ENGINE_MAPPINGS positive & negative workspace-mapping boundary
 *  2. Replacement candidate document upload validation on /employer/shortlist/[roleId]
 *  3. Real unintercepted PDF upload -> Generate Decision Packet -> Claim Ledger & EvidenceDrawer -> API revision parity
 */

const { test, expect } = require('playwright/test');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const pwd = process.env.CAREERTWIN_STAGING_TEST_PASSWORD;
if (!pwd) {
  throw new Error('FAIL-CLOSED ERROR: CAREERTWIN_STAGING_TEST_PASSWORD is required.');
}

const BASE_URL = process.env.APP_URL || `http://localhost:${process.env.DISPOSABLE_VERIFICATION_PORT || '3010'}`;
const ALPHA_RUN_ID = '11111111-1111-4111-d2c1-111111111111';
const PDF_FIXTURE_PATH = path.resolve(__dirname, '../../../../fixtures/sarah_connor_lead_infra.pdf');
const artifactsDir = process.env.ARTIFACTS_DIR || path.join(__dirname, '../../test-artifacts');
fs.mkdirSync(artifactsDir, { recursive: true });

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.CAREERTWIN_STAGING_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('FAIL-CLOSED ERROR: Supabase URL and SUPABASE_SERVICE_ROLE_KEY are required for E2E cleanup.');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

async function cleanupUploadedArtifacts({ extractionId, profileId, docId, storagePath }) {
  const admin = getAdminClient();
  const errors = [];

  if (extractionId) {
    const { error } = await admin
      .from('activity_events')
      .delete()
      .ilike('description', `%${extractionId}%`);
    if (error) errors.push(`activity_events: ${error.message}`);
  }
  const emailCandidateIds = [profileId, extractionId].filter(Boolean);
  if (emailCandidateIds.length > 0) {
    const { error } = await admin
      .from('scheduled_emails')
      .delete()
      .in('candidate_id', emailCandidateIds);
    if (error) errors.push(`scheduled_emails: ${error.message}`);
  }
  if (profileId) {
    const { error } = await admin
      .from('claim_ledgers')
      .delete()
      .eq('candidate_id', profileId)
      .eq('hiring_run_id', ALPHA_RUN_ID);
    if (error) errors.push(`claim_ledgers: ${error.message}`);
  }
  if (docId) {
    const { error } = await admin.from('candidate_documents').delete().eq('id', docId);
    if (error) errors.push(`candidate_documents: ${error.message}`);
  }
  if (extractionId) {
    const { error } = await admin.from('candidates').delete().eq('id', extractionId);
    if (error) errors.push(`candidates: ${error.message}`);
  }
  if (profileId) {
    const { error } = await admin.from('candidate_profiles').delete().eq('id', profileId);
    if (error) errors.push(`candidate_profiles: ${error.message}`);
  }
  if (storagePath) {
    const { error } = await admin.storage.from('candidate_resumes').remove([storagePath]);
    if (error) errors.push(`storage: ${error.message}`);
  }

  if (errors.length > 0) {
    throw new Error(`E2E cleanup failed: ${errors.join('; ')}`);
  }
}

async function signInAsAlphaOwner(page) {
  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', 'd2c.alpha.owner@example.com');
  await page.fill('input[type="password"]', pwd);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !window.location.pathname.startsWith('/auth'), { timeout: 20000 });
}

function buildMinimalPdfBuffer(lines) {
  const escaped = lines.map((line) =>
    String(line).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  );
  const textOps = ['BT', '/F1 12 Tf', '72 720 Td'];
  escaped.forEach((line, idx) => {
    if (idx > 0) textOps.push('0 -18 Td');
    textOps.push(`(${line}) Tj`);
  });
  textOps.push('ET');
  const streamContent = `${textOps.join('\n')}\n`;
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'utf8')} >>\nstream\n${streamContent}endstream\nendobj\n`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

test.describe('Unintercepted Packet Journey & Workspace Mapping E2E', () => {
  test.setTimeout(90000);

  test('1. WORKBYLINE_ENGINE_MAPPINGS resolves mapped alpha run and rejects unmapped runs', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAsAlphaOwner(page);

    const mappedRes = await page.request.get(
      `${BASE_URL}/api/employer/context-sources?hiring_run_id=${ALPHA_RUN_ID}`
    );
    expect(mappedRes.status()).not.toBe(403);
    const mappedBody = await mappedRes.json().catch(() => ({}));
    expect(mappedBody.error).not.toBe('UNMAPPED_WORKSPACE');
    // Either Python Context Engine :8011 is running (200) or offline in this local sandbox (503 CONTEXT_UNAVAILABLE)
    expect([200, 503]).toContain(mappedRes.status());

    const crossTenantRes = await page.request.get(
      `${BASE_URL}/api/employer/context-sources?hiring_run_id=11111111-1111-4111-d2c1-222222222222`
    );
    expect([403, 404]).toContain(crossTenantRes.status());
  });

  test('2. Replacement shortlist upload rejects non-PDF uploads without creating candidate records', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAsAlphaOwner(page);

    await page.goto(`${BASE_URL}/employer/shortlist/${ALPHA_RUN_ID}`, { waitUntil: 'domcontentloaded' });
    const fileInput = page.getByTestId('shortlist-file-upload-input');
    await expect(fileInput).toBeAttached({ timeout: 20000 });

    const uploadRespPromise = page.waitForResponse(
      (res) => res.url().includes('/api/employer/candidate-documents/upload') && res.request().method() === 'POST'
    );

    await fileInput.setInputFiles({
      name: 'unsupported_candidate_note.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Plain text note that is not a valid PDF document.', 'utf8'),
    });

    const uploadResp = await uploadRespPromise;
    expect(uploadResp.status()).toBe(415);
    const uploadJson = await uploadResp.json();
    expect(uploadJson.error).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  test('3. Unintercepted upload -> Generate Decision Packet -> Ledger & EvidenceDrawer -> API revision parity', async ({ page }) => {
    expect(fs.existsSync(PDF_FIXTURE_PATH)).toBe(true);

    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAsAlphaOwner(page);

    let createdIds = null;
    try {
      await page.goto(`${BASE_URL}/employer/shortlist/${ALPHA_RUN_ID}`, { waitUntil: 'domcontentloaded' });
      const fileInput = page.getByTestId('shortlist-file-upload-input');
      await expect(fileInput).toBeAttached({ timeout: 20000 });

      const uploadRespPromise = page.waitForResponse(
        (res) => res.url().includes('/api/employer/candidate-documents/upload') && res.request().method() === 'POST'
      );
      const matchingPdfBuffer = buildMinimalPdfBuffer([
        'Sarah Connor',
        'Principal Infrastructure & Distributed Systems Engineer',
        'Experience: Architected production PostgreSQL and TypeScript services for distributed systems.',
      ]);
      await fileInput.setInputFiles({
        name: 'sarah_connor_lead_infra.pdf',
        mimeType: 'application/pdf',
        buffer: matchingPdfBuffer,
      });

      const uploadResp = await uploadRespPromise;
      expect(uploadResp.status()).toBe(200);
      const uploadJson = await uploadResp.json();
      expect(uploadJson.success).toBe(true);
      expect(uploadJson.extraction_id).toBeTruthy();
      expect(uploadJson.document?.file_sha256).toMatch(/^[0-9a-f]{64}$/i);

      createdIds = {
        extractionId: uploadJson.extraction_id,
        profileId: uploadJson.profile_id,
        docId: uploadJson.document?.id,
        storagePath: uploadJson.storage_path,
      };

      await page.goto(`${BASE_URL}/employer/packet/${createdIds.extractionId}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('main').getByText('EVALUATION_NOT_STARTED', { exact: true })).toBeVisible({ timeout: 25000 });

      const generateBtn = page.getByRole('button', { name: /Generate Decision Packet/i });
      await expect(generateBtn).toBeVisible();

      const generateRespPromise = page.waitForResponse(
        (res) => res.url().includes(`/api/employer/packets/${createdIds.extractionId}/generate`) && res.request().method() === 'POST'
      );
      await generateBtn.click();

      const generateResp = await generateRespPromise;
      expect(generateResp.status()).toBe(200);
      const generatedPacket = await generateResp.json();
      expect(generatedPacket.ledger_revision).toBe(1);
      expect(Array.isArray(generatedPacket.claims)).toBe(true);
      expect(generatedPacket.claims.length).toBeGreaterThan(0);
      expect(Array.isArray(generatedPacket.evidence_refs)).toBe(true);
      expect(generatedPacket.evidence_refs.length).toBeGreaterThan(0);

      // Verify persisted GET API matches POST output & ledger revision
      const getPacketResp = await page.request.get(`${BASE_URL}/api/employer/packets/${createdIds.extractionId}`);
      expect(getPacketResp.status()).toBe(200);
      const getPacketJson = await getPacketResp.json();
      expect(getPacketJson.packet?.ledger_revision).toBe(generatedPacket.ledger_revision);
      expect(getPacketJson.packet?.evidence_refs?.length).toBe(generatedPacket.evidence_refs.length);

      // Verify UI ledger and real EvidenceDrawer citation hashes
      const ledgerSection = page.locator('section[aria-label="Claim-to-Proof Ledger"]');
      await expect(ledgerSection).toBeVisible({ timeout: 20000 });
      await expect(page.getByRole('main').getByText('EVALUATION_NOT_STARTED', { exact: true })).toHaveCount(0);

      const citationBtn = ledgerSection.locator('button[aria-label*="citation"]').first();
      await expect(citationBtn).toBeVisible();
      await citationBtn.click();

      const evidenceDrawer = page.getByTestId('evidence-drawer');
      await expect(evidenceDrawer).toBeVisible();
      await expect(evidenceDrawer).toContainText('sarah_connor_lead_infra.pdf');
      await expect(evidenceDrawer.getByTestId('citation-file-hash')).toContainText(uploadJson.document.file_sha256);
      await expect(evidenceDrawer.getByTestId('citation-norm-text-hash')).toContainText(uploadJson.document.normalized_text_sha256);
      await expect(evidenceDrawer.getByTestId('citation-excerpt-hash')).not.toHaveText('Not available');

      await page.screenshot({ path: path.join(artifactsDir, 'e2e_unintercepted_packet_evidence_drawer.png') });
      await page.keyboard.press('Escape');
      await expect(evidenceDrawer).not.toBeVisible();

      // Record real human reviewer decision (Advance) via UI sidebar + transactional /action RPC
      const rationaleText = 'Verified real PDF infrastructure citations and ownership scope via E2E review.';
      await page.locator('#sidebar-reviewer-rationale').fill(rationaleText);
      const actionResponsePromise = page.waitForResponse(
        (res) => res.url().includes(`/api/employer/packets/${createdIds.extractionId}/action`) && res.request().method() === 'POST',
        { timeout: 30000 }
      );
      await page.getByRole('button', { name: 'Advance Candidate', exact: true }).click();
      const actionResponse = await actionResponsePromise;
      expect(actionResponse.status()).toBe(200);
      const actionJson = await actionResponse.json();
      expect(actionJson.success).toBe(true);
      expect(actionJson.status).toBe('shortlisted');
      expect(actionJson.decision_packet?.human_decision?.action).toBe('advance');
      expect(actionJson.decision_packet?.human_decision?.rationale).toBe(rationaleText);

      // Verify UI reflects persisted human decision + dry-run outreach banner without route interception
      await expect(page.getByTestId('post-advance-workflow-banner')).toBeVisible({ timeout: 20000 });
      await expect(page.getByText('Candidate Advanced', { exact: true })).toBeVisible();

      // Verify persisted GET API matches recorded human_decision & ledger_revision after UI reload
      const getAfterDecisionResp = await page.request.get(`${BASE_URL}/api/employer/packets/${createdIds.extractionId}`);
      expect(getAfterDecisionResp.status()).toBe(200);
      const getAfterDecisionJson = await getAfterDecisionResp.json();
      expect(getAfterDecisionJson.packet?.ledger_revision).toBe(generatedPacket.ledger_revision);
      expect(getAfterDecisionJson.packet?.human_decision?.action).toBe('advance');
      expect(getAfterDecisionJson.packet?.human_decision?.status).toBe('shortlisted');
      expect(getAfterDecisionJson.packet?.human_decision?.rationale).toBe(rationaleText);
      expect(Array.isArray(getAfterDecisionJson.packet?.human_decision?.decision_history)).toBe(true);
      expect(getAfterDecisionJson.packet.human_decision.decision_history.length).toBe(1);

      await page.screenshot({ path: path.join(artifactsDir, 'e2e_unintercepted_packet_human_decision.png') });

      // Navigate back to shortlist and confirm persisted ledger revision matches GET API
      await page.goto(`${BASE_URL}/employer/shortlist/${ALPHA_RUN_ID}`, { waitUntil: 'domcontentloaded' });
      const card = page.getByTestId(`shortlist-card-${createdIds.extractionId}`);
      await expect(card).toBeVisible({ timeout: 20000 });
      await expect(card).toContainText(`Packet Rev: ${getPacketJson.packet.ledger_revision}`);
    } finally {
      if (createdIds) {
        await cleanupUploadedArtifacts(createdIds);
      }
    }
  });

  test('4. Ordinary sparse resume journey: fit_score=null & gate_pass=false render truthfully with human review & chat working', async ({ page }) => {
    const sparsePdf = buildMinimalPdfBuffer([
      'Alex Ordinary Resume',
      'Skills: Go, PostgreSQL',
    ]);

    await page.setViewportSize({ width: 1440, height: 900 });
    await signInAsAlphaOwner(page);

    let createdIds = null;
    try {
      await page.goto(`${BASE_URL}/employer/shortlist/${ALPHA_RUN_ID}`, { waitUntil: 'domcontentloaded' });
      const fileInput = page.getByTestId('shortlist-file-upload-input');
      await expect(fileInput).toBeAttached({ timeout: 20000 });

      const uploadRespPromise = page.waitForResponse(
        (res) => res.url().includes('/api/employer/candidate-documents/upload') && res.request().method() === 'POST'
      );
      await fileInput.setInputFiles({
        name: 'alex_ordinary_sparse.pdf',
        mimeType: 'application/pdf',
        buffer: sparsePdf,
      });

      const uploadResp = await uploadRespPromise;
      expect(uploadResp.status()).toBe(200);
      const uploadJson = await uploadResp.json();
      createdIds = {
        extractionId: uploadJson.extraction_id,
        profileId: uploadJson.profile_id,
        docId: uploadJson.document?.id,
        storagePath: uploadJson.storage_path,
      };

      await page.goto(`${BASE_URL}/employer/packet/${createdIds.extractionId}`, { waitUntil: 'domcontentloaded' });
      const generateBtn = page.getByRole('button', { name: /Generate Decision Packet/i });
      await expect(generateBtn).toBeVisible({ timeout: 25000 });

      const generateRespPromise = page.waitForResponse(
        (res) => res.url().includes(`/api/employer/packets/${createdIds.extractionId}/generate`) && res.request().method() === 'POST'
      );
      await generateBtn.click();
      const generateResp = await generateRespPromise;
      expect(generateResp.status()).toBe(200);
      const packet = await generateResp.json();

      // Ordinary uncorroborated skill-list resume yields fit_score: null & gate_pass: false
      expect(packet.fit_score).toBeNull();
      expect(packet.evaluation_metrics?.gate_pass).toBe(false);
      expect(packet.evaluation_metrics?.decision_readiness).toBe('INSUFFICIENT EVIDENCE');
      expect(packet.what_is_verified).toEqual([]);
      expect(Array.isArray(packet.missing_proof) && packet.missing_proof.length > 0).toBe(true);

      // UI truthfully explains unverified null score and does NOT equate it with unsuitability
      await expect(page.getByText('Unverified (null)', { exact: true })).toBeVisible({ timeout: 20000 });
      await expect(page.getByText(/Self-reported résumé claims lack external code\/repo corroboration/i)).toBeVisible();
      await expect(page.getByText('Context Parser')).toHaveCount(0);
      const blockersSection = page.locator('section[aria-label="Decision Blockers & Minimum Missing Proof"]');
      await expect(blockersSection).toBeVisible();
      await expect(blockersSection).toContainText(/must have/i);

      // EvidenceDrawer still links real uploaded PDF span + hashes
      const ledgerSection = page.locator('section[aria-label="Claim-to-Proof Ledger"]');
      const citationBtn = ledgerSection.locator('button[aria-label*="citation"]').first();
      await expect(citationBtn).toBeVisible();
      await citationBtn.click();
      const evidenceDrawer = page.getByTestId('evidence-drawer');
      await expect(evidenceDrawer).toBeVisible();
      await expect(evidenceDrawer).toContainText('alex_ordinary_sparse.pdf');
      await page.keyboard.press('Escape');

      // Human reviewer can still place candidate on Hold with rationale despite gate_pass: false
      await page.locator('#sidebar-reviewer-rationale').fill('Ordinary resume awaits technical screen or repo verification.');
      const holdPromise = page.waitForResponse(
        (res) => res.url().includes(`/api/employer/packets/${createdIds.extractionId}/action`) && res.request().method() === 'POST',
        { timeout: 30000 }
      );
      await page.getByRole('button', { name: 'Put on Hold', exact: true }).click();
      const holdResp = await holdPromise;
      expect(holdResp.status()).toBe(200);
      const holdJson = await holdResp.json();
      expect(holdJson.status).toBe('hold');
      await expect(page.getByText('Placed on Hold', { exact: true })).toBeVisible({ timeout: 15000 });

      // Live /api/employer/chat works cleanly with candidate_id even when fit_score is null
      const chatRes = await page.request.post(`${BASE_URL}/api/employer/chat`, {
        data: {
          message: 'Compare missing proof gaps for this candidate',
          context: { active_run_id: ALPHA_RUN_ID, candidate_id: createdIds.extractionId },
        },
      });
      expect(chatRes.status()).toBe(200);
      const chatJson = await chatRes.json();
      expect(chatJson.reply).toContain('Unassessed');
    } finally {
      if (createdIds) {
        await cleanupUploadedArtifacts(createdIds);
      }
    }
  });
});
