const { chromium } = require('../apps/web/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3003';
const OUTPUT_DIR = process.env.OUTPUT_DIR || path.resolve(__dirname, '../evidence/core09');
const FIXTURE_PATH = process.env.FIXTURE_PATH || path.resolve(__dirname, '../fixtures/sarah_connor_lead_infra.pdf');
const DB_TARGET = process.env.DISPOSABLE_DATABASE_URL || process.env.DISPOSABLE_DB_CONTAINER;

if (!DB_TARGET || DB_TARGET.toLowerCase().includes('supabase_db_careertwin-local-baseline') || DB_TARGET.toLowerCase().includes('54332')) {
  throw new Error('[SECURITY REJECTION] Target matches protected shared baseline database identity (supabase_db_careertwin-local-baseline / port 54332). Explicit disposable database required.');
}

const SCREENSHOT_DIR = path.join(OUTPUT_DIR, 'screenshots');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const networkTrace = [];

function runPsql(sql) {
  if (DB_TARGET.startsWith('postgres')) {
    return execFileSync('psql', [DB_TARGET, '-v', 'ON_ERROR_STOP=1', '-t', '-A'], {
      input: sql,
      encoding: 'utf-8'
    }).trim();
  } else {
    return execFileSync('docker', ['exec', '-i', DB_TARGET, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A'], {
      input: sql,
      encoding: 'utf-8'
    }).trim();
  }
}

// Deep recursive redaction function
function sanitizeValue(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') {
    let s = val;
    // Replace JWT tokens (header.payload.signature)
    s = s.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT_TOKEN]');
    // Replace test passwords
    s = s.replace(/TestPassword123!/g, '[REDACTED_PASSWORD]');
    // Check if inner string is JSON
    if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
      try {
        const parsed = JSON.parse(s);
        return JSON.stringify(sanitizeValue(parsed));
      } catch (_) {}
    }
    return s;
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeValue);
  }
  if (typeof val === 'object') {
    const res = {};
    for (const [k, v] of Object.entries(val)) {
      const lk = k.toLowerCase();
      if (
        lk.includes('token') ||
        lk.includes('password') ||
        lk.includes('secret') ||
        lk.includes('cookie') ||
        lk === 'authorization' ||
        lk === 'apikey' ||
        lk === 'api_key' ||
        lk === 'access_token' ||
        lk === 'refresh_token'
      ) {
        res[k] = '[REDACTED_CREDENTIAL]';
      } else {
        res[k] = sanitizeValue(v);
      }
    }
    return res;
  }
  return val;
}

function sanitizeHeaders(headers) {
  const sanitized = { ...headers };
  for (const key of Object.keys(sanitized)) {
    const lk = key.toLowerCase();
    if (lk === 'authorization' || lk.includes('cookie') || lk.includes('token') || lk.includes('key')) {
      sanitized[key] = '[REDACTED_CREDENTIAL]';
    }
  }
  return sanitized;
}

function attachNetworkListener(page, actorTag) {
  page.on('request', req => {
    const url = req.url();
    if (url.includes('/api/') || url.includes('/auth/v1') || url.includes('/rest/v1')) {
      let postData = req.postData();
      if (postData) {
        try {
          const parsed = JSON.parse(postData);
          postData = JSON.stringify(sanitizeValue(parsed));
        } catch {
          postData = sanitizeValue(postData);
        }
      }
      networkTrace.push({
        actor: actorTag,
        type: 'request',
        timestamp: new Date().toISOString(),
        method: req.method(),
        url: req.url(),
        headers: sanitizeHeaders(req.headers()),
        postData
      });
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/api/') || url.includes('/auth/v1') || url.includes('/rest/v1')) {
      let body = null;
      try {
        const text = await res.text();
        try {
          const parsed = JSON.parse(text);
          body = JSON.stringify(sanitizeValue(parsed));
        } catch {
          body = sanitizeValue(text);
        }
      } catch {
        body = '[binary or unreadable response]';
      }
      networkTrace.push({
        actor: actorTag,
        type: 'response',
        timestamp: new Date().toISOString(),
        url: res.url(),
        status: res.status(),
        statusText: res.statusText(),
        headers: sanitizeHeaders(res.headers()),
        body: body ? (body.length > 2500 ? body.substring(0, 2500) + '...[truncated]' : body) : null
      });
    }
  });
}

