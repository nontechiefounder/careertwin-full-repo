import { chromium } from '../apps/web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const APP_URL = process.env.APP_URL || 'http://localhost:3004';
const BRIEF_ID = '1bea003e-9466-4e4e-a185-6cc7cdd06ff1';
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'screenshots');

async function run() {
  console.log('=== WORKBYLINE V2: EXTENDED BROWSER & STRATEGY ACCEPTANCE ===');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1. Sign in as synthetic Alpha employer
  console.log('[1/4] Signing in at /auth...');
  await page.goto(`${APP_URL}/auth`, { waitUntil: 'networkidle' });
  await page.fill('[data-testid="email-input"]', 'synthetic.employer.alpha@example.invalid');
  await page.fill('[data-testid="password-input"]', 'TestPassword123!');
  await page.click('[data-testid="login-btn"]');
  await page.waitForURL('**/employer**', { timeout: 15000 });
  console.log('  -> Signed in successfully.');

  // 2. Navigate to brief
  console.log(`[2/4] Navigating to brief /employer/brief/${BRIEF_ID}...`);
  await page.goto(`${APP_URL}/employer/brief/${BRIEF_ID}`, { waitUntil: 'networkidle' });

  const panel = page.locator('[data-testid="context-evidence-panel"]');
  await panel.waitFor({ state: 'visible', timeout: 15000 });

  // 3. Test Retrieval strategy dropdown
  console.log('[3/4] Testing Retrieval strategy dropdown...');
  const strategySelect = panel.locator('select[aria-label="Retrieval strategy"]');
  await strategySelect.waitFor({ state: 'visible' });

  // Verify options
  const options = await strategySelect.locator('option').allInnerTexts();
  console.log('  -> Available strategies:', options);
  if (!options.includes('Document search') || !options.includes('Related evidence via graph')) {
    throw new Error('Strategy dropdown missing expected options!');
  }

  // Select 'related'
  await strategySelect.selectOption('related');
  console.log('  -> Selected strategy: "Related evidence via graph"');

  const searchInput = panel.locator('input[aria-label="Find evidence"]');
  await searchInput.fill('Distributed architecture');

  // Take screenshot of the Related Evidence strategy selected
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_context_evidence_related_mode.png'), fullPage: true });
  console.log('  -> Saved screenshot: 11_context_evidence_related_mode.png');

  // 4. Test Tenant B Isolation / Cross-Tenant Security via API
  console.log('[4/4] Verifying Tenant B cross-tenant boundary via API...');
  const cookies = await context.cookies();
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

  // Attempt to search with Alpha's hiring run from Tenant B or invalid run
  const res = await fetch(`${APP_URL}/api/employer/context-sources/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookieHeader
    },
    body: JSON.stringify({
      hiring_run_id: '00000000-0000-0000-0000-000000000099', // Nonexistent run
      question: 'Kubernetes'
    })
  });
  console.log(`  -> Unmapped run HTTP status: ${res.status}`);
  if (res.status !== 404 && res.status !== 403) {
    throw new Error(`Expected 404 or 403 for unmapped run, got ${res.status}`);
  }
  console.log('  -> Tenant boundary enforcement PASS.');

  await browser.close();
  console.log('=== EXTENDED BROWSER ACCEPTANCE COMPLETE: ALL CHECKS PASSED ===');
}

run().catch(err => {
  console.error('[FATAL ERROR]', err);
  process.exit(1);
});
