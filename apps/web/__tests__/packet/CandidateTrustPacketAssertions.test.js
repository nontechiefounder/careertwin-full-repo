/**
 * UX-V2-D1-C6 Accessibility & Final Non-Self-Fulfilling Assertion Suite
 * Strict dynamic API-to-UI verification with mustGet helper,
 * browser-context-associated API requests, strict data-claim-id selectors (no fallbacks),
 * exact Evidence Drawer & Audit Drawer metadata assertions, and pure product-controlled focus restoration.
 */

const { test, expect } = require('playwright/test');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const pwd = process.env.CAREERTWIN_STAGING_TEST_PASSWORD;
if (!pwd) {
  throw new Error('FAIL-CLOSED ERROR: Mandatory environment variable CAREERTWIN_STAGING_TEST_PASSWORD is missing.');
}

const BASE_URL = process.env.APP_URL || `http://localhost:${process.env.DISPOSABLE_VERIFICATION_PORT || '3010'}`;
const artifactsDir = process.env.ARTIFACTS_DIR || path.join(__dirname, '../../test-artifacts');

// Strict helper function: Throws immediately when mandatory API field is absent
function mustGet(obj, pathStr, description) {
  const parts = pathStr.split('.');
  let current = obj;
  for (const p of parts) {
    if (current == null || typeof current !== 'object') {
      throw new Error(`[FAIL] Mandatory field "${pathStr}" (${description}) is missing in API payload.`);
    }
    current = current[p];
  }
  if (current == null) {
    throw new Error(`[FAIL] Mandatory field "${pathStr}" (${description}) is null or undefined in API payload.`);
  }
  return current;
}

// Disposable stack seeded unassessed extraction ID (preserve unassessed DB state)
const DISPOSABLE_EXTRACTION_ID = 'b3735538-0b96-4c7b-a484-be6c107d38d5';

