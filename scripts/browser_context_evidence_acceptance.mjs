import { chromium } from '../apps/web/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const APP_URL = process.env.APP_URL || 'http://localhost:3004';
const BRIEF_ID = '1bea003e-9466-4e4e-a185-6cc7cdd06ff1';
const SCREENSHOT_DIR = path.resolve(process.cwd(), 'screenshots');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function run() {
  console.log('=== WORKBYLINE V2: PLAYWRIGHT BROWSER ACCEPTANCE JOURNEY ===');
  console.log('Target URL:', APP_URL);
  console.log('Target Role Brief ID:', BRIEF_ID);

  // 1. Launch Chromium Browser
  console.log('\n[1/6] Launching Chromium browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 2. Authenticate through the application login form
  console.log('\n[2/6] Performing authentic browser sign-in at /auth...');
  await page.goto(`${APP_URL}/auth`, { waitUntil: 'networkidle' });
  await page.fill('[data-testid="email-input"]', 'synthetic.employer.alpha@example.invalid');
  await page.fill('[data-testid="password-input"]', 'TestPassword123!');
  await page.click('[data-testid="login-btn"]');
  await page.waitForURL('**/employer**', { timeout: 15000 });
  console.log('  -> Signed in successfully as Alpha Employer through UI.');

  // 3. Navigate to Role Brief and Verify Context Evidence Panel
  console.log(`\n[3/6] Navigating to /employer/brief/${BRIEF_ID}...`);
  await page.goto(`${APP_URL}/employer/brief/${BRIEF_ID}`, { waitUntil: 'networkidle' });

  // Locate the Context Evidence Panel
  const panel = page.locator('[data-testid="context-evidence-panel"]');
  await panel.waitFor({ state: 'visible', timeout: 15000 });
  console.log('  -> Context Evidence Panel found on page.');

  // Assert Panel Disclaimer & Non-evaluative Wording
  const disclaimerText = await panel.locator('p').first().textContent();
  console.log(`  -> Panel wording: "${disclaimerText}"`);
  if (!disclaimerText.includes('does not verify competence')) {
    throw new Error('Panel missing competence disclaimer!');
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_context_evidence_panel_mounted.png'), fullPage: true });
  console.log('  -> Saved screenshot: 07_context_evidence_panel_mounted.png');

  // 4. Submit Actual Document File (v1)
  console.log('\n[4/6] Uploading actual document file (v1)...');
  const tempDocV1 = path.join('/tmp', 'sre_cloud_architecture_v1.txt');
  fs.writeFileSync(tempDocV1, 'Lead Platform Architect\nMulti-region Kubernetes deployment on AWS.\nAutomated SOC2 audit compliance.\nHigh availability distributed databases.\n');

  const fileInput = panel.locator('input[type="file"]');
  await fileInput.setInputFiles(tempDocV1);

  const sourceKeyInput = panel.locator('input[placeholder*="Keep this key"]');
  await sourceKeyInput.fill('sre_cloud_architecture_spec');

  const uploadBtn = panel.locator('button:has-text("Upload and queue processing")');
  await uploadBtn.click();

  // Wait for upload and poll for completed status
  console.log('  -> Upload submitted. Waiting for background worker processing...');
  await page.waitForTimeout(2000);

  const refreshBtn = panel.locator('button:has-text("Refresh status")');
  let completed = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    await refreshBtn.click();
    await page.waitForTimeout(1000);
    const sourceItem = panel.locator('li button:has-text("completed")');
    if (await sourceItem.count() > 0) {
      completed = true;
      await sourceItem.first().click();
      break;
    }
  }

  if (!completed) throw new Error('Document processing did not reach completed state in UI');
  console.log('  -> Document reached "completed" state.');

  // Assert Evidence Spans and Unicode Code Point Offsets
  const versionHeading = await panel.locator('article h3').textContent();
  console.log(`  -> Active Inspection Heading: "${versionHeading}"`);
  if (!versionHeading.includes('Version 1: completed')) {
    throw new Error(`Expected Version 1: completed, got ${versionHeading}`);
  }

  const spanFooters = await panel.locator('article blockquote footer').allTextContents();
  console.log(`  -> Extracted spans count: ${spanFooters.length}`);
  if (spanFooters.length < 3) throw new Error(`Expected at least 3 spans, got ${spanFooters.length}`);
  if (!spanFooters[0].includes('Unicode code points')) {
    throw new Error('Span missing truthful Unicode code points indicator');
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_context_evidence_spans_inspected.png'), fullPage: true });
  console.log('  -> Saved screenshot: 08_context_evidence_spans_inspected.png');

  // 5. Search Over Uploaded Passages
  console.log('\n[5/6] Executing passage search over uploaded document...');
  const searchInput = panel.locator('input[aria-label="Find evidence"]');
  await searchInput.fill('Kubernetes deployment');

  const searchBtn = panel.locator('button:has-text("Search passages")');
  await searchBtn.click();
  await page.waitForTimeout(1500);

  const searchArticle = panel.locator('article').nth(1);
  const searchDisclaimer = await searchArticle.locator('p').first().textContent();
  console.log(`  -> Search disclaimer: "${searchDisclaimer}"`);
  if (!searchDisclaimer.includes('NOT EMPLOYER-APPROVED')) {
    throw new Error('Search result missing disclaimer');
  }

  const passageText = await searchArticle.locator('blockquote p').first().textContent();
  console.log(`  -> Top retrieved passage: "${passageText}"`);
  if (!passageText.includes('Kubernetes')) {
    throw new Error('Retrieved passage did not match query');
  }

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_context_evidence_passage_search.png'), fullPage: true });
  console.log('  -> Saved screenshot: 09_context_evidence_passage_search.png');

  // 6. Upload Revised Document (v2) with Same Source Key
  console.log('\n[6/6] Uploading revised document (v2) with same source key...');
  const tempDocV2 = path.join('/tmp', 'sre_cloud_architecture_v2.txt');
  fs.writeFileSync(tempDocV2, 'Lead Platform Architect v2\nMulti-region Kubernetes deployment on AWS.\nAutomated SOC2 audit compliance.\nHigh availability distributed databases.\nKafka distributed event streaming.\n');

  await fileInput.setInputFiles(tempDocV2);
  await sourceKeyInput.fill('sre_cloud_architecture_spec');
  await uploadBtn.click();
  await page.waitForTimeout(2000);

  // Poll for v2 completed
  let v2Completed = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    await refreshBtn.click();
    await page.waitForTimeout(1000);
    const v2Item = panel.locator('li button:has-text("version 2: completed")');
    if (await v2Item.count() > 0) {
      v2Completed = true;
      await v2Item.first().click();
      break;
    }
  }

  if (!v2Completed) throw new Error('Version 2 did not reach completed state in UI');
  console.log('  -> Version 2 reached "completed" state.');

  const v2Heading = await panel.locator('article h3').textContent();
  console.log(`  -> Active Inspection Heading: "${v2Heading}"`);
  if (!v2Heading.includes('Version 2: completed')) {
    throw new Error(`Expected Version 2: completed, got ${v2Heading}`);
  }

  // Verify fresh spans contain Kafka
  const v2Spans = await panel.locator('article blockquote p').allTextContents();
  const hasKafka = v2Spans.some(text => text.includes('Kafka'));
  if (!hasKafka) throw new Error('Version 2 spans missing fresh content');
  console.log('  -> Fresh content verified in Version 2 spans.');

  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_context_evidence_v2_revision.png'), fullPage: true });
  console.log('  -> Saved screenshot: 10_context_evidence_v2_revision.png');

  console.log('\n==================================================================');
  console.log('ALL PLAYWRIGHT BROWSER ACCEPTANCE ASSERTIONS PASSED!');
  console.log('==================================================================');

  await browser.close();
}

run().catch((err) => {
  console.error('\n[FATAL ERROR]', err);
  process.exit(1);
});
