import path from 'node:path';
import { chromium } from '../apps/web/node_modules/playwright/index.mjs';

const ARTIFACT_DIR = '/Users/darshilparmar/.gemini/antigravity/brain/a0afa867-b745-4dd6-80a0-15abfe74e194';
const BASE_URL = process.env.WORKBYLINE_WEB_URL || 'http://127.0.0.1:3004';
const ROLE_ID = '4ec459b3-36b7-4ebf-b019-38c9c8f9a959';

const RECRUITER_USER = {
  email: 'synthetic.employer.alpha@example.invalid',
  password: 'TestPassword123!',
};

async function fixShot6WithResults() {
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

  // Direct Sourcing Search
  console.log('Navigating to Direct Sourcing...');
  await page.goto(`${BASE_URL}/employer/sourcing/${ROLE_ID}?tab=direct`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const skillsInput = page.locator('input[placeholder*="Go, Kubernetes, Raft"]').first();
  if (await skillsInput.isVisible()) {
    await skillsInput.fill('React, Node.js, TypeScript, PostgreSQL');
  }

  const searchBtn = page.locator('[data-testid="sourcing-search-btn"]');
  if (await searchBtn.isVisible()) {
    await searchBtn.click();
    console.log('Waiting for search response...');
    await page.waitForResponse(r => r.url().includes('/api/employer/sourcing/search'), { timeout: 15000 }).catch(e => console.log('Wait response timed out:', e.message));
    await page.waitForTimeout(2000);
  }

  await page.evaluate(() => {
    document.querySelectorAll('[data-sonner-toast]').forEach(t => t.remove());
    // Scroll down slightly so results are centered
    window.scrollBy(0, 200);
  }).catch(() => {});

  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'g2_06_direct_talent_search_graph.png') });
  console.log('Shot 6 saved with results!');

  await browser.close();
}

fixShot6WithResults().catch(console.error);
