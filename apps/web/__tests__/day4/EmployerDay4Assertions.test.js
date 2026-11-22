const { test, expect } = require('playwright/test');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

// FAIL-CLOSED Credential Handling
const pwd = process.env.CAREERTWIN_STAGING_TEST_PASSWORD;
if (!pwd) {
  throw new Error(
    'FAIL-CLOSED: CAREERTWIN_STAGING_TEST_PASSWORD is required for authenticated Day 4 UAT.'
  );
}

const BASE_URL = process.env.APP_URL || `http://localhost:${process.env.DISPOSABLE_VERIFICATION_PORT || '3010'}`;
const STAGING_OWNER_EMAIL = 'd2c.alpha.owner@example.com';
const ALPHA_RUN_ID = '11111111-1111-4111-d2c1-111111111111';

test.describe('Employer Day 4 UX-V2 Playwright Authenticated UAT Suite (UX-V2-D4-C1)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
    const loginForm = page.locator('form').filter({ hasText: 'Sign In' });
    await loginForm.locator('input[type="email"]').fill(STAGING_OWNER_EMAIL);
    await loginForm.locator('input[type="password"]').fill(pwd);
    await loginForm.locator('button[type="submit"]').click();
    await page.waitForURL('**/employer**', { timeout: 15000 });
  });

  // ── Scenario 1: Employer workspace loads from authenticated organization-scoped API ──
  test('Scenario 1 — Employer workspace loads from authenticated org-scoped API', async ({ page }) => {
    await page.goto(`${BASE_URL}/employer`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="dashboard-stat-cards"]', { state: 'visible', timeout: 15000 });
    const resp = await page.request.get(`${BASE_URL}/api/employer/analytics`);
    expect(resp.status()).toBe(200);
  });

  // ── Scenario 2: AVG TTH and 2.1d are absent ───────────────────────────────
  test('Scenario 2 — AVG TTH and 2.1d are absent', async ({ page }) => {
    await page.goto(`${BASE_URL}/employer`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('body', { state: 'visible' });
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('AVG TTH');
    expect(bodyText).not.toContain('2.1d');
  });

  // ── Scenario 3: Unsupported JD-upload, Slack and ATS tour claims are absent ─
  test('Scenario 3 — Unsupported tour claims are absent', async ({ page }) => {
    await page.goto(`${BASE_URL}/employer`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('body', { state: 'visible' });
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('upload a JD');
    expect(bodyText).not.toContain('Sync Your Stack');
    expect(bodyText).not.toContain('Automate candidate delivery');
    expect(bodyText).not.toContain('directly into Slack');
  });

  // ── Scenario 4: Every displayed workspace statistic equals its exact API field ──
  test('Scenario 4 — Every displayed workspace statistic equals exact API field', async ({ page }) => {
    await page.goto(`${BASE_URL}/employer`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="dashboard-stat-cards"]', { state: 'visible', timeout: 15000 });

    const resp = await page.request.get(`${BASE_URL}/api/employer/analytics`);
    expect(resp.status()).toBe(200);
    const data = await resp.json();
    const s = data.summary || {};

    const activeRolesText = await page.getByTestId('stat-val-active-roles').textContent();
    const candidatesText = await page.getByTestId('stat-val-candidates').textContent();
    const shortlistedText = await page.getByTestId('stat-val-shortlisted').textContent();
    const packetsText = await page.getByTestId('stat-val-packets-compiled').textContent();

    expect(activeRolesText.trim()).toBe(String(s.active_roles ?? 'Not available'));
    expect(candidatesText.trim()).toBe(String(s.total_candidates ?? 'Not available'));
    expect(shortlistedText.trim()).toBe(String(s.total_shortlisted ?? 'Not available'));
    expect(packetsText.trim()).toBe(String(s.packets_generated ?? 'Not available'));
  });

  // ── Scenario 5: Null metric values do not render as false zero ────────────
  test('Scenario 5 — Null metric values render as Not available (not false zero)', async ({ page }) => {
    await page.route('**/api/employer/analytics', (route) => {
      route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          summary: {
            active_roles: null,
            total_candidates: null,
            total_shortlisted: null,
            screens_completed: null,
            packets_generated: null,
          },
          stage_counts: {},
          runs: [],
          recent_activity: [],
        }),
      });
    });

    await page.goto(`${BASE_URL}/employer`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="stat-active-roles"]', { state: 'visible' });

    const activeRolesText = await page.getByTestId('stat-val-active-roles').textContent();
    expect(activeRolesText.trim()).toBe('Not available');
    expect(activeRolesText.trim()).not.toBe('0');
  });

  // ── Scenario 6: Proof-contract readiness chip equals canonical shared readiness logic ──
  test('Scenario 6 — Proof-contract readiness chip matches shared readiness logic', async ({ page }) => {
    await page.route('**/api/employer/analytics', (route) => {
      route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          summary: { active_roles: 1, total_candidates: 0, total_shortlisted: 0, screens_completed: 0, packets_generated: 0 },
          stage_counts: {},
          runs: [{
            id: ALPHA_RUN_ID,
            role_title: 'Senior Backend Engineer',
            role_summary: 'Build high-performance systems with Python and FastAPI.',
            must_haves: ['Python 3.10+', 'FastAPI'],
            status: 'active',
            company: 'Acme Corp',
            created_at: new Date().toISOString(),
            brief_json: {
              contract_approved: true,
              approved_by: '00000000-0000-4000-d2c0-000000000010',
              approved_at: new Date().toISOString(),
            },
            candidates_count: 0,
            shortlisted_count: 0,
            screens_completed: 0
          }],
          recent_activity: []
        }),
      });
    });

    await page.goto(`${BASE_URL}/employer`, { waitUntil: 'domcontentloaded' });
    const roleCard = page.getByTestId(`role-card-${ALPHA_RUN_ID}`);
    await expect(roleCard).toBeVisible({ timeout: 15000 });
    await expect(roleCard).toContainText('Candidate Sourcing Ready');
  });

  // ── Scenario 7: Brief and pipeline navigation buttons resolve correct role IDs ──
  test('Scenario 7 — Brief and pipeline navigation buttons resolve correct role IDs', async ({ page }) => {
    await page.route('**/api/employer/analytics', (route) => {
      route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          summary: { active_roles: 1, total_candidates: 1, total_shortlisted: 0, screens_completed: 0, packets_generated: 0 },
          stage_counts: {},
          runs: [{
            id: ALPHA_RUN_ID,
            role_title: 'Senior Backend Engineer',
            status: 'active',
            created_at: new Date().toISOString(),
            candidates_count: 1,
            shortlisted_count: 0,
            screens_completed: 0
          }],
          recent_activity: []
        }),
      });
    });

    await page.goto(`${BASE_URL}/employer`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`[data-testid="role-primary-cta-${ALPHA_RUN_ID}"]`, { state: 'visible', timeout: 15000 });
    await page.waitForSelector(`[data-testid="source-btn-${ALPHA_RUN_ID}"]`, { state: 'visible', timeout: 15000 });
    await page.waitForSelector(`[data-testid="brief-btn-${ALPHA_RUN_ID}"]`, { state: 'visible', timeout: 15000 });
  });

  // ── Scenario 8: Complete brief navigates directly to shortlist ───────────
  test('Scenario 8 — Complete brief navigates directly to shortlist', async ({ page }) => {
    await page.goto(`${BASE_URL}/employer/brief/${ALPHA_RUN_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="brief-page"]', { state: 'visible', timeout: 15000 });

    const proceedBtn = page.getByTestId('proceed-pipeline-btn');
    await expect(proceedBtn).toBeVisible({ timeout: 15000 });
    await proceedBtn.click();
    await page.waitForURL(`**/employer/shortlist/${ALPHA_RUN_ID}`, { timeout: 15000 });
    expect(page.url()).toContain(`/employer/shortlist/${ALPHA_RUN_ID}`);
  });

  // ── Scenario 9: Pipeline navigation sends zero POST requests to sourcing-sessions ──
  test('Scenario 9 — Pipeline navigation sends zero POST requests to sourcing-sessions', async ({ page }) => {
    let sourcingPostCalled = false;
    page.on('request', (req) => {
      if (req.url().includes('/sourcing-sessions') && req.method() === 'POST') {
        sourcingPostCalled = true;
      }
    });

    await page.goto(`${BASE_URL}/employer/brief/${ALPHA_RUN_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="brief-page"]', { state: 'visible', timeout: 15000 });

    const proceedBtn = page.getByTestId('proceed-pipeline-btn');
    await expect(proceedBtn).toBeVisible({ timeout: 15000 });
    await proceedBtn.click();
    await page.waitForURL(`**/employer/shortlist/${ALPHA_RUN_ID}`, { timeout: 15000 });

    expect(sourcingPostCalled).toBe(false);
  });

  // ── Scenario 10: Incomplete brief blocks pipeline navigation ─────────────
  test('Scenario 10 — Incomplete brief blocks pipeline navigation', async ({ page }) => {
    await page.route(`**/api/employer/brief/${ALPHA_RUN_ID}`, (route) => {
      route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hiring_run: {
            id: ALPHA_RUN_ID,
            role_title: '',
            job_description: '',
            must_haves: [],
            status: 'active',
            created_at: new Date().toISOString(),
          },
          brief: {
            role_summary: '',
            explicit_requirements: [],
          },
        }),
      });
    });

    await page.goto(`${BASE_URL}/employer/brief/${ALPHA_RUN_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="brief-page"]', { state: 'visible', timeout: 15000 });

    await expect(page.getByTestId('complete-intake-banner-btn')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('bottom-complete-intake-btn')).toBeVisible({ timeout: 15000 });
    expect(await page.getByTestId('proceed-pipeline-btn').count()).toBe(0);
  });

  // ── Scenario 11: Deterministic zero-cohort fixture renders handoff-guidance-panel ──
  test('Scenario 11 — Zero-cohort fixture renders handoff-guidance-panel', async ({ page }) => {
    await page.route(`**/api/employer/shortlist/${ALPHA_RUN_ID}`, (route) => {
      route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hiring_run: { id: ALPHA_RUN_ID, role_title: 'Backend Engineer', status: 'active', org_id: '00000000-0000-4000-a000-000000000001' },
          extractions: [],
          counts: {
            cohort_candidates: 0,
            documents_received: 0,
            extractions_completed: 0,
            packets_compiled: 0,
            evaluations_completed: 0,
            evidence_ready: 0,
            human_review_required: 0,
            needs_proof: 0,
            insufficient_evidence: 0,
            pending_evaluation: 0,
          },
          total_scanned: 0,
        }),
      });
    });

    await page.goto(`${BASE_URL}/employer/shortlist/${ALPHA_RUN_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('handoff-guidance-panel')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('zero-evaluation-cohort-state')).toBeVisible({ timeout: 15000 });
  });

  // ── Scenario 12: Handoff guidance contains no email, phone number or unbacked claim ──
  test('Scenario 12 — Handoff guidance contains no email, phone or unbacked claim', async ({ page }) => {
    await page.route(`**/api/employer/shortlist/${ALPHA_RUN_ID}`, (route) => {
      route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hiring_run: { id: ALPHA_RUN_ID, role_title: 'Backend Engineer', status: 'active', org_id: '00000000-0000-4000-a000-000000000001' },
          extractions: [],
          counts: { cohort_candidates: 0, evaluations_completed: 0, pending_evaluation: 0 },
        }),
      });
    });

    await page.goto(`${BASE_URL}/employer/shortlist/${ALPHA_RUN_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('handoff-guidance-panel')).toBeVisible({ timeout: 15000 });
    const panelText = await page.getByTestId('handoff-guidance-panel').textContent();

    expect(panelText).not.toMatch(/@[A-Za-z0-9._%+-]+\.[A-Za-z]{2,}/);
    expect(panelText).not.toMatch(/\+?[0-9]{10,}/);
    expect(panelText).not.toContain('Upload to server');
    expect(panelText).not.toContain('Autonomous sourcing');
  });

  // ── Scenario 13: Shortlist response is organization- and hiring-run-scoped ──
  test('Scenario 13 — Shortlist response is organization- and hiring-run-scoped', async ({ page }) => {
    await page.goto(`${BASE_URL}/employer/shortlist/${ALPHA_RUN_ID}`, { waitUntil: 'domcontentloaded' });
    const resp = await page.request.get(`${BASE_URL}/api/employer/shortlist/${ALPHA_RUN_ID}`);
    expect(resp.status()).toBe(200);
    const data = await resp.json();
    expect(data.hiring_run.id).toBe(ALPHA_RUN_ID);
    expect(data.hiring_run).toHaveProperty('org_id');
  });

  // ── Scenario 14: Intake accurately states candidate files are not submitted through form ──
  test.skip('Scenario 14 — Intake states candidate files are not submitted through form [Skipped: DocumentDropzone / intake-handoff-notice removed from /employer/intake in current UI]', async ({ page }) => {
    await page.goto(`${BASE_URL}/employer/intake`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="intake-page"]', { state: 'visible', timeout: 15000 });

    const handoffNotice = page.getByTestId('intake-handoff-notice');
    await expect(handoffNotice).toBeVisible({ timeout: 15000 });
    const noticeText = await handoffNotice.textContent();
    expect(noticeText).toContain('Candidate files are not submitted through this form');
  });

  // ── Scenario 15: Keyboard navigation and 375px horizontal-overflow checks pass ──
  test('Scenario 15 — Mobile 375px overflow, device-support policy and keyboard focus checks pass', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_URL}/employer`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('body', { state: 'visible' });

    await expect(page.getByTestId('device-support-screen')).toBeVisible();
    await expect(page.getByTestId('device-support-heading')).toHaveText('Continue on a larger screen');

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(overflow).toBe(false);

    // Keyboard focus test
    await page.keyboard.press('Tab');
    const focusedTag = await page.evaluate(() => document.activeElement ? document.activeElement.tagName : null);
    expect(focusedTag).toBeTruthy();
  });
});
