import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '../apps/web/node_modules/playwright/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const EVIDENCE_DIR = path.join(ROOT, 'evidence', 'browser_acceptance');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const WEB_BASE = process.env.WORKBYLINE_WEB_URL || 'http://127.0.0.1:3004';
const ENGINE_BASE = process.env.WORKBYLINE_ENGINE_URL || 'http://127.0.0.1:8011';
const RUN_ALPHA_1 = '1bea003e-9466-4e4e-a185-6cc7cdd06ff1';
const RUN_ALPHA_2 = '95709284-d21b-496e-bb7c-6c68d067c422';

const USER_ALPHA_RECRUITER = {
  email: 'synthetic.employer.alpha@example.invalid',
  password: 'TestPassword123!',
};
const USER_ALPHA_AUDITOR = {
  email: 'synthetic.employer.alpha.auditor@example.invalid',
  password: 'TestPassword123!',
};
const USER_BETA_OWNER = {
  email: 'synthetic.employer.beta@example.invalid',
  password: 'TestPassword123!',
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(`BROWSER_ACCEPTANCE_ASSERTION_FAILED: ${message}`);
  }
}

async function expectButtonEnabled(page, locator, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await locator.isEnabled()) return;
    const btnText = await locator.innerText().catch(() => '');
    const busyStatus = await page.locator('.animate-pulse').innerText().catch(() => '');
    // If element is not enabled, check why
    await page.waitForTimeout(250);
  }
  const btnText = await locator.innerText().catch(() => '');
  const btnHtml = await locator.evaluate(el => el.outerHTML).catch(() => '');
  const panelHtml = await page.locator('[data-testid="context-evidence-panel"]').innerText().catch(() => '');
  throw new Error(`Button did not become enabled within ${timeoutMs}ms. Button: ${btnText} (${btnHtml})\nPanel Text: ${panelHtml}`);
}

async function signInAtAuthPage(page, email, password) {
  await page.goto(`${WEB_BASE}/auth`, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="email-input"]').first().fill(email);
  await page.locator('[data-testid="password-input"]').first().fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 20000 }),
    page.locator('[data-testid="login-btn"]').click(),
  ]);
}

async function waitForAllSourcesCompleted(page, expectedCount, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const items = page.locator('[data-testid^="context-source-item-"]');
    const count = await items.count();
    const errEl = page.locator('[data-testid="context-panel-error"]');
    const hasErr = (await errEl.count()) > 0;
    const errText = hasErr ? (await errEl.innerText()).trim() : '';
    if (count >= expectedCount) {
      let allTerminal = true;
      for (let i = 0; i < count; i++) {
        const text = await items.nth(i).innerText();
        if (text.includes('PENDING') || text.includes('PROCESSING')) {
          allTerminal = false;
          break;
        }
      }
      if (allTerminal) {
        await page.waitForTimeout(800);
        return count;
      }
    }
    const refreshBtn = page.locator('[data-testid="refresh-context-sources-btn"]');
    if (await refreshBtn.isEnabled()) {
      await refreshBtn.click();
    }
    await page.waitForTimeout(1500);
  }
  const items = page.locator('[data-testid^="context-source-item-"]');
  const count = await items.count();
  const texts = [];
  for (let i = 0; i < count; i++) texts.push(await items.nth(i).innerText());
  const errEl = page.locator('[data-testid="context-panel-error"]');
  const errText = (await errEl.count()) > 0 ? await errEl.innerText() : 'none';
  throw new Error(`Timed out waiting for ${expectedCount} sources. Found ${count} items: [${texts.join(' | ')}]. Panel error: ${errText}`);
}

async function waitForSourceVersion(page, sourceKey, targetVersion, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const items = page.locator('[data-testid^="context-source-item-"]');
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      const text = await items.nth(i).innerText();
      if (text.includes(sourceKey) && text.includes(`v${targetVersion}`)) {
        if (!text.includes('PENDING') && !text.includes('PROCESSING')) {
          await page.waitForTimeout(600);
          return items.nth(i);
        }
      }
    }
    const refreshBtn = page.locator('[data-testid="refresh-context-sources-btn"]');
    if (await refreshBtn.isEnabled()) {
      await refreshBtn.click();
    }
    await page.waitForTimeout(1200);
  }
  throw new Error(`Timed out waiting for ${sourceKey} to reach v${targetVersion} COMPLETED`);
}