test.describe('Candidate Trust Packet UX-V2-D1-C6 Assertion Suite', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"]', 'd2c.alpha.owner@example.com');
    await page.fill('input[type="password"]', pwd);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname !== '/auth', { timeout: 20000 });
  });

  test('Live disposable unassessed candidate renders truthful pre-evaluation state without fabricated outputs', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const apiRes = await page.request.get(`${BASE_URL}/api/employer/packets/${DISPOSABLE_EXTRACTION_ID}`);
    expect(apiRes.status()).toBe(200);

    const apiData = await apiRes.json();
    expect(apiData.packet).toBeNull();

    const extraction = mustGet(apiData, 'extraction', 'Candidate extraction record');
    const hiringRun = mustGet(apiData, 'hiring_run', 'Hiring run record');
    const expectedName = mustGet(extraction, 'candidate_name', 'Candidate name');
    const expectedRole = mustGet(hiringRun, 'role_title', 'Role title');

    await page.goto(`${BASE_URL}/employer/packet/${DISPOSABLE_EXTRACTION_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('main').getByText('EVALUATION_NOT_STARTED', { exact: true })).toBeVisible({ timeout: 30000 });

    await expect(page.locator('h1').first()).toHaveText(expectedName);
    await expect(page.getByText(`Review: ${expectedName}`)).toBeVisible();
    await expect(page.getByRole('button', { name: /Generate Decision Packet/i })).toBeVisible();
    await expect(page.getByText('Rubric Alignment', { exact: true })).toBeVisible();
    await expect(page.getByText(`Target Role: ${expectedRole}`)).toBeVisible();
    await expect(page.locator('section[aria-label="Human Decision Rail"]')).toBeVisible();
    await expect(page.getByTestId('human-decision-status-banner')).toHaveCount(0);

    await expect(page.locator('body')).not.toContainText('Universal Fit Score');
    await expect(page.locator('body')).not.toContainText('STRONG YES');
    await expect(page.locator('text=/^Fit:\\s*\\d+%/')).toHaveCount(0);
    await expect(page.locator('section[aria-label="Claim-to-Proof Ledger"]')).toHaveCount(0);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('Intercepted evaluated packet verifies ClaimLedger provenance, EvidenceDrawer hashes, Escape focus restore, and governance notice', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const liveRes = await page.request.get(`${BASE_URL}/api/employer/packets/${DISPOSABLE_EXTRACTION_ID}`);
    expect(liveRes.status()).toBe(200);
    const liveData = await liveRes.json();

    const syntheticEvaluatedPacket = {
      ledger_id: '00000000-0000-4000-e000-000000000101',
      ledger_revision: 1,
      decision_readiness: 'READY_FOR_SCREEN',
      evaluation_metrics: {
        decision_readiness: 'READY_FOR_SCREEN',
        role_fit_label: 'STRONG_SIGNAL',
        proof_strength: 0.86,
        proof_coverage: 0.75,
        uncertainty: 0.14,
      },
      evidence_refs: [
        {
          id: 'ev_1',
          document_id: 'doc_test_1',
          filename: 'candidate_cv.pdf',
          mime_type: 'application/pdf',
          excerpt: 'Led Rust compiler runtime optimization across 4 production services.',
          excerpt_hash: 'sha256:excerpt_0001',
          file_sha256: 'sha256:file_0001',
          normalized_text_sha256: 'sha256:norm_0001',
          locator: { page: 1, paragraph_id: 2 },
          source_offset: { start_offset: 10, end_offset: 76 },
          parser_name: 'pdf-parse@v1',
        },
      ],
      claim_ledger: [
        {
          id: 'claim_1',
          claim_text: 'Built production Rust runtime systems.',
          status: 'SUPPORTED',
          evidence_id: 'ev_1',
          requirement_title: 'Systems Engineering',
        },
        {
          id: 'claim_2',
          claim_text: 'On-call incident lead claim lacks source span.',
          status: 'UNCERTAIN',
          requirement_title: 'Operational Ownership',
        },
      ],
    };

    await page.route(`**/api/employer/packets/${DISPOSABLE_EXTRACTION_ID}*`, async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...liveData,
          packet: syntheticEvaluatedPacket,
        }),
      });
    });

    await page.goto(`${BASE_URL}/employer/packet/${DISPOSABLE_EXTRACTION_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1', { state: 'visible', timeout: 30000 });

    await expect(page.getByRole('main').getByText('READY_FOR_SCREEN', { exact: true })).toBeVisible();

    const ledgerSection = page.locator('section[aria-label="Claim-to-Proof Ledger"]');
    await expect(ledgerSection).toBeVisible();

    // Linked claim + EvidenceDrawer provenance inspection + Escape focus restore
    const linkedClaim = page.locator('[data-claim-id="claim_1"]').first();
    await expect(linkedClaim).toBeVisible();
    await expect(linkedClaim).toContainText('SUPPORTED');

    const citationBtn = linkedClaim.locator('button[aria-label*="citation"]').first();
    await expect(citationBtn).toBeVisible();
    await citationBtn.focus();
    await citationBtn.click();

    const evidenceDrawer = page.getByTestId('evidence-drawer');
    await expect(evidenceDrawer).toBeVisible();
    await expect(evidenceDrawer).toContainText('candidate_cv.pdf');
    await expect(evidenceDrawer).toContainText('application/pdf');
    await expect(evidenceDrawer).toContainText('Led Rust compiler runtime optimization across 4 production services.');
    await expect(evidenceDrawer.getByTestId('citation-excerpt-hash')).toContainText('sha256:excerpt_0001');
    await expect(evidenceDrawer.getByTestId('citation-doc-id')).toContainText('Doc ID: doc_test_1');
    await expect(evidenceDrawer.getByTestId('citation-locator')).toContainText('Page 1');
    await expect(evidenceDrawer.getByTestId('citation-offsets')).toContainText('[10 - 76]');
    await expect(evidenceDrawer.getByTestId('citation-file-hash')).toContainText('Physical File Hash: sha256:file_0001');
    await expect(evidenceDrawer.getByTestId('citation-norm-text-hash')).toContainText('Normalized Text SHA-256: sha256:norm_0001');

    await page.keyboard.press('Escape');
    await expect(evidenceDrawer).not.toBeVisible();
    await expect.poll(async () =>
      citationBtn.evaluate((el) => document.activeElement === el)
    ).toBe(true);

    // Unlinked claim strict check
    const unlinkedClaim = page.locator('[data-claim-id="claim_2"]').first();
    await expect(unlinkedClaim).toBeVisible();
    await expect(unlinkedClaim).toContainText('No attributable EvidenceRef supplied');
    await expect(unlinkedClaim.locator('button[aria-label*="citation"]')).toHaveCount(0);

    // Governance notice
    const govNotice = page.locator('p:has-text("supports evidence review")').first();
    await expect(govNotice).toBeVisible();

    // 375px horizontal overflow check
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });
});
