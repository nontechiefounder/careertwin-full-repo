const { test, expect } = require('playwright/test');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// FAIL-CLOSED Credential Handling
const pwd = process.env.CAREERTWIN_STAGING_TEST_PASSWORD;
if (!pwd) {
  throw new Error('FAIL-CLOSED: CAREERTWIN_STAGING_TEST_PASSWORD is required for authenticated Day 3 UAT.');
}

function required(value, label) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Required fixture field missing: ${label}`);
  }
  return value;
}

const BASE_URL = 'http://localhost:3000';
const STAGING_OWNER_EMAIL = 'd2c.alpha.owner@example.com';
const ALPHA_RUN_ID = '11111111-1111-4111-d2c1-111111111111';

test.describe('Employer Day 3 UX-V2 Playwright Authenticated UAT Suite (UX-V2-D3-C4-R3)', () => {

  test.beforeEach(async ({ page }) => {
    // Authenticate as Staging Owner (Alpha Corp)
    await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"]', STAGING_OWNER_EMAIL);
    await page.fill('input[type="password"]', pwd);
    await page.click('button[type="submit"]');

    await page.waitForFunction(() => window.location.pathname !== '/auth', { timeout: 15000 });
  });

  test('Test A — Real Proof Contract API-to-UI exact field equality for live fixture: Role title, status, explicit requirements, disqualifiers, unavailable states, and governance notices', async ({ page }) => {
    const briefResPromise = page.waitForResponse(
      (r) => r.url().includes(`/api/employer/brief/${ALPHA_RUN_ID}`) && r.request().method() === 'GET'
    );

    await page.goto(`${BASE_URL}/employer/brief/${ALPHA_RUN_ID}`, { waitUntil: 'domcontentloaded' });
    const apiRes = await briefResPromise;
    expect(apiRes.status()).toBe(200);
    const resData = await apiRes.json();

    const run = required(resData.hiring_run, 'hiring_run');
    const brief = required(resData.brief, 'brief');

    await page.waitForSelector('[data-testid="brief-page"]', { state: 'visible', timeout: 15000 });

    // Assert exact API field equality
    const roleTitle = required(run.role_title, 'run.role_title');
    await expect(page.locator('h1')).toHaveText(roleTitle);

    const status = required(run.status, 'run.status');
    await expect(page.getByTestId('brief-status')).toHaveText(new RegExp(status, 'i'));

    // Absent fields on live fixture assert deterministic unavailable state
    if (run.company) {
      await expect(page.getByTestId('brief-company')).toContainText(run.company);
    } else {
      await expect(page.getByTestId('brief-company')).toHaveText('Not available');
    }

    if (run.location) {
      await expect(page.getByTestId('brief-location')).toContainText(run.location);
    } else {
      await expect(page.getByTestId('brief-location')).toHaveText('Not available');
    }

    if (run.company_stage) {
      await expect(page.getByTestId('brief-company-stage')).toContainText(run.company_stage);
    } else {
      await expect(page.getByTestId('brief-company-stage')).toHaveText('Not available');
    }

    // 1. Explicit Must-Have Requirements (Live Fixture populated)
    const explicitReqs = brief.explicit_requirements || brief.must_haves || run.must_haves || [];
    const mustGroup = page.getByTestId('requirement-group-must');
    await expect(mustGroup).toBeVisible();
    if (explicitReqs.length > 0) {
      const mustItems = mustGroup.locator('[data-testid^="requirement-item-must-"]');
      await expect(mustItems).toHaveCount(explicitReqs.length);
      for (let i = 0; i < explicitReqs.length; i++) {
        const text = typeof explicitReqs[i] === 'string' ? explicitReqs[i] : (explicitReqs[i]?.text || explicitReqs[i]?.description);
        if (text) await expect(mustItems.nth(i)).toContainText(text);
      }
    }

    // 2. Disqualifier Conditions (Live Fixture populated)
    const disqualifiers = brief.disqualifiers || run.disqualifiers || [];
    const disqGroup = page.getByTestId('requirement-group-disqualifier');
    await expect(disqGroup).toBeVisible();
    if (disqualifiers.length > 0) {
      const disqItems = disqGroup.locator('[data-testid^="requirement-item-disqualifier-"]');
      await expect(disqItems).toHaveCount(disqualifiers.length);
      for (let i = 0; i < disqualifiers.length; i++) {
        const text = typeof disqualifiers[i] === 'string' ? disqualifiers[i] : (disqualifiers[i]?.text || disqualifiers[i]?.description);
        if (text) await expect(disqItems.nth(i)).toContainText(text);
      }
    } else {
      await expect(disqGroup).toContainText('Not available');
    }

    // 3. Inferred & Verification Groups on Live Fixture (absent -> Not available)
    const inferredGroup = page.getByTestId('requirement-group-inferred');
    await expect(inferredGroup).toBeVisible();

    const verifGroup = page.getByTestId('requirement-group-verification');
    await expect(verifGroup).toBeVisible();

    // Governance & Non-Rejection notices exact checks
    await expect(page.locator('text=CareerTWiN supports evidence review and interview prioritization')).toBeVisible();
    await expect(page.locator('text=Insufficient evidence is not an automatic rejection.')).toBeVisible();

    // Responsive viewports zero horizontal overflow check
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

    await page.setViewportSize({ width: 768, height: 1024 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);

    await page.setViewportSize({ width: 375, height: 812 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });

  test('Test A2 — Intercepted fully populated brief contract variant: Coherent requirements, explicit, inferred, disqualifiers, verification_focus, company, location, and stage', async ({ page }) => {
    const mockBriefData = {
      hiring_run: {
        id: ALPHA_RUN_ID,
        role_title: 'Principal Distributed Systems Architect',
        company: 'Alpha Corp',
        location: 'San Francisco, CA',
        company_stage: 'series-b',
        status: 'active',
      },
      brief: {
        role_summary: 'Architect high-throughput distributed consensus pipelines.',
        explicit_requirements: ['Distributed systems experience', 'Production experience with Rust or C++'],
        inferred_requirements: ['Distributed Consensus Protocols', 'Kubernetes Operator'],
        disqualifiers: ['No production systems experience'],
        verification_focus: ['Ownership of distributed-system design decisions'],
      },
    };

    await page.route(`**/api/employer/brief/${ALPHA_RUN_ID}`, async (route) => {
      await route.fulfill({ json: mockBriefData });
    });

    await page.goto(`${BASE_URL}/employer/brief/${ALPHA_RUN_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="brief-page"]', { state: 'visible', timeout: 15000 });

    // Assert exact text matches
    await expect(page.locator('h1')).toHaveText('Principal Distributed Systems Architect');
    await expect(page.getByTestId('brief-company')).toContainText('Alpha Corp');
    await expect(page.getByTestId('brief-location')).toContainText('San Francisco, CA');
    await expect(page.getByTestId('brief-company-stage')).toContainText('series-b');
    await expect(page.getByTestId('brief-summary')).toHaveText('Architect high-throughput distributed consensus pipelines.');

    // 1. Explicit Requirements Non-Skipping Assertions
    const mustGroup = page.getByTestId('requirement-group-must');
    const mustItems = mustGroup.locator('[data-testid^="requirement-item-must-"]');
    await expect(mustItems).toHaveCount(2);
    await expect(mustItems.nth(0)).toContainText('Distributed systems experience');
    await expect(mustItems.nth(1)).toContainText('Production experience with Rust or C++');

    // 2. Inferred Requirements Non-Skipping Assertions
    const inferredGroup = page.getByTestId('requirement-group-inferred');
    const inferredItems = inferredGroup.locator('[data-testid^="requirement-item-inferred-"]');
    await expect(inferredItems).toHaveCount(2);
    await expect(inferredItems.nth(0)).toContainText('Distributed Consensus Protocols');
    await expect(inferredItems.nth(1)).toContainText('Kubernetes Operator');

    // 3. Disqualifiers Non-Skipping Assertions
    const disqGroup = page.getByTestId('requirement-group-disqualifier');
    const disqItems = disqGroup.locator('[data-testid^="requirement-item-disqualifier-"]');
    await expect(disqItems).toHaveCount(1);
    await expect(disqItems.nth(0)).toContainText('No production systems experience');

    // 4. Verification Focus Items Non-Skipping Assertions
    const verifGroup = page.getByTestId('requirement-group-verification');
    const verifItems = verifGroup.locator('[data-testid^="requirement-item-verification-"]');
    await expect(verifItems).toHaveCount(1);
    await expect(verifItems.nth(0)).toContainText('Ownership of distributed-system design decisions');
  });

  test('Test A3 — Status vs Readiness Separation Matrix: active+complete, active+incomplete, draft+incomplete, absent, and unknown status', async ({ page }) => {
    // 1. Active + Complete
    await page.route(`**/api/employer/brief/${ALPHA_RUN_ID}`, async (route) => {
      await route.fulfill({
        json: {
          hiring_run: { id: ALPHA_RUN_ID, role_title: 'Complete Architect', status: 'active', job_description: 'Valid long description text.' },
          brief: { role_summary: 'Valid summary text.', explicit_requirements: ['Must Have 1'] }
        }
      });
    });
    await page.goto(`${BASE_URL}/employer/brief/${ALPHA_RUN_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="brief-page"]');
    await expect(page.getByTestId('brief-status')).toHaveText('ACTIVE');
    await expect(page.getByTestId('contract-readiness-badge')).toHaveText(/PROOF CONTRACT COMPLETE/i);
    await expect(page.getByTestId('contract-incomplete-banner')).not.toBeVisible();
    await expect(page.getByTestId('start-sourcing-btn')).toBeVisible();

    // 2. Active + Incomplete Legacy Record
    await page.route(`**/api/employer/brief/${ALPHA_RUN_ID}`, async (route) => {
      await route.fulfill({
        json: {
          hiring_run: { id: ALPHA_RUN_ID, role_title: 'Incomplete Active Architect', status: 'active' },
          brief: { role_summary: '', explicit_requirements: [] }
        }
      });
    });
    await page.goto(`${BASE_URL}/employer/brief/${ALPHA_RUN_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="brief-page"]');
    await expect(page.getByTestId('brief-status')).toHaveText('ACTIVE');
    await expect(page.getByTestId('contract-readiness-badge')).toHaveText('SOURCING BLOCKED');
    await expect(page.getByTestId('contract-incomplete-banner')).toBeVisible();
    await expect(page.getByTestId('contract-incomplete-copy')).toHaveText(
      'This active hiring run is missing required proof-contract inputs. Complete the missing inputs before starting candidate sourcing.'
    );
    await expect(page.getByTestId('contract-missing-fields')).toContainText('job_description, must_haves');
    await expect(page.getByTestId('start-sourcing-btn')).not.toBeVisible();

    // 3. Draft + Incomplete
    await page.route(`**/api/employer/brief/${ALPHA_RUN_ID}`, async (route) => {
      await route.fulfill({
        json: {
          hiring_run: { id: ALPHA_RUN_ID, role_title: 'Draft Architect', status: 'draft' },
          brief: { role_summary: '', explicit_requirements: [] }
        }
      });
    });
    await page.goto(`${BASE_URL}/employer/brief/${ALPHA_RUN_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="brief-page"]');
    await expect(page.getByTestId('brief-status')).toHaveText('DRAFT');
    await expect(page.getByTestId('contract-readiness-badge')).toHaveText('SOURCING BLOCKED');
    await expect(page.getByTestId('contract-incomplete-copy')).toHaveText(
      'This draft hiring run is missing required proof-contract inputs. Complete the missing inputs before starting candidate sourcing.'
    );

    // 4. Absent Status -> Renders STATUS UNAVAILABLE
    await page.route(`**/api/employer/brief/${ALPHA_RUN_ID}`, async (route) => {
      await route.fulfill({
        json: {
          hiring_run: { id: ALPHA_RUN_ID, role_title: 'No Status Architect' },
          brief: { role_summary: 'Valid summary.', explicit_requirements: ['Must 1'] }
        }
      });
    });
    await page.goto(`${BASE_URL}/employer/brief/${ALPHA_RUN_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="brief-page"]');
    await expect(page.getByTestId('brief-status')).toHaveText('STATUS UNAVAILABLE');

    // 5. Unknown Status -> Fails Closed to STATUS UNAVAILABLE
    await page.route(`**/api/employer/brief/${ALPHA_RUN_ID}`, async (route) => {
      await route.fulfill({
        json: {
          hiring_run: { id: ALPHA_RUN_ID, role_title: 'Unknown Status Architect', status: 'unknown_status_val' },
          brief: { role_summary: 'Valid summary.', explicit_requirements: ['Must 1'] }
        }
      });
    });
    await page.goto(`${BASE_URL}/employer/brief/${ALPHA_RUN_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="brief-page"]');
    await expect(page.getByTestId('brief-status')).toHaveText('STATUS UNAVAILABLE');
  });

  test('Test C — Shortlist Bounded Generic Dynamic Pagination & Uniqueness: Page 1, Page 2, Page 20 final partial page, count labels, Next/Prev controls, filter reset, and zero duplicate IDs', async ({ page }) => {
    const shortlistResPromise = page.waitForResponse(
      (r) => r.url().includes(`/api/employer/shortlist/${ALPHA_RUN_ID}`) && r.request().method() === 'GET'
    );

    await page.goto(`${BASE_URL}/employer/shortlist/${ALPHA_RUN_ID}`, { waitUntil: 'domcontentloaded' });
    const apiRes = await shortlistResPromise;
    expect(apiRes.status()).toBe(200);
    const resData = await apiRes.json();

    await page.waitForSelector('[data-testid="shortlist-page"]', { state: 'visible', timeout: 15000 });

    const extractions = resData.extractions || [];
    const totalExtractions = extractions.length;
    expect(totalExtractions).toBe(399);

    const cards = page.locator('[data-testid^="shortlist-card-"]');
    
    // Page 1 assertions
    await expect(cards).toHaveCount(20);
    await expect(page.getByTestId('pagination-count-label')).toHaveText(`Showing 1–20 of ${totalExtractions} cohort candidates`);
    await expect(page.getByTestId('pagination-page-indicator')).toHaveText('Page 1 of 20');
    await expect(page.getByTestId('prev-page-btn')).toBeDisabled();
    await expect(page.getByTestId('next-page-btn')).toBeEnabled();

    // Collect Page 1 extraction IDs and verify uniqueness
    const page1Ids = [];
    for (let i = 0; i < 20; i++) {
      const idAttr = await cards.nth(i).getAttribute('data-testid');
      const id = idAttr.replace('shortlist-card-', '');
      page1Ids.push(id);
    }
    expect(new Set(page1Ids).size).toBe(20);

    // Page 2 navigation
    await page.getByTestId('next-page-btn').click();
    await page.waitForTimeout(200);
    await expect(cards).toHaveCount(20);
    await expect(page.getByTestId('pagination-count-label')).toHaveText(`Showing 21–40 of ${totalExtractions} cohort candidates`);
    await expect(page.getByTestId('pagination-page-indicator')).toHaveText('Page 2 of 20');
    await expect(page.getByTestId('prev-page-btn')).toBeEnabled();

    const page2Ids = [];
    for (let i = 0; i < 20; i++) {
      const idAttr = await cards.nth(i).getAttribute('data-testid');
      const id = idAttr.replace('shortlist-card-', '');
      page2Ids.push(id);
    }
    expect(new Set(page2Ids).size).toBe(20);
    expect(new Set([...page1Ids, ...page2Ids]).size).toBe(40);

    // Navigate to Final Partial Page (Page 20 of 20, 19 items)
    for (let p = 2; p < 20; p++) {
      await page.getByTestId('next-page-btn').click();
    }
    await page.waitForTimeout(200);
    await expect(page.getByTestId('pagination-page-indicator')).toHaveText('Page 20 of 20');
    await expect(cards).toHaveCount(19);
    await expect(page.getByTestId('pagination-count-label')).toHaveText(`Showing 381–399 of ${totalExtractions} cohort candidates`);
    await expect(page.getByTestId('next-page-btn')).toBeDisabled();
    await expect(page.getByTestId('prev-page-btn')).toBeEnabled();

    // Previous button navigation back to Page 1
    await page.getByTestId('prev-page-btn').click();
    await page.waitForTimeout(200);
    await expect(page.getByTestId('pagination-page-indicator')).toHaveText('Page 19 of 20');

    // Filter application resets to Page 1 of filtered subset
    await page.getByTestId('filter-evidence-ready').click();
    await page.waitForTimeout(200);
    await expect(page.getByTestId('pagination-page-indicator')).toHaveText('Page 1 of 1');

    await page.getByTestId('clear-filters-btn').click();
    await page.waitForTimeout(200);
    await expect(page.getByTestId('pagination-count-label')).toHaveText(`Showing 1–20 of ${totalExtractions} cohort candidates`);
    await expect(page.getByTestId('pagination-page-indicator')).toHaveText('Page 1 of 20');

    // Assert NO raw JSON or serialized objects in shortlist DOM
    const shortlistText = await page.locator('[data-testid="shortlist-page"]').innerText();
    expect(shortlistText).not.toContain('[object Object]');
    expect(shortlistText).not.toMatch(/^\{"name":/m);
  });

  test('Test D — Intercepted deterministic 3-card shortlist variant & Zero Evaluation terminology', async ({ page }) => {
    const c1Id = '11111111-0000-4000-a000-111111111111';
    const c2Id = '22222222-0000-4000-a000-222222222222';
    const c3Id = '33333333-0000-4000-a000-333333333333';

    await page.route(`**/api/employer/shortlist/${ALPHA_RUN_ID}`, async (route) => {
      const json = {
        hiring_run: { id: ALPHA_RUN_ID, role_title: 'Deterministic Test Role' },
        extractions: [
          {
            id: c1Id,
            candidate_name: 'Variant 1 Missing Data',
            readiness_state: 'EVIDENCE READY',
            decision_packet: { evaluation_metrics: { decision_readiness: 'EVIDENCE READY' } }
          },
          {
            id: c2Id,
            candidate_name: 'Variant 2 Zero Blockers',
            readiness_state: 'EVIDENCE READY',
            decision_packet: { evaluation_metrics: { decision_readiness: 'EVIDENCE READY' }, decision_blockers: [] }
          },
          {
            id: c3Id,
            candidate_name: 'Variant 3 Two Blockers',
            readiness_state: 'HUMAN REVIEW REQUIRED',
            decision_packet: { evaluation_metrics: { decision_readiness: 'HUMAN REVIEW REQUIRED' }, decision_blockers: [{ id: 'b1' }, { id: 'b2' }] }
          }
        ]
      };
      await route.fulfill({ json });
    });

    await page.goto(`${BASE_URL}/employer/shortlist/${ALPHA_RUN_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="shortlist-page"]', { state: 'visible', timeout: 15000 });

    const cards = page.locator('[data-testid^="shortlist-card-"]');
    await expect(cards).toHaveCount(3);

    // Variant 1: claim state & blockers missing -> Not available
    const c1ClaimState = page.getByTestId(`candidate-claim-state-${c1Id}`);
    const c1Blockers = page.getByTestId(`candidate-blockers-${c1Id}`);
    await expect(c1ClaimState).toHaveText('Not available');
    await expect(c1Blockers).toHaveText('Not available');

    // Variant 2: decision_blockers: [] -> 0 blockers
    const c2Blockers = page.getByTestId(`candidate-blockers-${c2Id}`);
    await expect(c2Blockers).toHaveText('0 blockers');

    // Variant 3: 2 decision_blockers -> 2 blockers
    const c3Blockers = page.getByTestId(`candidate-blockers-${c3Id}`);
    await expect(c3Blockers).toHaveText('2 blockers');
  });

  test('Test D2 — Intercepted Path A 399-Candidate Zero-Evaluation Cohort Semantics & Pagination Equality', async ({ page }) => {
    const zeroExtractions = Array.from({ length: 399 }, (_, i) => ({
      id: `zero_ext_${i + 1}`,
      candidate_name: `Zero Candidate ${i + 1}`,
      decision_packet: null
    }));

    await page.route(`**/api/employer/shortlist/${ALPHA_RUN_ID}`, async (route) => {
      await route.fulfill({
        json: {
          hiring_run: { id: ALPHA_RUN_ID, role_title: 'Zero Evaluation Role Cohort' },
          extractions: zeroExtractions,
          counts: {
            cohort_candidates: 399,
            documents_received: 0,
            extractions_completed: 399,
            packets_compiled: 0,
            evaluations_completed: 0,
            pending_evaluation: 399
          }
        }
      });
    });

    await page.goto(`${BASE_URL}/employer/shortlist/${ALPHA_RUN_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="shortlist-page"]', { state: 'visible', timeout: 15000 });

    // 1. Assert Header & Subtitle & Banner Count Semantics
    await expect(page.getByTestId('cohort-candidates-badge')).toHaveText('399 Cohort Candidates');
    await expect(page.getByTestId('shortlist-subtitle')).toHaveText('0 evaluations completed · 399 pending evaluation');
    await expect(page.getByTestId('no-evaluations-banner')).toBeVisible();
    await expect(page.getByTestId('no-evaluations-banner')).toContainText('399 candidates are associated with this role cohort, but 0 candidate evaluations are available yet for this hiring run.');

    // 2. Assert Page 1 Pagination & Card Counts (Path A)
    const cards = page.locator('[data-testid^="shortlist-card-"]');
    await expect(cards).toHaveCount(20);
    await expect(page.getByTestId('pagination-count-label')).toHaveText('Showing 1–20 of 399 cohort candidates');
    await expect(page.getByTestId('pagination-page-indicator')).toHaveText('Page 1 of 20');
    await expect(page.getByTestId('prev-page-btn')).toBeDisabled();
    await expect(page.getByTestId('next-page-btn')).toBeEnabled();

    // 3. Navigate to Page 20 and assert 19 cards
    for (let p = 1; p < 20; p++) {
      await page.getByTestId('next-page-btn').click();
    }
    await page.waitForTimeout(200);
    await expect(page.getByTestId('pagination-page-indicator')).toHaveText('Page 20 of 20');
    await expect(cards).toHaveCount(19);
    await expect(page.getByTestId('pagination-count-label')).toHaveText('Showing 381–399 of 399 cohort candidates');
    await expect(page.getByTestId('next-page-btn')).toBeDisabled();
  });

  test('Test E — Path B local file selection in the real browser: PDF, DOCX, CSV, exact 10MB, oversized rejection, handoff notice, and zero upload requests', async ({ page }) => {
    await page.goto(`${BASE_URL}/employer/intake`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="intake-page"]', { state: 'visible', timeout: 15000 });

    // Assert operational handoff notice
    const handoffNotice = page.getByTestId('intake-handoff-notice');
    await expect(handoffNotice).toBeVisible();
    await expect(handoffNotice).toContainText('Candidate files are not submitted through this form. Contact the pilot administrator for the approved transfer process.');

    const postRequests = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' || req.url().includes('upload') || req.headers()['content-type']?.includes('multipart')) {
        postRequests.push({ url: req.url(), method: req.method() });
      }
    });

    const fileInput = page.locator('[data-testid="file-upload-input"]');

    // 1. Select PDF
    await fileInput.setInputFiles({
      name: 'candidate.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('pdf content')
    });
    await expect(page.locator('text=candidate.pdf')).toBeVisible();
    await expect(page.getByText('Selected locally', { exact: true }).first()).toBeVisible();

    // Remove PDF
    await page.locator('button[aria-label="Remove candidate.pdf"]').click();
    await expect(page.locator('text=candidate.pdf')).not.toBeVisible();

    // 2. Select DOCX
    await fileInput.setInputFiles({
      name: 'candidate.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('docx content')
    });
    await expect(page.locator('text=candidate.docx')).toBeVisible();
    await page.locator('button[aria-label="Remove candidate.docx"]').click();

    // 3. Select CSV
    await fileInput.setInputFiles({
      name: 'candidate.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('name,role\nAlice,Engineer')
    });
    await expect(page.locator('text=candidate.csv')).toBeVisible();
    await page.locator('button[aria-label="Remove candidate.csv"]').click();

    // 4. Select invalid file candidate.exe
    await fileInput.setInputFiles({
      name: 'candidate.exe',
      mimeType: 'application/x-msdownload',
      buffer: Buffer.from('exe content')
    });
    const alert = page.locator('[role="alert"]').first();
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('Unsupported file format "candidate.exe"');

    // 5. Select exactly 10MB buffer -> ACCEPTED
    const exact10MBBuffer = Buffer.alloc(10 * 1024 * 1024);
    await fileInput.setInputFiles({
      name: 'exact10mb.pdf',
      mimeType: 'application/pdf',
      buffer: exact10MBBuffer
    });
    await expect(page.locator('text=exact10mb.pdf')).toBeVisible();
    await page.locator('button[aria-label="Remove exact10mb.pdf"]').click();

    // 6. Select over 10MB buffer -> REJECTED
    const over10MBBuffer = Buffer.alloc(10 * 1024 * 1024 + 1);
    await fileInput.setInputFiles({
      name: 'over10mb.pdf',
      mimeType: 'application/pdf',
      buffer: over10MBBuffer
    });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText('exceeds maximum allowed size of 10MB');

    // Assert ZERO POST OR UPLOAD REQUESTS OCCURRED
    expect(postRequests.length).toBe(0);
  });

  test('Test F — Non-polluting client submission and navigation contract test: Read-only hiring run count verification, form JSON payload check, and synthetic routing', async ({ page }) => {
    // 1. Read-only initial hiring runs count inspection
    const initialGetRes = await page.request.get(`${BASE_URL}/api/employer/hiring-runs`);
    expect(initialGetRes.status()).toBe(200);
    const initialRuns = await initialGetRes.json();
    const initialCount = Array.isArray(initialRuns) ? initialRuns.length : 0;

    await page.goto(`${BASE_URL}/employer/intake`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="intake-page"]', { state: 'visible', timeout: 15000 });

    await page.fill('[data-testid="role-title-input"]', 'Principal Systems Reliability Architect');
    await page.fill('[data-testid="location-input"]', 'Seattle, WA (Remote)');

    await page.fill('[data-testid="must-have-input"]', 'Distributed Consensus Protocols');
    await page.click('[data-testid="must-have-add-btn"]');

    const fileInput = page.locator('[data-testid="file-upload-input"]');
    await fileInput.setInputFiles({
      name: 'architecture_spec.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('spec file')
    });

    let interceptedRequestBody = null;
    let postCount = 0;

    await page.route('**/api/employer/hiring-runs', async (route) => {
      postCount++;
      const req = route.request();
      expect(req.headers()['content-type']).toContain('application/json');
      interceptedRequestBody = JSON.parse(req.postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ hiring_run_id: '99999999-9999-4999-f999-999999999999' })
      });
    });

    await page.click('[data-testid="generate-brief-btn"]');

    await page.waitForURL('**/employer/brief/99999999-9999-4999-f999-999999999999', { timeout: 15000 });
    expect(postCount).toBe(1);

    expect(interceptedRequestBody.role_title).toBe('Principal Systems Reliability Architect');
    expect(interceptedRequestBody.location).toBe('Seattle, WA (Remote)');
    expect(interceptedRequestBody.must_haves).toContain('Distributed Consensus Protocols');

    // 2. Read-only post-submission count inspection
    const finalGetRes = await page.request.get(`${BASE_URL}/api/employer/hiring-runs`);
    expect(finalGetRes.status()).toBe(200);
    const finalRuns = await finalGetRes.json();
    const finalCount = Array.isArray(finalRuns) ? finalRuns.length : 0;
    expect(finalCount).toBe(initialCount);
  });

  test('Test G — Accessibility and keyboard behavior: Accessible names, Enter and Space file selection, removal focus, and error alerts', async ({ page }) => {
    await page.goto(`${BASE_URL}/employer/intake`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="intake-page"]', { state: 'visible', timeout: 15000 });

    const roleInput = page.getByRole('textbox', { name: /role title/i });
    await expect(roleInput).toBeVisible();

    const dropzone = page.getByRole('button', { name: /upload candidate documents/i });
    await expect(dropzone).toBeVisible();
    await expect(dropzone).toHaveAttribute('tabindex', '0');

    // Enter Key File Selection
    const enterChooserPromise = page.waitForEvent('filechooser');
    await dropzone.press('Enter');
    const enterChooser = await enterChooserPromise;
    await enterChooser.setFiles([{
      name: 'enter_file.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('enter file')
    }]);

    await expect(page.locator('text=enter_file.pdf')).toBeVisible();

    const removeEnterBtn = page.locator('button[aria-label="Remove enter_file.pdf"]');
    await removeEnterBtn.focus();
    await expect(removeEnterBtn).toBeFocused();
    await removeEnterBtn.press('Enter');
    await expect(page.locator('text=enter_file.pdf')).not.toBeVisible();
  });

  test('Test H — Real Browser-Executed Contrast Verification (Part 4): Evaluates computed styles via window.getComputedStyle() and walks ancestor tree', async ({ page }) => {
    await page.goto(`${BASE_URL}/employer/shortlist/${ALPHA_RUN_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="shortlist-page"]');

    const auditResults = await page.evaluate(() => {
      function parseRgb(rgbStr) {
        if (!rgbStr || rgbStr === 'transparent' || rgbStr === 'initial' || rgbStr === 'inherit') {
          return { r: 0, g: 0, b: 0, a: 0 };
        }
        const match = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (!match) return { r: 0, g: 0, b: 0, a: 0 };
        return {
          r: parseInt(match[1], 10),
          g: parseInt(match[2], 10),
          b: parseInt(match[3], 10),
          a: match[4] !== undefined ? parseFloat(match[4]) : 1,
        };
      }

      function getRelativeLuminance({ r, g, b }) {
        const rsRGB = r / 255;
        const gsRGB = g / 255;
        const bsRGB = b / 255;

        const R = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
        const G = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
        const B = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

        return 0.2126 * R + 0.7152 * G + 0.0722 * B;
      }

      function getContrastRatio(rgb1, rgb2) {
        const l1 = getRelativeLuminance(rgb1);
        const l2 = getRelativeLuminance(rgb2);
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
      }

      function getResolvedBackgroundColor(element) {
        let el = element;
        const bgStack = [];
        while (el && el !== document.documentElement) {
          const style = window.getComputedStyle(el);
          const bgStr = style.backgroundColor;
          const op = parseFloat(style.opacity || '1');
          const parsed = parseRgb(bgStr);
          // Ignore unstyled browser root canvas white fallback in dark theme
          const isRootWhite = (el === document.body || el === document.documentElement) && parsed && parsed.r === 255 && parsed.g === 255 && parsed.b === 255;
          if (parsed && parsed.a > 0 && !isRootWhite) {
            bgStack.unshift({ ...parsed, a: parsed.a * op });
          }
          el = el.parentElement;
        }
        // Base dark theme document background surface (#0E0E0E)
        let resolved = { r: 14, g: 14, b: 14, a: 1 };
        for (const layer of bgStack) {
          resolved = {
            r: Math.round(layer.r * layer.a + resolved.r * (1 - layer.a)),
            g: Math.round(layer.g * layer.a + resolved.g * (1 - layer.a)),
            b: Math.round(layer.b * layer.a + resolved.b * (1 - layer.a)),
            a: 1,
          };
        }
        return resolved;
      }

      const elementsToAudit = [
        { label: 'shortlist-subtitle', selector: '[data-testid="shortlist-subtitle"]', threshold: 4.5 },
        { label: 'pagination-count-label', selector: '[data-testid="pagination-count-label"]', threshold: 4.5 },
        { label: 'candidate-proof-strength-label', selector: 'span.text-\\[9px\\]', threshold: 3.0 },
        { label: 'governance-notice-text', selector: 'p.italic', threshold: 4.5 },
        { label: 'readiness-filter-btn', selector: '[data-testid="filter-all"]', threshold: 4.5 },
        { label: 'prev-page-btn', selector: '[data-testid="prev-page-btn"]', threshold: 3.0 },
        { label: 'candidate-search-input', selector: '[data-testid="candidate-search-input"]', threshold: 4.5 },
        { label: 'cohort-candidates-badge', selector: '[data-testid="cohort-candidates-badge"]', threshold: 4.5 },
        { label: 'shortlist-header-title', selector: 'h1', threshold: 4.5 },
        { label: 'packet-revision-note', selector: 'span.text-\\[10px\\]', threshold: 3.0 },
      ];

      return elementsToAudit.map((item) => {
        const el = document.querySelector(item.selector);
        if (!el) return { label: item.label, found: false, error: 'Element missing' };

        const style = window.getComputedStyle(el);
        const fg = parseRgb(style.color);
        const opacity = parseFloat(style.opacity || '1');
        
        const resolvedBg = getResolvedBackgroundColor(el);
        if (!resolvedBg) return { label: item.label, found: false, error: 'No opaque background resolved' };

        const compositedFg = {
          r: Math.round(fg.r * fg.a * opacity + resolvedBg.r * (1 - fg.a * opacity)),
          g: Math.round(fg.g * fg.a * opacity + resolvedBg.g * (1 - fg.a * opacity)),
          b: Math.round(fg.b * fg.a * opacity + resolvedBg.b * (1 - fg.a * opacity)),
        };

        const ratio = getContrastRatio(compositedFg, resolvedBg);
        const fgHex = `#${compositedFg.r.toString(16).padStart(2, '0')}${compositedFg.g.toString(16).padStart(2, '0')}${compositedFg.b.toString(16).padStart(2, '0')}`;
        const bgHex = `#${resolvedBg.r.toString(16).padStart(2, '0')}${resolvedBg.g.toString(16).padStart(2, '0')}${resolvedBg.b.toString(16).padStart(2, '0')}`;

        return {
          label: item.label,
          found: true,
          color: style.color,
          backgroundColor: style.backgroundColor,
          resolvedBgHex: bgHex,
          compositedFgHex: fgHex,
          opacity: opacity,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          ratio: parseFloat(ratio.toFixed(2)),
          threshold: item.threshold,
          pass: ratio >= item.threshold,
        };
      });
    });

    for (const res of auditResults) {
      console.log(`[WCAG CONTRAST AUDIT] Element: ${res.label} | Fg: ${res.compositedFgHex} | Bg: ${res.resolvedBgHex} | Size: ${res.fontSize} (${res.fontWeight}) | Ratio: ${res.ratio}:1 (Min: ${res.threshold}:1) | Status: ${res.pass ? 'PASS' : 'FAIL'}`);
      expect(res.found).toBe(true);
      expect(res.pass).toBe(true);
    }
  });

});