async function main() {
  console.log('[Setup] Initializing clean state on disposable PostgreSQL and private storage...');
  try {
    const pythonBin = path.join(ROOT, '.venv', 'bin', 'python');
    const cleanCmd = `"${pythonBin}" -c "import psycopg; conn = psycopg.connect('postgresql://postgres:postgres@127.0.0.1:54399/disposable_v3_db'); cur = conn.cursor(); cur.execute('TRUNCATE TABLE wbctx_sources, wbctx_versions, wbctx_artifacts, wbctx_spans, wbctx_span_embeddings, wbctx_jobs, wbctx_indexings, wbctx_projections, wbctx_idempotency_keys, wbctx_nonces, wbctx_erasure_tombstones CASCADE;'); conn.commit(); conn.close()"`;
    execSync(cleanCmd, { stdio: 'inherit' });
    const storageDir = path.join(ROOT, 'private-context-storage');
    if (fs.existsSync(storageDir)) {
      fs.rmSync(storageDir, { recursive: true, force: true });
    }
    fs.mkdirSync(storageDir, { recursive: true });
    console.log('[Setup] Disposable DB context tables truncated (bindings preserved) and private storage cleaned.');
  } catch (err) {
    console.warn('[Setup] Warning during cleanup:', err.message);
  }

  const report = {
    verified_at: new Date().toISOString(),
    web_base: WEB_BASE,
    engine_base: ENGINE_BASE,
    assertions: {},
    network_events: [],
    console_errors: [],
    screenshots: [],
  };

  // Prepare temporary synthetic upload files in /tmp/workbyline_browser_fixtures
  const tmpDir = '/tmp/workbyline_browser_fixtures';
  fs.mkdirSync(tmpDir, { recursive: true });

  const txtV1Path = path.join(tmpDir, 'browser_journey_v1.txt');
  const txtV2Path = path.join(tmpDir, 'browser_journey_v2.txt');
  const dup1Path = path.join(tmpDir, 'dir1', 'duplicate_spec.txt');
  const dup2Path = path.join(tmpDir, 'dir2', 'duplicate_spec.txt');
  const batchValidPath = path.join(tmpDir, 'batch_valid_item.txt');
  const batchInvalidPath = path.join(tmpDir, 'batch_invalid_utf8.txt');
  const lostRespPath = path.join(tmpDir, 'lost_response_retry.txt');

  fs.mkdirSync(path.dirname(dup1Path), { recursive: true });
  fs.mkdirSync(path.dirname(dup2Path), { recursive: true });

  fs.writeFileSync(
    txtV1Path,
    'Version 1 Browser Journey Candidate Dossier: Distributed consensus Raft replication and baseline storage engine architecture.'
  );
  fs.writeFileSync(
    txtV2Path,
    'Version 2 Browser Journey Candidate Dossier: Byzantine quorum linearizability and multi-region Paxos lease failover.'
  );
  fs.writeFileSync(
    dup1Path,
    'First independent candidate file named duplicate_spec.txt covering deterministic kernel scheduling.'
  );
  fs.writeFileSync(
    dup2Path,
    'Second independent candidate file named duplicate_spec.txt covering zero-copy RDMA transport.'
  );
  fs.writeFileSync(
    batchValidPath,
    'Batch upload valid document: High-availability PostgreSQL logical replication and WAL archiving.'
  );
  // Invalid UTF-8 bytes so backend rejects batchInvalidPath while batchValidPath succeeds
  fs.writeFileSync(batchInvalidPath, Buffer.from([0xff, 0xfe, 0xfd, 0x80, 0x81]));
  fs.writeFileSync(
    lostRespPath,
    'Idempotent retry after lost HTTP response: Ephemeral lease fencing and single-flight commit verification.'
  );

  const pdfFixturePath = path.join(ROOT, 'fixtures', 'alex_chen_systems_resume.pdf');
  const docxFixturePath = path.join(ROOT, 'fixtures', 'platform_architect_spec.docx');

  const browser = await chromium.launch({ headless: true });

  try {
    // =========================================================================
    // PART A: Primary Recruiter Journey (Org Alpha)
    // =========================================================================
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();

    page.on('console', (msg) => {
      console.log(`[BROWSER CONSOLE ${msg.type().toUpperCase()}] ${msg.text()}`);
      if (msg.type() === 'error') {
        report.console_errors.push(msg.text());
      }
    });
    page.on('requestfailed', (req) => {
      console.log(`[BROWSER REQ FAILED] ${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
    });
    page.on('response', (res) => {
      const url = res.url();
      if (url.includes('/api/employer/')) {
        console.log(`[BROWSER API RESP] ${res.request().method()} ${url} -> ${res.status()}`);
        report.network_events.push({
          method: res.request().method(),
          url,
          status: res.status(),
        });
      }
    });

    console.log('[1/12] Signing in at /auth as Org Alpha Recruiter...');
    await signInAtAuthPage(page, USER_ALPHA_RECRUITER.email, USER_ALPHA_RECRUITER.password);
    report.assertions.authentic_sign_in = {
      passed: true,
      email: USER_ALPHA_RECRUITER.email,
      post_login_url: page.url(),
    };

    console.log('[2/12] Navigating to hiring run brief page...');
    await page.goto(`${WEB_BASE}/employer/brief/${RUN_ALPHA_1}`, { waitUntil: 'networkidle' });
    const panel = page.locator('[data-testid="context-evidence-panel"]');
    await panel.waitFor({ state: 'visible', timeout: 20000 });
    const panelText = await panel.innerText();
    assert(
      panelText.includes('Authoritative source material for recruiter review. Evidence retrieval does not verify competence or modify approved hiring rubrics.'),
      'Governance disclaimer must be visible in ContextEvidencePanel'
    );
    await page.screenshot({ path: path.join(EVIDENCE_DIR, '01_brief_page_loaded.png'), fullPage: true });
    report.screenshots.push('01_brief_page_loaded.png');
    report.assertions.hiring_run_navigation_and_disclaimer = {
      passed: true,
      hiring_run_id: RUN_ALPHA_1,
    };

    console.log('[3/12] Uploading TXT, PDF, and DOCX through browser file input...');
    const fileInput = page.locator('input[aria-label="Choose document"]');
    const uploadBtn = page.locator('[data-testid="upload-context-source-btn"]');

    // Upload TXT v1
    await fileInput.setInputFiles(txtV1Path);
    await uploadBtn.waitFor({ state: 'visible' });
    await expectButtonEnabled(page, uploadBtn);
    await uploadBtn.click();
    await waitForAllSourcesCompleted(page, 1);

    // Upload PDF fixture
    await fileInput.setInputFiles(pdfFixturePath);
    await expectButtonEnabled(page, uploadBtn);
    await uploadBtn.click();
    await waitForAllSourcesCompleted(page, 2);

    // Upload DOCX fixture
    await fileInput.setInputFiles(docxFixturePath);
    await expectButtonEnabled(page, uploadBtn);
    await uploadBtn.click();
    await waitForAllSourcesCompleted(page, 3);

    report.assertions.txt_pdf_docx_upload = {
      passed: true,
      uploaded_files: ['browser_journey_v1.txt', 'alex_chen_systems_resume.pdf', 'platform_architect_spec.docx'],
      completed_sources: 3,
    };

    console.log('[4/12] Uploading two independent documents with the same filename (duplicate_spec.txt)...');
    await fileInput.setInputFiles(dup1Path);
    await expectButtonEnabled(page, uploadBtn);
    await uploadBtn.click();
    await waitForAllSourcesCompleted(page, 4);

    await fileInput.setInputFiles(dup2Path);
    await expectButtonEnabled(page, uploadBtn);
    await uploadBtn.click();
    await waitForAllSourcesCompleted(page, 5);

    const sourceItems = page.locator('[data-testid^="context-source-item-"]');
    const dupSourceIds = [];
    const totalNow = await sourceItems.count();
    for (let i = 0; i < totalNow; i++) {
      const txt = await sourceItems.nth(i).innerText();
      if (txt.includes('duplicate_spec.txt')) {
        const testId = await sourceItems.nth(i).getAttribute('data-testid');
        dupSourceIds.push(testId.replace('context-source-item-', ''));
      }
    }
    assert(
      dupSourceIds.length === 2 && dupSourceIds[0] !== dupSourceIds[1],
      `Expected 2 distinct source_ids for duplicate_spec.txt, got: ${JSON.stringify(dupSourceIds)}`
    );
    report.assertions.same_filename_distinct_sources = {
      passed: true,
      filename: 'duplicate_spec.txt',
      distinct_source_ids: dupSourceIds,
    };

    console.log('[5/12] Explicit revision (v1 -> v2) and inspecting both current (v2) and historical (v1) in UI...');
    // Click the first uploaded source (browser_journey_v1.txt)
    for (let i = 0; i < totalNow; i++) {
      const txt = await sourceItems.nth(i).innerText();
      if (txt.includes('browser_journey_v1.txt')) {
        await sourceItems.nth(i).click();
        break;
      }
    }
    const inspector = page.locator('[data-testid="active-source-inspector"]');
    await inspector.waitFor({ state: 'visible' });
    const v1InspectorText = await inspector.innerText();
    assert(v1InspectorText.includes('Version 1'), 'Expected Version 1 before revision');

    // Click "Revise Document"
    await inspector.getByRole('button', { name: /Revise Document/i }).click();
    await fileInput.setInputFiles(txtV2Path);
    await expectButtonEnabled(page, uploadBtn);
    await uploadBtn.click();

    // Wait specifically for browser_journey_v1.txt to reach v2 COMPLETED
    const revisedCard = await waitForSourceVersion(page, 'browser_journey_v1.txt', 2);
    await revisedCard.click();
    await page.waitForTimeout(600);

    const v2Btn = page.locator('[data-testid="version-selector-btn-2"]');
    const v1Btn = page.locator('[data-testid="version-selector-btn-1"]');
    await v2Btn.waitFor({ state: 'visible', timeout: 15000 });
    await v2Btn.click();
    await page.waitForTimeout(600);
    const v2DetailText = await inspector.innerText();
    assert(
      v2DetailText.includes('Version 2') && v2DetailText.includes('Byzantine quorum linearizability'),
      'Expected Version 2 content in active source inspector'
    );

    // Switch to historical Version 1 in UI
    await v1Btn.click();
    await page.waitForTimeout(500);
    const v1DetailText = await inspector.innerText();
    assert(
      v1DetailText.includes('Version 1') && v1DetailText.includes('Distributed consensus Raft replication'),
      'Expected historical Version 1 content when clicking v1 selector button'
    );
    // Switch back to Version 2
    await v2Btn.click();
    await page.waitForTimeout(500);

    await page.screenshot({ path: path.join(EVIDENCE_DIR, '02_version_revision_and_history.png'), fullPage: true });
    report.screenshots.push('02_version_revision_and_history.png');
    report.assertions.explicit_revision_and_historical_inspection = {
      passed: true,
      v2_verified: true,
      v1_historical_verified: true,
      parsing_state: 'completed',
      indexing_state: 'indexed',
      projection_state: 'disabled',
    };

    console.log('[6/12] Multi-file batch upload with partial failure and retry without resubmitting succeeded item...');
    let uploadCallFileNames = [];
    const trackBatchHandler = async (route) => {
      const postData = route.request().postDataBuffer();
      const bodyStr = postData ? postData.toString('latin1') : '';
      if (bodyStr.includes('batch_valid_item.txt')) uploadCallFileNames.push('batch_valid_item.txt');
      if (bodyStr.includes('batch_invalid_utf8.txt')) uploadCallFileNames.push('batch_invalid_utf8.txt');
      await route.continue();
    };
    await page.route('**/api/employer/context-sources/upload', trackBatchHandler);

    await fileInput.setInputFiles([batchValidPath, batchInvalidPath]);
    await expectButtonEnabled(page, uploadBtn);
    await uploadBtn.click();
    await page.waitForTimeout(1500);
    await waitForAllSourcesCompleted(page, 6);

    const panelAfterBatch = await panel.innerText();
    assert(
      panelAfterBatch.includes('Partial Batch Results (successful uploads preserved):') &&
        panelAfterBatch.includes('batch_invalid_utf8.txt'),
      'Expected Partial Batch Results banner naming batch_invalid_utf8.txt'
    );
    assert(
      panelAfterBatch.includes('Ready to upload 1 document'),
      'Expected only 1 failed document remaining in queue for retry'
    );

    // Now click Upload button again to retry ONLY the remaining failed item; verify batch_valid_item.txt is NOT resubmitted
    uploadCallFileNames = [];
    await expectButtonEnabled(page, uploadBtn);
    await uploadBtn.click();
    await page.waitForTimeout(1000);
    assert(
      uploadCallFileNames.length === 1 && uploadCallFileNames[0] === 'batch_invalid_utf8.txt',
      `Expected retry to submit only batch_invalid_utf8.txt, got ${JSON.stringify(uploadCallFileNames)}`
    );
    await page.unroute('**/api/employer/context-sources/upload', trackBatchHandler);

    report.assertions.multi_file_batch_partial_failure_and_retry = {
      passed: true,
      succeeded_preserved: 'batch_valid_item.txt',
      failed_isolated_for_retry: 'batch_invalid_utf8.txt',
      retry_submitted_files: uploadCallFileNames,
    };

    // Clear the remaining failed item from the file input so subsequent tests have a clean queue
    const cancelRevBtn = page.locator('button[title="Cancel revision"]');
    if ((await cancelRevBtn.count()) > 0 && (await cancelRevBtn.isVisible())) {
      await cancelRevBtn.click();
    }
    await fileInput.setInputFiles([]);
    await page.waitForTimeout(500);

    console.log('[7/12] Lost response after backend commit followed by retry using original Idempotency-Key...');
    let firstIdempotencyKey = null;
    let retryIdempotencyKey = null;
    let retryResponseBody = null;
    let interceptPhase = 'abort_after_commit';

    const lostResponseHandler = async (route) => {
      const req = route.request();
      const ctHeader = req.headers()['content-type'] || '';
      const idemHeader = req.headers()['idempotency-key'];
      const boundaryMatch = ctHeader.match(/boundary=(.+)$/);
      const boundary = boundaryMatch ? boundaryMatch[1] : null;

      if (interceptPhase === 'abort_after_commit' && boundary) {
        firstIdempotencyKey = idemHeader;
        const fileBytes = fs.readFileSync(lostRespPath);
        const parts = [
          Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="hiring_run_id"\r\n\r\n${RUN_ALPHA_1}\r\n`),
          Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="idempotency_key"\r\n\r\n${idemHeader}\r\n`),
          Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="source_key"\r\n\r\nlost_response_retry.txt\r\n`),
          Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="lost_response_retry.txt"\r\nContent-Type: text/plain\r\n\r\n`),
          fileBytes,
          Buffer.from(`\r\n--${boundary}--\r\n`)
        ];
        const reconstructedBody = Buffer.concat(parts);
        // Let the request reach the real backend and commit!
        const realResponse = await route.fetch({ postData: reconstructedBody });
        const respText = await realResponse.text();
        assert(
          realResponse.status() === 202 || realResponse.status() === 201,
          `Expected backend commit 202/201, got ${realResponse.status()} with body ${respText}`
        );
        interceptPhase = 'allow_retry';
        // Simulate lost response after backend commit
        await route.abort('failed');
      } else {
        await route.continue();
      }
    };
    await page.route('**/api/employer/context-sources/upload', lostResponseHandler);

    await fileInput.setInputFiles(lostRespPath);
    await uploadBtn.waitFor({ state: 'visible' });
    await expectButtonEnabled(page, uploadBtn);
    await uploadBtn.click();
    await page.waitForTimeout(1500);

    // Because response was aborted after commit, UI shows Partial Batch Results and keeps lost_response_retry.txt in queue
    const textAfterLostResp = await panel.innerText();
    assert(
      textAfterLostResp.includes('lost_response_retry.txt'),
      'Expected lost_response_retry.txt error notice after simulated lost response'
    );

    // Now click Upload button to retry with the preserved Idempotency-Key
    await expectButtonEnabled(page, uploadBtn);
    const [retryResponse] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/employer/context-sources/upload') && (resp.status() === 202 || resp.status() === 200)),
      uploadBtn.click()
    ]);
    retryResponseBody = await retryResponse.json();
    retryIdempotencyKey = retryResponse.request().headers()['idempotency-key'];
    await waitForAllSourcesCompleted(page, 7);
    await page.unroute('**/api/employer/context-sources/upload', lostResponseHandler);

    assert(
      firstIdempotencyKey && firstIdempotencyKey === retryIdempotencyKey,
      `Expected identical Idempotency-Key across retry (${firstIdempotencyKey} vs ${retryIdempotencyKey})`
    );
    assert(
      retryResponseBody && retryResponseBody.replayed === true,
      `Expected replayed: true on idempotent retry after lost response, got ${JSON.stringify(retryResponseBody)}`
    );

    // Count how many sources exist for lost_response_retry.txt (must be exactly 1, at v1)
    let lostRespCount = 0;
    for (let i = 0; i < (await sourceItems.count()); i++) {
      const txt = await sourceItems.nth(i).innerText();
      if (txt.includes('lost_response_retry.txt')) {
        lostRespCount++;
        assert(txt.includes('v1'), `Expected v1 (not v2) for replayed upload, got: ${txt}`);
      }
    }
    assert(lostRespCount === 1, `Expected 1 source for lost_response_retry.txt, found ${lostRespCount}`);

    report.assertions.lost_response_idempotent_retry = {
      passed: true,
      idempotency_key: firstIdempotencyKey,
      replayed: retryResponseBody.replayed,
      source_id: retryResponseBody.source_id,
      version: retryResponseBody.version,
      duplicate_sources_created: 0,
    };

    console.log('[8/12] Verifying truthful parsing, indexing, and projection status badges in UI...');
    const inspectorBadgesText = await inspector.innerText();
    assert(inspectorBadgesText.includes('completed'), 'Expected parsing_state completed badge');
    assert(inspectorBadgesText.includes('indexed'), 'Expected indexing_state indexed badge');
    assert(inspectorBadgesText.includes('disabled'), 'Expected projection_state disabled badge');
    report.assertions.subsystem_status_badges = {
      passed: true,
      parsing_state: 'completed',
      indexing_state: 'indexed',
      projection_state: 'disabled',
    };

    console.log('[9/12] Executing real dense + lexical hybrid retrieval and verifying honest 503 notices for related/qa...');
    const searchInput = page.locator('input[aria-label="Find evidence"]');
    const searchBtn = page.locator('[data-testid="search-passages-btn"]');
    const modeSelect = page.locator('select[aria-label="Retrieval strategy"]');

    await modeSelect.selectOption('search');
    await searchInput.fill('Byzantine quorum linearizability Paxos');
    await searchBtn.click();

    const searchResults = page.locator('[data-testid="context-search-results"]');
    await searchResults.waitFor({ state: 'visible', timeout: 15000 });
    const resultsText = await searchResults.innerText();
    assert(
      resultsText.includes('Byzantine quorum linearizability') && resultsText.includes('RRF Score:'),
      'Expected hybrid search results to include v2 passage text and RRF Score'
    );
    assert(
      !resultsText.includes('Distributed consensus Raft replication'),
      'Expected superseded v1 text to be excluded from default current retrieval'
    );
    await page.screenshot({ path: path.join(EVIDENCE_DIR, '03_hybrid_search_results.png'), fullPage: true });
    report.screenshots.push('03_hybrid_search_results.png');

    // Switch to Graphiti related mode -> verify honest 503 notice
    await modeSelect.selectOption('related');
    await searchBtn.click();
    const errorAlert = page.locator('[data-testid="context-evidence-error"]');
    await errorAlert.waitFor({ state: 'visible', timeout: 10000 });
    const relatedErrText = await errorAlert.innerText();
    assert(
      relatedErrText.includes('Graph retrieval is unavailable'),
      `Expected honest Graphiti 503 message, got: ${relatedErrText}`
    );

    // Switch to Feature-Gated QA mode -> verify honest 503 notice
    await modeSelect.selectOption('qa');
    await searchBtn.click();
    await errorAlert.waitFor({ state: 'visible', timeout: 10000 });
    const qaErrText = await errorAlert.innerText();
    assert(
      qaErrText.includes('Generative Q&A is feature-gated'),
      `Expected honest QA 503 message, got: ${qaErrText}`
    );
    await modeSelect.selectOption('search');

    report.assertions.hybrid_retrieval_and_gated_modes = {
      passed: true,
      hybrid_search_returned_v2_with_rrf: true,
      related_mode_503_honest: relatedErrText,
      qa_mode_503_honest: qaErrText,
    };

    console.log('[10/12] Revoking a document in UI and confirming exclusion from active list and retrieval...');
    let revokedSourceId = retryResponseBody.source_id;

    // Record timestamp after indexing and before revocation
    const timestampBeforeRevoke = new Date().toISOString();

    // Prove the source IS retrievable at this historical timestamp BEFORE revocation
    const preRevokeHistRes = await page.evaluate(async ({ runId, asOfTime, targetSourceId }) => {
      const r = await fetch('/api/employer/context-sources/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hiring_run_id: runId,
          question: 'Ephemeral lease fencing single-flight commit',
          as_of: asOfTime,
        }),
      });
      const data = await r.json();
      return {
        status: r.status,
        hasTargetSource: (data.passages || []).some((p) => p.source_id === targetSourceId),
      };
    }, { runId: RUN_ALPHA_1, asOfTime: timestampBeforeRevoke, targetSourceId: revokedSourceId });

    assert(
      preRevokeHistRes.status === 200 && preRevokeHistRes.hasTargetSource,
      'Target source must be retrievable before revocation at the recorded timestamp'
    );

    // Select lost_response_retry.txt and revoke it
    await page.locator(`[data-testid="context-source-item-${revokedSourceId}"]`).click();
    await inspector.getByRole('button', { name: /^Revoke$/i }).click();
    await inspector.getByRole('button', { name: /Confirm Revocation/i }).click();
    await page.waitForTimeout(1500);

    const revokedCardCount = await page.locator(`[data-testid="context-source-item-${revokedSourceId}"]`).count();
    assert(revokedCardCount === 0, 'Revoked source must disappear from active sources list');

    // Repeat identical CURRENT search query -> must exclude revoked source
    await searchInput.fill('Ephemeral lease fencing single-flight commit');
    await searchBtn.click();
    await searchResults.waitFor({ state: 'visible', timeout: 15000 });
    const postRevokeSearchText = await searchResults.innerText();
    assert(
      !postRevokeSearchText.includes('Ephemeral lease fencing'),
      'Revoked source content must not appear in current search results'
    );

    // Repeat identical HISTORICAL query at timestampBeforeRevoke -> must exclude under documented revocation policy
    const postRevokeHistRes = await page.evaluate(async ({ runId, asOfTime, targetSourceId }) => {
      const r = await fetch('/api/employer/context-sources/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hiring_run_id: runId,
          question: 'Ephemeral lease fencing single-flight commit',
          as_of: asOfTime,
        }),
      });
      const data = await r.json();
      return {
        status: r.status,
        hasTargetSource: (data.passages || []).some((p) => p.source_id === targetSourceId),
      };
    }, { runId: RUN_ALPHA_1, asOfTime: timestampBeforeRevoke, targetSourceId: revokedSourceId });

    assert(
      postRevokeHistRes.status === 200 && !postRevokeHistRes.hasTargetSource,
      'Revoked source must be excluded from historical retrieval under documented revocation policy'
    );

    report.assertions.revocation_and_retrieval_exclusion = {
      passed: true,
      revoked_source_id: revokedSourceId,
      timestamp_before_revoke: timestampBeforeRevoke,
      retrievable_before_revoke: true,
      removed_from_ui: true,
      excluded_from_current_search: true,
      excluded_from_historical_search: true,
    };

    console.log('[11/12] Testing hiring-run switching while request is in flight (zero cross-run state bleed)...');
    let routeIntercepted = false;
    let releaseHold;
    const holdPromise = new Promise((resolve) => { releaseHold = resolve; });
    let routePromiseResolve;
    const routePromise = new Promise((resolve) => { routePromiseResolve = resolve; });

    const delaySearchHandler = async (route) => {
      routeIntercepted = true;
      routePromiseResolve();
      await holdPromise;
      await route.continue();
    };

    await page.route('**/api/employer/context-sources/search', delaySearchHandler);
    await searchInput.fill('Byzantine quorum linearizability');
    await searchBtn.click();

    // Positively observe that request is in flight
    await routePromise;
    assert(routeIntercepted === true, 'Run A search request must be positively observed in flight');

    // Switch runs via authentic Next.js client-side navigation (Dashboard -> Role B) without DOM anchor injection
    await page.click('a:has-text("Dashboard"), button:has-text("Dashboard"), [data-testid="return-to-dashboard-btn"], a[aria-label="Return to dashboard"]');
    await page.waitForURL('**/employer', { timeout: 15000 });
    await page.click(`[data-testid="brief-btn-${RUN_ALPHA_2}"]`);
    await page.waitForURL(`**/employer/brief/${RUN_ALPHA_2}`, { timeout: 15000 });

    await page.locator('[data-testid="context-evidence-panel"]').waitFor({ state: 'visible', timeout: 20000 });

    // Release the delayed Run A search response while on Run B
    releaseHold();
    await page.waitForTimeout(2000);
    await page.unroute('**/api/employer/context-sources/search', delaySearchHandler);

    const run2PanelText = await page.locator('[data-testid="context-evidence-panel"]').innerText();
    const hasZeroDocs = /indexed documents \(0\)/i.test(run2PanelText);
    const hasSearchText = run2PanelText.includes('Byzantine quorum linearizability');
    assert(
      hasZeroDocs && !hasSearchText,
      `Expected zero cross-run state bleed on RUN_ALPHA_2 (hasZeroDocs=${hasZeroDocs}, hasSearchText=${hasSearchText})`
    );
    await page.screenshot({ path: path.join(EVIDENCE_DIR, '04_run_switch_isolation.png'), fullPage: true });
    report.screenshots.push('04_run_switch_isolation.png');
    report.assertions.in_flight_run_switching_isolation = {
      passed: true,
      from_run: RUN_ALPHA_1,
      to_run: RUN_ALPHA_2,
      in_flight_request_triggered: true,
      cross_run_bleed: false,
    };

    await context.tracing.stop({ path: path.join(EVIDENCE_DIR, 'trace.zip') });
    await context.close();

    // Sanitize trace.zip immediately to ensure zero raw JWT or credential leakage
    try {
      const pythonBin = path.join(ROOT, '.venv', 'bin', 'python');
      const sanitizeScript = path.join(ROOT, 'scripts', 'sanitize_evidence_trace.py');
      execSync(`"${pythonBin}" "${sanitizeScript}"`, { stdio: 'inherit' });
      console.log('[Sanitization] Acceptance trace.zip sanitized successfully.');
    } catch (err) {
      console.warn('[Sanitization Warning] Failed to run sanitize_evidence_trace.py:', err.message);
    }

    // =========================================================================
    // PART B: Multi-Role Browser Check (Org Alpha Read-Only Auditor)
    // =========================================================================
    console.log('[12a/12] Verifying Auditor read-only role enforcement in browser...');
    const auditorContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const auditorPage = await auditorContext.newPage();
    await signInAtAuthPage(auditorPage, USER_ALPHA_AUDITOR.email, USER_ALPHA_AUDITOR.password);
    await auditorPage.goto(`${WEB_BASE}/employer/brief/${RUN_ALPHA_1}`, { waitUntil: 'networkidle' });
    const auditorPanel = auditorPage.locator('[data-testid="context-evidence-panel"]');
    await auditorPanel.waitFor({ state: 'visible', timeout: 20000 });
    const auditorText = await auditorPanel.innerText();
    assert(
      auditorText.includes('Auditor Mode: Read-only access to evidence and audit ledgers.'),
      'Expected Auditor Mode banner to be visible for auditor user'
    );
    const auditorUploadBtns = await auditorPage.locator('[data-testid="upload-context-source-btn"]').count();
    assert(auditorUploadBtns === 0, 'Upload button must not be rendered for auditor role');

    // Attempt direct POST upload from auditor browser session -> must return 403 ACCESS_DENIED
    const auditorWriteAttempt = await auditorPage.evaluate(async (runId) => {
      const fd = new FormData();
      fd.set('file', new Blob(['auditor write attempt'], { type: 'text/plain' }), 'auditor.txt');
      fd.set('hiring_run_id', runId);
      const res = await fetch('/api/employer/context-sources/upload', { method: 'POST', body: fd });
      return { status: res.status, body: await res.json() };
    }, RUN_ALPHA_1);
    assert(
      auditorWriteAttempt.status === 403 && auditorWriteAttempt.body.error === 'ACCESS_DENIED',
      `Expected 403 ACCESS_DENIED for auditor upload attempt, got ${JSON.stringify(auditorWriteAttempt)}`
    );
    await auditorPage.screenshot({ path: path.join(EVIDENCE_DIR, '05_auditor_readonly_mode.png'), fullPage: true });
    report.screenshots.push('05_auditor_readonly_mode.png');
    await auditorContext.close();

    // =========================================================================
    // PART C: Cross-Tenant Browser Check (Org Beta Owner attempting Org Alpha Run)
    // =========================================================================
    console.log('[12b/12] Verifying Cross-Tenant isolation in browser (Tenant B blocked from Tenant A)...');
    const betaContext = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const betaPage = await betaContext.newPage();
    await signInAtAuthPage(betaPage, USER_BETA_OWNER.email, USER_BETA_OWNER.password);

    const betaCrossTenantCheck = await betaPage.evaluate(async (alphaRunId) => {
      const briefRes = await fetch(`/api/employer/brief/${alphaRunId}`);
      const sourcesRes = await fetch(`/api/employer/context-sources?hiring_run_id=${alphaRunId}`);
      const searchRes = await fetch('/api/employer/context-sources/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hiring_run_id: alphaRunId, question: 'Byzantine quorum' }),
      });
      return {
        briefStatus: briefRes.status,
        sourcesStatus: sourcesRes.status,
        searchStatus: searchRes.status,
      };
    }, RUN_ALPHA_1);

    assert(
      [403, 404].includes(betaCrossTenantCheck.briefStatus) &&
        [403, 404].includes(betaCrossTenantCheck.sourcesStatus) &&
        [403, 404].includes(betaCrossTenantCheck.searchStatus),
      `Expected 403 or 404 across all Tenant A endpoints when accessed by Tenant B, got ${JSON.stringify(betaCrossTenantCheck)}`
    );
    await betaContext.close();

    report.assertions.multi_role_and_cross_tenant_isolation = {
      passed: true,
      auditor_ui_readonly_verified: true,
      auditor_write_blocked_status: auditorWriteAttempt.status,
      tenant_b_cross_tenant_statuses: betaCrossTenantCheck,
    };

    const reportPath = path.join(EVIDENCE_DIR, 'browser_acceptance_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`ALL 12 BROWSER ACCEPTANCE GATES PASSED! Report written to ${reportPath}`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