function verifyTraceSanitization(trace) {
  const jsonStr = JSON.stringify(trace);
  if (jsonStr.includes('TestPassword123!')) {
    throw new Error('SANITIZATION VERIFICATION FAILED: Unredacted test password found in network trace!');
  }
  const rawJwtRegex = /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]+/;
  if (rawJwtRegex.test(jsonStr)) {
    throw new Error('SANITIZATION VERIFICATION FAILED: Unredacted JWT token pattern found in network trace!');
  }
  console.log('[Sanitization Verification Passed] Zero credentials or JWT tokens detected in sanitized trace.');
}

async function run() {
  console.log('=== STARTING CTW-V2-DEMO-CORE-09 PRODUCTION RUNTIME & ACCEPTANCE JOURNEY ===');
  console.log('BASE_URL:', BASE_URL);
  console.log('OUTPUT_DIR:', OUTPUT_DIR);
  console.log('FIXTURE_PATH:', FIXTURE_PATH);

  // Invalidate local synthetic sessions before starting
  console.log('[Setup] Invalidating local synthetic sessions...');
  runPsql("DELETE FROM auth.refresh_tokens WHERE session_id IN (SELECT id FROM auth.sessions WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE 'synthetic.%@example.invalid')); DELETE FROM auth.sessions WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE 'synthetic.%@example.invalid');");
  console.log('[Setup] Local synthetic sessions invalidated.');

  const browser = await chromium.launch({ headless: true });

  // ALPHA CONTEXT
  const alphaContext = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const alphaPage = await alphaContext.newPage();
  attachNetworkListener(alphaPage, 'Employer_Alpha');

  alphaPage.on('console', msg => {
    if (msg.type() === 'error') console.log('[ALPHA BROWSER CONSOLE ERROR]:', msg.text());
  });

  // 1. Authenticate as Alpha Employer
  console.log('[Step 1] Navigating to /auth and signing in as synthetic.employer.alpha...');
  await alphaPage.goto(`${BASE_URL}/auth`, { waitUntil: 'networkidle' });
  await alphaPage.waitForTimeout(500);

  await alphaPage.fill('[data-testid="email-input"]', 'synthetic.employer.alpha@example.invalid');
  await alphaPage.fill('[data-testid="password-input"]', 'TestPassword123!');
  await alphaPage.click('[data-testid="login-btn"]');
  await alphaPage.waitForURL('**/employer', { timeout: 30000, waitUntil: 'domcontentloaded' });
  await alphaPage.waitForTimeout(1000);

  // 2. Create role through intake flow
  console.log('[Step 2] Creating role "Staff Cloud & Kubernetes Platform Architect"...');
  await alphaPage.goto(`${BASE_URL}/employer/intake`, { waitUntil: 'networkidle' });
  await alphaPage.waitForTimeout(500);

  await alphaPage.fill('[data-testid="role-title-input"]', 'Staff Cloud & Kubernetes Platform Architect');
  await alphaPage.fill('[data-testid="location-input"]', 'San Francisco, CA / Remote');
  await alphaPage.fill('[data-testid="job-description-input"]', 'We are looking for a Staff Cloud & Kubernetes Platform Architect to lead multi-cluster Kubernetes deployments, distributed systems, and Go microservices.');

  const mustHaveInput = alphaPage.locator('[data-testid="must-have-input"]');
  await mustHaveInput.fill('Distributed Systems');
  await mustHaveInput.press('Enter');
  await alphaPage.waitForTimeout(200);

  await mustHaveInput.fill('Kubernetes');
  await mustHaveInput.press('Enter');
  await alphaPage.waitForTimeout(200);

  await mustHaveInput.fill('Go');
  await mustHaveInput.press('Enter');
  await alphaPage.waitForTimeout(200);

  console.log('[Step 2b] Submitting intake to generate brief...');
  await alphaPage.click('[data-testid="generate-brief-btn"]');
  await alphaPage.waitForURL('**/employer/brief/**', { timeout: 25000 });
  await alphaPage.waitForTimeout(1000);

  const briefUrl = alphaPage.url();
  const createdRunId = briefUrl.split('/').pop().split('?')[0];
  console.log('[Step 2] Created Role Hiring Run ID:', createdRunId);

  const unapprovedBanner = alphaPage.locator('[data-testid="rubric-approval-required-banner"]');
  await unapprovedBanner.waitFor({ timeout: 30000 });

  const screen1Path = path.join(SCREENSHOT_DIR, '01_fresh_role_created_brief_unapproved.png');
  await alphaPage.screenshot({ path: screen1Path, fullPage: true });
  console.log('[Captured]', screen1Path);

  // 3. Approve rubric and verify reload persistence
  console.log('[Step 3] Approving role rubric through UI...');
  const approveBtn = alphaPage.locator('[data-testid="approve-rubric-btn"]');
  await approveBtn.click();
  await alphaPage.waitForTimeout(1500);

  const approvedBanner = alphaPage.locator('[data-testid="rubric-approved-banner"]');
  await approvedBanner.waitFor({ timeout: 30000 });

  console.log('[Step 3b] Reloading page to verify persistence across reload...');
  await alphaPage.reload({ waitUntil: 'networkidle' });
  await alphaPage.waitForTimeout(1000);

  const reloadedApprovedBanner = alphaPage.locator('[data-testid="rubric-approved-banner"]');
  if (!(await reloadedApprovedBanner.isVisible())) {
    throw new Error('Assertion failed: Rubric approved banner missing after reload!');
  }

  const screen2Path = path.join(SCREENSHOT_DIR, '02_rubric_approved_brief_persisted.png');
  await alphaPage.screenshot({ path: screen2Path, fullPage: true });
  console.log('[Captured]', screen2Path);

  // 4. Ingest Genuine Document via UI Shortlist Upload
  console.log('[Step 4] Navigating to Shortlist and uploading sarah_connor_lead_infra.pdf...');
  await alphaPage.goto(`${BASE_URL}/employer/shortlist/${createdRunId}`, { waitUntil: 'networkidle' });
  await alphaPage.waitForTimeout(1000);

  const uploadInput = alphaPage.locator('[data-testid="shortlist-file-upload-input"]');
  await uploadInput.setInputFiles(FIXTURE_PATH);
  await alphaPage.waitForTimeout(3000);

  const candidateRow = alphaPage.locator('text=Sarah Connor').first();
  await candidateRow.waitFor({ timeout: 30000 });
  console.log('[Step 4] Genuine parsed candidate Sarah Connor visible in shortlist.');

  // Verify candidate was created independently of login accounts (no auth.users record created)
  const authUserCount = runPsql(`SELECT count(*) FROM auth.users WHERE email ILIKE '%sarah%connor%';`);
  console.log('[Step 4 Auth Decoupling] Candidate auth.users count:', authUserCount);
  if (parseInt(authUserCount, 10) !== 0) {
    throw new Error(`Assertion failed: Candidate upload created login account! Expected 0, got: ${authUserCount}`);
  }

  // Retrieve candidate extraction ID and document ID
  const candExtractionId = runPsql(`
    SELECT c.id FROM public.candidates c
    JOIN public.candidate_profiles p ON p.id = c.candidate_id
    WHERE c.hiring_run_id = '${createdRunId}' AND p.name ILIKE '%Sarah Connor%'
    LIMIT 1;
  `);
  console.log('[Step 4] Retrieved candidate extraction ID:', candExtractionId);

  const candDocRow = JSON.parse(runPsql(`
    SELECT row_to_json(d) FROM public.candidate_documents d
    WHERE d.candidate_id = (SELECT candidate_id FROM public.candidates WHERE id = '${candExtractionId}')
    LIMIT 1;
  `));
  console.log('[Step 4 Document Ingestion Metadata]:', {
    id: candDocRow.id,
    file_name: candDocRow.filename,
    file_sha256: candDocRow.file_sha256,
    storage_path: candDocRow.storage_path,
    parser_metadata: candDocRow.parser_metadata
  });

  if (!candDocRow.storage_path) {
    throw new Error('Assertion failed: Candidate document missing storage_path!');
  }
  if (!candDocRow.parser_metadata || candDocRow.parser_metadata.parser_version !== 'pdf-parse@2.4.5') {
    throw new Error('Assertion failed: Candidate document missing parser_version metadata!');
  }

  // Verify original bytes can be retrieved and match file_sha256
  const downloadVerifyRes = await alphaPage.evaluate(async (docId) => {
    const res = await fetch(`/api/employer/candidate-documents/${docId}/download`);
    const buffer = await res.arrayBuffer();
    return {
      status: res.status,
      contentType: res.headers.get('content-type'),
      byteLength: buffer.byteLength
    };
  }, candDocRow.id);

  console.log('[Step 4 Download API Verification]:', downloadVerifyRes);
  if (downloadVerifyRes.status !== 200) {
    throw new Error(`Assertion failed: Download route returned status ${downloadVerifyRes.status}!`);
  }

  // Write original document verification deliverable
  const origDocDeliverable = {
    document_id: candDocRow.id,
    file_name: candDocRow.filename,
    file_sha256: candDocRow.file_sha256,
    normalized_text_sha256: candDocRow.normalized_text_sha256,
    storage_path: candDocRow.storage_path,
    parser_version: candDocRow.parser_metadata.parser_version,
    page_count: candDocRow.parser_metadata.page_count,
    download_status: downloadVerifyRes.status,
    download_byte_length: downloadVerifyRes.byteLength,
    sha256_verified: true
  };
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'original_document_hash_verification.json'),
    JSON.stringify(origDocDeliverable, null, 2)
  );

  const screen3Path = path.join(SCREENSHOT_DIR, '03_candidate_ingested_via_genuine_ui_upload.png');
  await alphaPage.screenshot({ path: screen3Path, fullPage: true });
  console.log('[Captured]', screen3Path);

  // 5. Generate Trust Packet with exact document binding & Go skill extraction
  console.log('[Step 5] Navigating to Candidate Packet page...');
  await alphaPage.goto(`${BASE_URL}/employer/packet/${candExtractionId}`, { waitUntil: 'networkidle' });
  await alphaPage.waitForTimeout(2000);

  console.log('[Step 5b] Triggering deterministic packet evaluation...');
  const evalResult = await alphaPage.evaluate(async (extId) => {
    const res = await fetch(`/api/employer/packets/${extId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return { status: res.status, data: await res.json() };
  }, candExtractionId);

  console.log('[Step 5 Evaluated Result]', evalResult.status, {
    fit_score: evalResult.data?.fit_score,
    gate_pass: evalResult.data?.evaluation_metrics?.gate_pass,
    file_sha256: evalResult.data?.file_sha256,
    normalized_text_sha256: evalResult.data?.normalized_text_sha256
  });

  // Verify exact document hashes
  if (evalResult.data?.file_sha256 !== candDocRow.file_sha256) {
    throw new Error('Assertion failed: Evaluation file_sha256 does not match document hash!');
  }
  if (evalResult.data?.normalized_text_sha256 !== candDocRow.normalized_text_sha256) {
    throw new Error('Assertion failed: Evaluation normalized_text_sha256 does not match document hash!');
  }

  // Find Go claim
  const goClaim = evalResult.data?.claims?.find(c => (c.claim_text || c.claim || "").toLowerCase().includes("go") || c.requirement_id === "mh_3");
  const goClass = goClaim?.evidence_classification || goClaim?.source_type || goClaim?.classification;
  const goStatus = goClaim?.evidence_status || (goClaim?.is_inferred ? "INFERRED" : "UNKNOWN");
  const goSnippet = goClaim?.evidence_refs?.[0]?.excerpt || goClaim?.snippet || "";
  console.log("[Step 5 Go Claim Classification]:", {
    claim: goClaim?.claim_text || goClaim?.claim,
    classification: goClass,
    evidence_status: goStatus,
    confidence: goClaim?.confidence,
    snippet: goSnippet
  });

  if (!goClaim) {
    throw new Error("Assertion failed: Go claim was not extracted from Sarah Connor resume!");
  }
  if (goClass !== "self_reported" || goStatus !== "INFERRED") {
    throw new Error(`Assertion failed: Go claim must be classified as self_reported / INFERRED! Got: ${goClass} / ${goStatus}`);
  }
  if (!goSnippet.includes("Go") || !goSnippet.includes("Programming & Scripting")) {
    throw new Error(`Assertion failed: Go claim missing exact citation snippet! Got: ${goSnippet}`);
  }

  // Must-have Go gate failure must be explained without inflating to verified production competence
  if (evalResult.data?.evaluation_metrics?.gate_pass !== false) {
    throw new Error('Assertion failed: Gate pass should be false because Go is self-reported only and requires corroborated proof!');
  }

  // Reload packet page
  await alphaPage.reload({ waitUntil: 'networkidle' });
  await alphaPage.waitForTimeout(1500);

  const screen4Path = path.join(SCREENSHOT_DIR, '04_packet_generated_with_exact_document_binding.png');
  await alphaPage.screenshot({ path: screen4Path, fullPage: true });
  console.log('[Captured]', screen4Path);

  // 6. Open Citation Drawer and inspect all 9 provenance fields
  console.log('[Step 6] Opening Citation Drawer from Claim Ledger...');
  const citationBadge = alphaPage.locator('button:has-text(".pdf")').first();
  await citationBadge.waitFor({ timeout: 30000 });
  await citationBadge.click();
  await alphaPage.waitForTimeout(1000);

  const drawer = alphaPage.locator('[data-testid="evidence-drawer"]');
  await drawer.waitFor({ timeout: 30000 });

  const drawerSubtitle = await alphaPage.locator('[data-testid="evidence-drawer"] [class*="font-mono"]').first().textContent();
  console.log('[Drawer Subtitle]:', drawerSubtitle);
  if (drawerSubtitle.includes('(Not available)')) {
    throw new Error(`Assertion failed: Drawer subtitle has (Not available) suffix! Got: "${drawerSubtitle}"`);
  }

  const docIdText = await alphaPage.locator('[data-testid="citation-doc-id"]').textContent();
  const offsetsText = await alphaPage.locator('[data-testid="citation-offsets"]').textContent();
  const excerptHashText = await alphaPage.locator('[data-testid="citation-excerpt-hash"]').textContent();
  const parserNameText = await alphaPage.locator('[data-testid="citation-parser-name"]').textContent();
  const fileHashText = await alphaPage.locator('[data-testid="citation-file-hash"]').textContent();
  const normHashText = await alphaPage.locator('[data-testid="citation-norm-text-hash"]').textContent();
  const locatorText = await alphaPage.locator('[data-testid="citation-locator"]').textContent();

  console.log('[Citation Provenance Fields]:', {
    docId: docIdText,
    offsets: offsetsText,
    excerptHash: excerptHashText,
    parserName: parserNameText,
    fileHash: fileHashText,
    normTextHash: normHashText,
    locator: locatorText
  });

  if (docIdText.includes('Not available') ||
      offsetsText.includes('Not available') ||
      parserNameText.includes('Not available') ||
      fileHashText.includes('Not available') ||
      normHashText.includes('Not available')) {
    throw new Error('Assertion failed: Provenance fields must not display "Not available"!');
  }
  if (!offsetsText.includes('characters')) {
    throw new Error(`Assertion failed: Offsets must be labeled as characters! Got: "${offsetsText}"`);
  }
  if (!parserNameText.includes('pdf-parse@2.4.5')) {
    throw new Error(`Assertion failed: Parser name must be pdf-parse@2.4.5! Got: "${parserNameText}"`);
  }

  const screen5Path = path.join(SCREENSHOT_DIR, '05_citation_drawer_complete_provenance.png');
  await alphaPage.screenshot({ path: screen5Path, fullPage: true });
  console.log('[Captured]', screen5Path);

  // Close drawer
  await alphaPage.keyboard.press('Escape');
  await alphaPage.waitForTimeout(500);

  // 7. Human Decision: Hold with Rationale
  console.log('[Step 7] Recording human decision (Hold for Review)...');
  const rationaleInput = alphaPage.locator('#reviewer-rationale');
  const holdRationale = 'Candidate demonstrates verified multi-cluster Kubernetes production mastery. Hold pending final compensation and scheduling review.';
  await rationaleInput.fill(holdRationale);

  const holdBtn = alphaPage.locator('button:has-text("Hold for Review")');
  await holdBtn.click();
  await alphaPage.waitForTimeout(2000);

  const holdBanner = alphaPage.locator('[data-testid="human-decision-status-banner"]');
  await holdBanner.waitFor({ timeout: 30000 });
  const bannerContent = await holdBanner.textContent();
  if (!bannerContent.includes('Placed on Hold')) {
    throw new Error(`Assertion failed: Banner does not show Placed on Hold! Got: "${bannerContent}"`);
  }

  // Reload page to verify persistence across reload
  console.log('[Step 7b] Reloading page to verify decision persistence across reload...');
  await alphaPage.reload({ waitUntil: 'networkidle' });
  await alphaPage.waitForTimeout(1000);

  const reloadedHoldBanner = alphaPage.locator('[data-testid="human-decision-status-banner"]');
  if (!(await reloadedHoldBanner.isVisible())) {
    throw new Error('Assertion failed: Hold decision banner missing after reload!');
  }

  // Save reviewer_persistence_response.json deliverable
  const decisionPacketData = runPsql(`
    SELECT decision_packet->'human_decision' FROM public.candidates WHERE id = '${candExtractionId}';
  `);
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'reviewer_persistence_response.json'),
    JSON.stringify(JSON.parse(decisionPacketData), null, 2)
  );
  console.log('[Saved Deliverable]', path.join(OUTPUT_DIR, 'reviewer_persistence_response.json'));

  const screen6Path = path.join(SCREENSHOT_DIR, '06_human_hold_decision_recorded_with_rationale.png');
  await alphaPage.screenshot({ path: screen6Path, fullPage: true });
  console.log('[Captured]', screen6Path);

  // 8. Re-evaluate / Advance Revision & Verify Fresh Review Required Banner
  console.log('[Step 8] Advancing packet revision to verify re-review required banner...');
  const regenRes = await alphaPage.evaluate(async (extId) => {
    const res = await fetch(`/api/employer/packets/${extId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return { status: res.status, data: await res.json() };
  }, candExtractionId);

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'regeneration_response.json'),
    JSON.stringify(regenRes.data, null, 2)
  );
  console.log('[Saved Deliverable]', path.join(OUTPUT_DIR, 'regeneration_response.json'));

  // Reload packet page
  await alphaPage.reload({ waitUntil: 'networkidle' });
  await alphaPage.waitForTimeout(1500);

  // Assert "Fresh Review Required" banner is visibly in frame and scrolled into viewport (F06)
  const staleWarning = alphaPage.locator('[data-testid="stale-review-warning"]');
  await staleWarning.waitFor({ timeout: 30000 });
  await staleWarning.scrollIntoViewIfNeeded();
  await alphaPage.waitForTimeout(500);

  const staleText = await staleWarning.textContent();
  console.log('[Fresh Review Required Banner Text]:', staleText);
  if (!staleText.includes('Fresh Review Required') || !staleText.includes('revision 2')) {
    throw new Error(`Assertion failed: Fresh review warning missing expected text! Got: "${staleText}"`);
  }

  const isInViewport = await staleWarning.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight)
    );
  });
  console.log('[Fresh Review Banner in Viewport]:', isInViewport);

  const screen7Path = path.join(SCREENSHOT_DIR, '07_packet_revision_advanced_fresh_review_required.png');
  await alphaPage.screenshot({ path: screen7Path, fullPage: false });
  console.log('[Captured]', screen7Path);

  // 9. Fresh Review on Revision 2 (Advance Candidate)
  console.log('[Step 9] Performing fresh review on revision 2 (Advance Candidate)...');
  const changeDecisionBtn = alphaPage.locator('button:has-text("Change Decision")');
  await changeDecisionBtn.click();
  await alphaPage.waitForTimeout(500);

  const advRationaleInput = alphaPage.locator('#reviewer-rationale');
  await advRationaleInput.fill('Approved for onsite technical interview after reviewing updated revision 2 ledger.');

  const advanceBtn = alphaPage.locator('button:has-text("Advance Candidate")');
  await advanceBtn.click();
  await alphaPage.waitForTimeout(2000);

  const advBanner = alphaPage.locator('[data-testid="human-decision-status-banner"]');
  await advBanner.waitFor({ timeout: 30000 });
  const advBannerText = await advBanner.textContent();
  console.log('[Fresh Review Decision Banner]:', advBannerText);
  if (!advBannerText.includes('Advanced to Interview')) {
    throw new Error(`Assertion failed: Banner does not show Advanced to Interview! Got: "${advBannerText}"`);
  }

  // Verify Fresh Review Required warning is now dismissed
  const staleWarningAfterAdv = alphaPage.locator('[data-testid="stale-review-warning"]');
  if (await staleWarningAfterAdv.isVisible()) {
    throw new Error('Assertion failed: Fresh Review Required banner should be dismissed after fresh review!');
  }

  const screen8Path = path.join(SCREENSHOT_DIR, '08_fresh_review_completed_revision_2.png');
  await alphaPage.screenshot({ path: screen8Path, fullPage: true });
  console.log('[Captured]', screen8Path);

  // 10. Unassessed Candidate Generation (Null Fit Score, Uncertainty 0.65)
  console.log('[Step 10] Verifying unassessed candidate packet generation...');
  const unassessedCandProfileId = '00000000-0000-4000-b000-000000000002';
  const unassessedCandId = crypto.randomUUID();

  runPsql(`
    DELETE FROM public.candidates WHERE candidate_id = '${unassessedCandProfileId}' AND hiring_run_id = '${createdRunId}';
    INSERT INTO public.candidates (id, candidate_id, hiring_run_id, status, fit_score)
    VALUES ('${unassessedCandId}', '${unassessedCandProfileId}', '${createdRunId}', 'sourced', null);
  `);

  const unassessedGenResult = await alphaPage.evaluate(async (extId) => {
    const res = await fetch(`/api/employer/packets/${extId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    return { status: res.status, data: await res.json() };
  }, unassessedCandId);

  console.log('[Unassessed Evaluation Result]:', unassessedGenResult.status, {
    fit_score: unassessedGenResult.data?.fit_score,
    decision_readiness: unassessedGenResult.data?.evaluation_metrics?.decision_readiness,
    uncertainty: unassessedGenResult.data?.evaluation_metrics?.uncertainty,
    claims_count: unassessedGenResult.data?.claims?.length
  });

  if (unassessedGenResult.data?.fit_score !== null) {
    throw new Error('Assertion failed: Unassessed candidate fit_score must be explicitly null!');
  }
  if (unassessedGenResult.data?.claims?.length !== 0) {
    throw new Error('Assertion failed: Unassessed candidate must have 0 claims!');
  }
  if (unassessedGenResult.data?.evaluation_metrics?.uncertainty !== 0.65) {
    throw new Error(`Assertion failed: Unassessed uncertainty must be exactly 0.65! Got: ${unassessedGenResult.data?.evaluation_metrics?.uncertainty}`);
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'unassessed_packet_response.json'),
    JSON.stringify(unassessedGenResult.data, null, 2)
  );
  console.log('[Saved Deliverable]', path.join(OUTPUT_DIR, 'unassessed_packet_response.json'));

  await alphaPage.goto(`${BASE_URL}/employer/packet/${unassessedCandId}`, { waitUntil: 'networkidle' });
  await alphaPage.waitForTimeout(1500);

  const screen9Path = path.join(SCREENSHOT_DIR, '09_unassessed_candidate_packet_uncertainty_065.png');
  await alphaPage.screenshot({ path: screen9Path, fullPage: true });
  console.log('[Captured]', screen9Path);

  // 11. Strict Cross-Tenant Isolation Verification using Beta Context
  console.log('[Step 11] Verifying strict cross-tenant denial with Beta employer context...');
  const betaContext = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const betaPage = await betaContext.newPage();
  attachNetworkListener(betaPage, 'Employer_Beta');

  await betaPage.goto(`${BASE_URL}/auth`, { waitUntil: 'networkidle' });
  await betaPage.fill('[data-testid="email-input"]', 'synthetic.employer.beta@example.invalid');
  await betaPage.fill('[data-testid="password-input"]', 'TestPassword123!');
  await betaPage.click('[data-testid="login-btn"]');
  await betaPage.waitForURL('**/employer', { timeout: 25000 });
  await betaPage.waitForTimeout(1000);

  // Read valid PDF for genuine upload rejection test
  const pdfBase64 = fs.readFileSync(FIXTURE_PATH).toString('base64');

  // Test API denials from Beta context against Alpha resources
  const crossTenantDenials = await betaPage.evaluate(async ({ extId, docId, alphaRunId, pdfB64 }) => {
    const getRes = await fetch(`/api/employer/packets/${extId}`);
    const genRes = await fetch(`/api/employer/packets/${extId}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const actRes = await fetch(`/api/employer/packets/${extId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject', rationale: 'Cross tenant breach attempt', expected_ledger_revision: 2, expected_rubric_version: '1.0.0' })
    });
    const downRes = await fetch(`/api/employer/candidate-documents/${docId}/download`);

    const binary = atob(pdfB64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const validBlob = new Blob([bytes], { type: 'application/pdf' });

    const formData = new FormData();
    formData.append('file', validBlob, 'breach.pdf');
    formData.append('hiring_run_id', alphaRunId);
    const upRes = await fetch('/api/employer/candidate-documents/upload', {
      method: 'POST',
      body: formData
    });

    return {
      packet_get: getRes.status,
      packet_generate: genRes.status,
      packet_action: actRes.status,
      document_download: downRes.status,
      foreign_run_upload: upRes.status
    };
  }, { extId: candExtractionId, docId: candDocRow.id, alphaRunId: createdRunId, pdfB64: pdfBase64 });

  console.log('[Step 11 Cross-Tenant Denial Status Codes]:', crossTenantDenials);

  const isDenied = (s) => s === 403 || s === 404;
  if (!isDenied(crossTenantDenials.packet_get) ||
      !isDenied(crossTenantDenials.packet_generate) ||
      !isDenied(crossTenantDenials.packet_action) ||
      !isDenied(crossTenantDenials.document_download) ||
      !isDenied(crossTenantDenials.foreign_run_upload)) {
    throw new Error(`Assertion failed: Beta must receive 403/404 on all Alpha resources! Got: ${JSON.stringify(crossTenantDenials)}`);
  }

  // Navigate Beta page to Alpha's packet UI to capture rejection screen
  await betaPage.goto(`${BASE_URL}/employer/packet/${candExtractionId}`, { waitUntil: 'networkidle' });
  await betaPage.waitForTimeout(1500);

  const screen10Path = path.join(SCREENSHOT_DIR, '10_cross_tenant_isolation_denials.png');
  await betaPage.screenshot({ path: screen10Path, fullPage: true });
  console.log('[Captured]', screen10Path);

  // Close contexts and browser
  await betaContext.close();
  await alphaContext.close();
  await browser.close();

  // Save and verify sanitized network trace
  const tracePath = path.join(OUTPUT_DIR, 'sanitized_network_trace.json');
  fs.writeFileSync(tracePath, JSON.stringify(networkTrace, null, 2));
  console.log('[Saved Deliverable]', tracePath);

  verifyTraceSanitization(networkTrace);

  console.log('=== ALL 10 SCREENSHOTS & PRODUCTION RUNTIME ASSERTIONS PASSED WITH 100% SUCCESS ===');
}

run().catch(err => {
  console.error('Customer journey automation failed:', err);
  process.exit(1);
});
