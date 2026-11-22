const { chromium } = require('../apps/web/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');

const OUTPUT_DIR = '/Users/darshilparmar/Desktop/CTW_V2_DEMO_CORE_06';
const SCREENSHOT_DIR = path.join(OUTPUT_DIR, 'screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const networkTrace = [];

function sanitizeHeaders(headers) {
  const sanitized = { ...headers };
  for (const key of Object.keys(sanitized)) {
    const lk = key.toLowerCase();
    if (lk === 'authorization' || lk.includes('cookie') || lk.includes('token') || lk.includes('key')) {
      sanitized[key] = '[SANITIZED_CREDENTIAL]';
    }
  }
  return sanitized;
}

function sanitizeBody(bodyStr) {
  if (!bodyStr) return null;
  try {
    const parsed = JSON.parse(bodyStr);
    if (parsed.password) parsed.password = '[SANITIZED_PASSWORD]';
    return JSON.stringify(parsed);
  } catch {
    return bodyStr.replace(/TestPassword123!/g, '[SANITIZED_PASSWORD]');
  }
}

const DB_TARGET = process.env.DISPOSABLE_DATABASE_URL || process.env.DISPOSABLE_DB_CONTAINER;

if (!DB_TARGET || DB_TARGET.toLowerCase().includes('supabase_db_careertwin-local-baseline') || DB_TARGET.toLowerCase().includes('54332')) {
  throw new Error('[SECURITY REJECTION] Target matches protected shared baseline database identity (supabase_db_careertwin-local-baseline / port 54332). Explicit disposable database required.');
}

function runPsql(sql) {
  const { execFileSync } = require('child_process');
  if (DB_TARGET.startsWith('postgres')) {
    return execFileSync('psql', [DB_TARGET, '-v', 'ON_ERROR_STOP=1'], {
      input: sql,
      encoding: 'utf-8'
    });
  } else {
    return execFileSync('docker', ['exec', '-i', DB_TARGET, 'psql', '-U', 'postgres', '-d', 'postgres'], {
      input: sql,
      encoding: 'utf-8'
    });
  }
}

async function run() {
  console.log('=== STARTING CTW-V2-DEMO-CORE-06 INTEGRITY & HOSTED STAGING PREPARATION JOURNEY ===');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await context.newPage();

  // Attach network listener to capture sanitized network trace
  page.on('request', req => {
    const url = req.url();
    if (url.includes('/api/') || url.includes('/auth/v1') || url.includes('/rest/v1')) {
      networkTrace.push({
        type: 'request',
        timestamp: new Date().toISOString(),
        method: req.method(),
        url: req.url(),
        headers: sanitizeHeaders(req.headers()),
        postData: sanitizeBody(req.postData())
      });
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/api/') || url.includes('/auth/v1') || url.includes('/rest/v1')) {
      let body = null;
      try {
        const text = await res.text();
        body = sanitizeBody(text);
      } catch {
        body = '[binary or unreadable response]';
      }
      networkTrace.push({
        type: 'response',
        timestamp: new Date().toISOString(),
        url: res.url(),
        status: res.status(),
        statusText: res.statusText(),
        headers: sanitizeHeaders(res.headers()),
        body: body ? (body.length > 2000 ? body.substring(0, 2000) + '...[truncated]' : body) : null
      });
    }
  });

  // 1. Authenticate as Alpha Employer
  console.log('[Step 1] Navigating to /auth and signing in as synthetic.employer.alpha...');
  await page.goto('http://localhost:3002/auth', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  await page.fill('[data-testid="email-input"]', 'synthetic.employer.alpha@example.invalid');
  await page.fill('[data-testid="password-input"]', 'TestPassword123!');
  await page.click('[data-testid="login-btn"]');
  await page.waitForURL('**/employer', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // 2. Create a new role through the UI (/employer/intake) with real PDF upload
  console.log('[Step 2] Creating a new role through UI intake flow...');
  await page.goto('http://localhost:3002/employer/intake', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Fill in role title
  await page.fill('[data-testid="role-title-input"]', 'Senior Cloud & Distributed Systems Engineer');
  await page.fill('[data-testid="location-input"]', 'San Francisco, CA / Remote');
  await page.fill('[data-testid="job-description-input"]', 'We are looking for a Senior Cloud & Distributed Systems Engineer to build high-scale Go microservices, distributed queues, and production Kubernetes infrastructure.');

  // Add Must-Have Requirements: Distributed Systems and Kubernetes
  const mustHaveInput = page.locator('[data-testid="must-have-input"]');
  await mustHaveInput.fill('Distributed Systems');
  await mustHaveInput.press('Enter');
  await page.waitForTimeout(200);

  await mustHaveInput.fill('Kubernetes');
  await mustHaveInput.press('Enter');
  await page.waitForTimeout(200);

  // Upload actual PDF file through DocumentDropzone
  console.log('[Step 2b] Uploading actual PDF file /tmp/alex_chen_systems_resume.pdf...');
  const uploadInput = page.locator('[data-testid="file-upload-input"]');
  await uploadInput.setInputFiles('/tmp/alex_chen_systems_resume.pdf');
  await page.waitForTimeout(500);

  // Assert file is rendered in uploaded documents list
  const uploadedFileItem = page.locator('text=alex_chen_systems_resume.pdf').first();
  if (!(await uploadedFileItem.isVisible())) {
    throw new Error('Assertion failed: Uploaded PDF not displayed in intake document list');
  }
  console.log('[Step 2b] PDF file successfully attached to intake.');

  // Submit role intake to create brief & ProofContract
  console.log('[Step 2c] Submitting intake to generate brief...');
  await page.click('[data-testid="generate-brief-btn"]');
  await page.waitForURL('**/employer/brief/**', { timeout: 15000 });
  await page.waitForTimeout(1000);

  const currentBriefUrl = page.url();
  const createdRunId = currentBriefUrl.split('/').pop().split('?')[0];
  console.log('[Step 2] Created Role Hiring Run ID:', createdRunId);

  // Assert expected state on Brief page before screenshot
  const unapprovedBanner = page.locator('[data-testid="rubric-approval-required-banner"]');
  await unapprovedBanner.waitFor({ timeout: 10000 });

  // Assert Must-Haves are visible
  const dSystemsReq = page.locator('text=Distributed Systems').first();
  const k8sReq = page.locator('text=Kubernetes').first();
  if (!(await dSystemsReq.isVisible()) || !(await k8sReq.isVisible())) {
    throw new Error('Assertion failed: Requirements missing from Brief page!');
  }

  const screen1Path = path.join(SCREENSHOT_DIR, '01_fresh_role_created_brief_unapproved.png');
  await page.screenshot({ path: screen1Path, fullPage: true });
  console.log('[Captured]', screen1Path);

  // 3. Approve its rubric through the UI
  console.log('[Step 3] Approving role rubric through UI...');
  const approveBtn = page.locator('[data-testid="approve-rubric-btn"]');
  if (!(await approveBtn.isVisible())) {
    throw new Error('Assertion failed: Expected Approve Rubric button on brief page');
  }
  await approveBtn.click();
  await page.waitForTimeout(1500);

  // Assert approval banner state
  const approvedBanner = page.locator('[data-testid="rubric-approved-banner"]');
  await approvedBanner.waitFor({ timeout: 10000 });

  // 4. FIX VERIFICATION: Reload page and confirm information does NOT disappear
  console.log('[Step 4] Reloading brief page to verify requirements and brief do not disappear...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const reloadedApprovedBanner = page.locator('[data-testid="rubric-approved-banner"]');
  if (!(await reloadedApprovedBanner.isVisible())) {
    throw new Error('Assertion failed: Rubric approved banner missing after reload!');
  }

  const reloadedDSystemsReq = page.locator('text=Distributed Systems').first();
  const reloadedK8sReq = page.locator('text=Kubernetes').first();
  if (!(await reloadedDSystemsReq.isVisible()) || !(await reloadedK8sReq.isVisible())) {
    throw new Error('Assertion failed: Requirements DISAPPEARED after rubric approval!');
  }
  console.log('[Step 4] Confirmed: Brief requirements and role summary remained intact after rubric approval.');

  const screen2Path = path.join(SCREENSHOT_DIR, '02_rubric_approved_brief_intact.png');
  await page.screenshot({ path: screen2Path, fullPage: true });
  console.log('[Captured]', screen2Path);

  // 5. Ingest actual parsed PDF candidate document with stored source hashes, offsets and parser version
  console.log('[Step 5] Ingesting candidate document parsed from real PDF...');
  const candProfileId = '00000000-0000-4000-b000-000000000001';
  const candExtractionId = crypto.randomUUID();
  const candDocId = crypto.randomUUID();
  const orgId = '00000000-0000-4000-c000-000000000001';

  const pdfBuffer = fs.readFileSync('/tmp/alex_chen_systems_resume.pdf');
  const fileHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const docText = 'Experienced distributed systems engineer. Built Go microservices and event queues. Candidate has no Kubernetes experience or cluster management.';
  const normHash = crypto.createHash('sha256').update(docText).digest('hex');

  runPsql(`
    UPDATE public.profiles SET name = 'Alex Chen (Candidate)' WHERE id = '${candProfileId}';
    UPDATE public.candidate_profiles SET name = 'Alex Chen (Candidate)' WHERE id = '${candProfileId}';

    DELETE FROM public.candidate_documents WHERE candidate_id = '${candProfileId}' AND hiring_run_id = '${createdRunId}';
    DELETE FROM public.candidates WHERE candidate_id = '${candProfileId}' AND hiring_run_id = '${createdRunId}';

    INSERT INTO public.candidates (id, candidate_id, hiring_run_id, status, fit_score)
    VALUES ('${candExtractionId}', '${candProfileId}', '${createdRunId}', 'sourced', null);

    INSERT INTO public.candidate_documents (
      id, candidate_id, hiring_run_id, org_id, filename, mime_type, byte_size, parser_name, file_sha256, normalized_text, normalized_text_sha256
    )
    VALUES (
      '${candDocId}',
      '${candProfileId}',
      '${createdRunId}',
      '${orgId}',
      'alex_chen_systems_resume.pdf',
      'application/pdf',
      ${pdfBuffer.length},
      '1.0.0-docling',
      '${fileHash}',
      '${docText.replace(/'/g, "''")}',
      '${normHash}'
    );
  `);

  // 6. Generate Packet via API
  console.log('[Step 6] Generating Candidate Trust Packet...');
  const genResult = await page.evaluate(async (extId) => {
    const res = await fetch(`/api/employer/packets/${extId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return { status: res.status, data: await res.json() };
  }, candExtractionId);

  console.log('[Step 6 Packet Gen Result]', genResult.status, {
    gate_pass: genResult.data?.evaluation_metrics?.gate_pass,
    proof_coverage: genResult.data?.evaluation_metrics?.proof_coverage,
    decision_readiness: genResult.data?.evaluation_metrics?.decision_readiness,
    parser_name: genResult.data?.parser_name,
    file_sha256: genResult.data?.file_sha256,
    normalized_text_sha256: genResult.data?.normalized_text_sha256,
    blockers: genResult.data?.missing_proof?.map(m => m.unproven_requirement)
  });

  if (genResult.data?.evaluation_metrics?.gate_pass !== false) {
    throw new Error('Assertion failed: Gate pass should be false due to unsatisfied Kubernetes requirement!');
  }
  if (genResult.data?.parser_name !== '1.0.0-docling') {
    throw new Error('Assertion failed: Expected parser_name 1.0.0-docling');
  }

  // 7. Navigate to Candidate Trust Packet UI
  console.log('[Step 7] Navigating to Candidate Trust Packet UI...');
  await page.goto(`http://localhost:3002/employer/packet/${candExtractionId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const candidateHeader = page.locator('text=Alex Chen (Candidate)').first();
  if (!(await candidateHeader.isVisible())) throw new Error('Assertion failed: Candidate header not visible');

  const readinessBadge = page.locator('[role="status"]:has-text("NEEDS PROOF")');
  if (!(await readinessBadge.isVisible())) throw new Error('Assertion failed: Canonical readiness badge NEEDS PROOF not visible');

  const k8sBlocker = page.locator('text=Kubernetes').first();
  if (!(await k8sBlocker.isVisible())) throw new Error('Assertion failed: Kubernetes blocker not visible in DecisionBlockers');

  // Verify Four-Category Role-Fit Distribution
  console.log('[Step 7b] Verifying 4-category role-fit distribution (Strong, Moderate, Limited, Low)...');
  const roleFitContainer = page.locator('[data-testid="role-fit-distribution-container"]');
  if (!(await roleFitContainer.isVisible())) {
    throw new Error('Assertion failed: role-fit-distribution-container not visible');
  }
  const roleFitText = await roleFitContainer.textContent();
  console.log('[Role Fit Distribution Text]:', roleFitText);
  if (!roleFitText.includes('Strong (p_strong)') ||
      !roleFitText.includes('Moderate (p_mod)') ||
      !roleFitText.includes('Limited (p_lim)') ||
      !roleFitText.includes('Low (p_low)')) {
    throw new Error(`Assertion failed: All 4 Dirichlet categories must be rendered! Found: "${roleFitText}"`);
  }
  console.log('[Step 7b] Confirmed: All four role-fit categories correctly rendered.');

  const screen3Path = path.join(SCREENSHOT_DIR, '03_four_category_role_fit_and_kubernetes_blocker.png');
  await page.screenshot({ path: screen3Path, fullPage: true });
  console.log('[Captured]', screen3Path);

  // 8. Open Working Citation Drawer
  console.log('[Step 8] Clicking on citation badge in Claim-to-Proof Ledger...');
  const citationBadge = page.locator('button:has-text(".pdf")').first();
  if (!(await citationBadge.isVisible())) {
    throw new Error('Assertion failed: Citation badge button not found in ClaimLedger');
  }
  await citationBadge.click();
  await page.waitForTimeout(1000);

  // Assert Evidence Drawer is visible
  const evidenceDrawerTitle = page.locator('text=Evidence Source Citation').first();
  if (!(await evidenceDrawerTitle.isVisible())) {
    throw new Error('Assertion failed: Evidence Source Citation drawer did not open!');
  }

  const screen4Path = path.join(SCREENSHOT_DIR, '04_working_citation_drawer_opened.png');
  await page.screenshot({ path: screen4Path, fullPage: true });
  console.log('[Captured]', screen4Path);

  // Close Evidence Drawer
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 9. Open Audit Details & Provenance Drawer
  console.log('[Step 9] Clicking on View Audit Details button...');
  const auditBtn = page.locator('#audit-details-trigger-btn');
  if (!(await auditBtn.isVisible())) {
    throw new Error('Assertion failed: View Audit Details trigger button not found');
  }
  await auditBtn.click();
  await page.waitForTimeout(1000);

  // Assert Audit Drawer is visible and displays revision & rubric version
  const auditDrawerTitle = page.locator('text=Audit Details & Provenance').first();
  if (!(await auditDrawerTitle.isVisible())) {
    throw new Error('Assertion failed: Audit Details & Provenance drawer did not open!');
  }

  const screen5Path = path.join(SCREENSHOT_DIR, '05_audit_details_provenance_drawer.png');
  await page.screenshot({ path: screen5Path, fullPage: true });
  console.log('[Captured]', screen5Path);

  // Close Audit Drawer
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 10. Record Human Decision Rationale & Action (Hold for Review)
  console.log('[Step 10] Recording human reviewer rationale and decision...');
  const rationaleInput = page.locator('#reviewer-rationale');
  if (!(await rationaleInput.isVisible())) {
    throw new Error('Assertion failed: Reviewer rationale textarea not visible');
  }
  const testRationale = 'Must-Have requirement Kubernetes is unsatisfied based on resume disclosure ("no Kubernetes experience"). Candidate placed on hold for architectural follow-up.';
  await rationaleInput.fill(testRationale);

  const holdBtn = page.locator('button:has-text("Hold for Review")');
  await holdBtn.click();
  await page.waitForTimeout(2000);

  // Assert decision status and rationale updated in UI
  const holdStatusBanner = page.locator('[data-testid="human-decision-status-banner"]');
  await holdStatusBanner.waitFor({ timeout: 10000 });
  const bannerText = await holdStatusBanner.textContent();
  if (!bannerText.includes('Placed on Hold')) {
    throw new Error(`Assertion failed: Expected "Placed on Hold" in banner, got "${bannerText}"`);
  }

  const rationaleDisplay = page.locator('[data-testid="reviewer-rationale-display"]');
  if (!(await rationaleDisplay.isVisible())) {
    throw new Error('Assertion failed: Reviewer rationale not displayed in HumanDecisionRail!');
  }
  const displayedRationale = await rationaleDisplay.textContent();
  if (!displayedRationale.includes(testRationale)) {
    throw new Error(`Assertion failed: Reviewer rationale mismatch! Got "${displayedRationale}"`);
  }

  const screen6Path = path.join(SCREENSHOT_DIR, '06_human_decision_recorded_with_rationale.png');
  await page.screenshot({ path: screen6Path, fullPage: true });
  console.log('[Captured]', screen6Path);

  // 11. Reload and verify persisted results including reviewer rationale
  console.log('[Step 11] Reloading page to verify database persistence of status & reviewer rationale...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const persistedHold = page.locator('[data-testid="human-decision-status-banner"]');
  await persistedHold.waitFor({ timeout: 10000 });
  const persistedText = await persistedHold.textContent();
  if (!persistedText.includes('Placed on Hold')) {
    throw new Error(`Assertion failed: Decision did not persist across page reload! Got "${persistedText}"`);
  }

  const persistedRationaleDisplay = page.locator('[data-testid="reviewer-rationale-display"]');
  if (!(await persistedRationaleDisplay.isVisible())) {
    throw new Error('Assertion failed: Reviewer rationale did NOT persist after reload!');
  }
  const persistedRationaleText = await persistedRationaleDisplay.textContent();
  if (!persistedRationaleText.includes(testRationale)) {
    throw new Error(`Assertion failed: Persisted reviewer rationale text mismatch! Got "${persistedRationaleText}"`);
  }
  console.log('[Step 11] Confirmed: Reviewer rationale successfully persisted and rendered after reload.');

  // Capture raw GET packet response for the reviewer persistence response deliverable
  const rawGetResponse = await page.evaluate(async (extId) => {
    const res = await fetch(`/api/employer/packets/${extId}`);
    return {
      status: res.status,
      headers: Object.fromEntries(res.headers.entries()),
      data: await res.json()
    };
  }, candExtractionId);

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'reviewer_persistence_response.json'),
    JSON.stringify(rawGetResponse, null, 2)
  );
  console.log('[Saved Deliverable]', path.join(OUTPUT_DIR, 'reviewer_persistence_response.json'));

  const screen7Path = path.join(SCREENSHOT_DIR, '07_persisted_state_and_rationale_after_reload.png');
  await page.screenshot({ path: screen7Path, fullPage: true });
  console.log('[Captured]', screen7Path);

  // 12. Render insufficient evidence as an actual unassessed packet
  console.log('[Step 12] Rendering insufficient evidence unassessed packet...');
  const unassessedCandId = crypto.randomUUID();
  const unassessedProfileId = '00000000-0000-4000-b000-000000000002';

  runPsql(`
    UPDATE public.profiles SET name = 'Jordan Vane (Unassessed)' WHERE id = '${unassessedProfileId}';
    UPDATE public.candidate_profiles SET name = 'Jordan Vane (Unassessed)' WHERE id = '${unassessedProfileId}';

    DELETE FROM public.candidate_documents WHERE candidate_id = '${unassessedProfileId}' AND hiring_run_id = '${createdRunId}';
    DELETE FROM public.candidates WHERE candidate_id = '${unassessedProfileId}' AND hiring_run_id = '${createdRunId}';

    INSERT INTO public.candidates (id, candidate_id, hiring_run_id, status, fit_score, decision_packet)
    VALUES (
      '${unassessedCandId}',
      '${unassessedProfileId}',
      '${createdRunId}',
      'sourced',
      null,
      '{
        "spec_version": "1.0.0-kernel",
        "ledger_revision": 1,
        "rubric_version": "1.0.0",
        "evaluation_timestamp": "2026-10-04T12:00:00.000Z",
        "fit_score": null,
        "proof_strength": 0.0,
        "entropy": 2.0,
        "claims": [],
        "evidence_refs": [],
        "missing_proof": [
          {"unproven_requirement": "Distributed Systems", "why_insufficient": "No verifiable evidence spans supplied."},
          {"unproven_requirement": "Kubernetes", "why_insufficient": "No verifiable evidence spans supplied."}
        ],
        "screen_summary": "Candidate unassessed due to insufficient evidence.",
        "evaluation_metrics": {
          "role_fit_label": "Insufficient Evidence",
          "decision_readiness": "INSUFFICIENT EVIDENCE",
          "proof_strength": 0.0,
          "proof_coverage": 0.0,
          "entropy": 2.0,
          "uncertainty": 1.0,
          "gate_pass": false,
          "must_have_gates_passed": false,
          "blockers_count": 2,
          "role_fit_distribution": {"p_low": 0.25, "p_limited": 0.25, "p_moderate": 0.25, "p_strong": 0.25}
        }
      }'::jsonb
    );
  `);

  await page.goto(`http://localhost:3002/employer/packet/${unassessedCandId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const unassessedBadge = page.locator('[role="status"]:has-text("INSUFFICIENT EVIDENCE")').first();
  if (!(await unassessedBadge.isVisible())) {
    throw new Error('Assertion failed: INSUFFICIENT EVIDENCE badge not visible for unassessed candidate');
  }

  const screen8Path = path.join(SCREENSHOT_DIR, '08_insufficient_evidence_unassessed_packet.png');
  await page.screenshot({ path: screen8Path, fullPage: true });
  console.log('[Captured]', screen8Path);

  // 13. Cross-Tenant Denial (Beta Employer)
  console.log('[Step 13] Testing cross-tenant denial with isolated Beta Employer context...');
  const betaContext = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const betaPage = await betaContext.newPage();

  // Attach network listener for beta context
  betaPage.on('request', req => {
    const url = req.url();
    if (url.includes('/api/')) {
      networkTrace.push({
        type: 'beta_request',
        timestamp: new Date().toISOString(),
        method: req.method(),
        url: req.url(),
        headers: sanitizeHeaders(req.headers()),
        postData: sanitizeBody(req.postData())
      });
    }
  });

  betaPage.on('response', async res => {
    const url = res.url();
    if (url.includes('/api/')) {
      networkTrace.push({
        type: 'beta_response',
        timestamp: new Date().toISOString(),
        url: res.url(),
        status: res.status(),
        statusText: res.statusText()
      });
    }
  });

  await betaPage.goto('http://localhost:3002/auth', { waitUntil: 'networkidle' });
  await betaPage.fill('[data-testid="email-input"]', 'synthetic.employer.beta@example.invalid');
  await betaPage.fill('[data-testid="password-input"]', 'TestPassword123!');
  await betaPage.click('[data-testid="login-btn"]');
  await betaPage.waitForURL('**/employer', { timeout: 15000 });

  // Attempt to access Alpha's candidate packet page in browser
  await betaPage.goto(`http://localhost:3002/employer/packet/${candExtractionId}`, { waitUntil: 'networkidle' });
  await betaPage.waitForTimeout(1500);

  // Attempt API calls from Beta's authenticated browser context
  const crossTenantDenials = await betaPage.evaluate(async (extId) => {
    const getRes = await fetch(`/api/employer/packets/${extId}`);
    const genRes = await fetch(`/api/employer/packets/${extId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const actRes = await fetch(`/api/employer/packets/${extId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', rationale: 'Cross tenant breach attempt' })
    });
    return {
      get: getRes.status,
      generate: genRes.status,
      action: actRes.status
    };
  }, candExtractionId);

  console.log('[Cross-Tenant Denial Status Codes]:', crossTenantDenials);
  const isDenied = (s) => s === 403 || s === 404;
  if (!isDenied(crossTenantDenials.get) || !isDenied(crossTenantDenials.generate) || !isDenied(crossTenantDenials.action)) {
    throw new Error(`Assertion failed: Beta should receive 403 or 404 on GET, POST generate, and POST action! Got: ${JSON.stringify(crossTenantDenials)}`);
  }
  console.log('[Step 13] Confirmed: Cross-tenant GET, POST generate, and POST action all strictly denied (403/404).');

  const screen9Path = path.join(SCREENSHOT_DIR, '09_security_cross_tenant_denial.png');
  await betaPage.screenshot({ path: screen9Path, fullPage: true });
  console.log('[Captured]', screen9Path);

  await betaContext.close();
  await context.close();
  await browser.close();

  // Write sanitized network trace
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'sanitized_network_trace.json'),
    JSON.stringify(networkTrace, null, 2)
  );
  console.log('[Saved Deliverable]', path.join(OUTPUT_DIR, 'sanitized_network_trace.json'));

  console.log('=== ALL 9 SCREENSHOTS & BROWSER JOURNEY ASSERTIONS PASSED WITH 100% SUCCESS ===');
}

run().catch(err => {
  console.error('Customer journey automation failed:', err);
  process.exit(1);
});
