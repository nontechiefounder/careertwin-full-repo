import path from 'node:path';
import { chromium } from '../apps/web/node_modules/playwright/index.mjs';

const ARTIFACT_DIR = '/Users/darshilparmar/.gemini/antigravity/brain/a0afa867-b745-4dd6-80a0-15abfe74e194';
const BASE_URL = process.env.WORKBYLINE_WEB_URL || 'http://127.0.0.1:3004';
const ROLE_ID = '4ec459b3-36b7-4ebf-b019-38c9c8f9a959';

const RECRUITER_USER = {
  email: 'synthetic.employer.alpha@example.invalid',
  password: 'TestPassword123!',
};

async function testShots6And10() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Users/darshilparmar/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
    colorScheme: 'dark'
  });
  const page = await context.newPage();

  // Login
  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="email-input"]').first().fill(RECRUITER_USER.email);
  await page.locator('[data-testid="password-input"]').first().fill(RECRUITER_USER.password);
  await page.locator('[data-testid="login-btn"]').click();
  await page.waitForURL(url => !url.pathname.startsWith('/auth'), { timeout: 15000 });

  // Test Shot 6: Direct Sourcing Search
  console.log('Testing Shot 6...');
  await page.goto(`${BASE_URL}/employer/sourcing/${ROLE_ID}?tab=direct`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const searchBtn = page.locator('[data-testid="sourcing-search-btn"]');
  if (await searchBtn.isVisible().catch(() => false)) {
    console.log('Clicking sourcing-search-btn...');
    await searchBtn.click();
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'g2_06_direct_talent_search_graph.png') });
  console.log('Shot 6 saved.');

  // Test Shot 10: Comparison Table
  console.log('Testing Shot 10...');
  await page.goto(`${BASE_URL}/compare`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    window.scrollBy(0, 500);
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'g2_10_head_to_head_comparison_matrix.png') });
  console.log('Shot 10 saved.');

  await browser.close();
}

testShots6And10().catch(console.error);
