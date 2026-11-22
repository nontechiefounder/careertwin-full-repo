import path from 'node:path';
import { chromium } from '../apps/web/node_modules/playwright/index.mjs';

const ARTIFACT_DIR = '/Users/darshilparmar/.gemini/antigravity/brain/a0afa867-b745-4dd6-80a0-15abfe74e194';
const BASE_URL = process.env.WORKBYLINE_WEB_URL || 'http://127.0.0.1:3004';
const ROLE_ID = '4ec459b3-36b7-4ebf-b019-38c9c8f9a959';

const RECRUITER_USER = {
  email: 'synthetic.employer.alpha@example.invalid',
  password: 'TestPassword123!',
};

async function fixShot6Proper() {
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

  // Fill Skills input properly
  const skillsInput = page.locator('input[placeholder*="Go, Kubernetes, Raft"]').first();
  if (await skillsInput.isVisible()) {
    console.log('Filling skills input...');
    await skillsInput.fill('React, Node.js, TypeScript, PostgreSQL');
  }

  const searchBtn = page.locator('[data-testid="sourcing-search-btn"]');
  if (await searchBtn.isVisible()) {
    console.log('Clicking search button...');
    await searchBtn.click();
    await page.waitForTimeout(3000);
  }

  // Dismiss toasts if any
  await page.evaluate(() => {
    document.querySelectorAll('[data-sonner-toast]').forEach(t => t.remove());
  }).catch(() => {});

  // Scroll down slightly if needed to show candidate results
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'g2_06_direct_talent_search_graph.png') });
  console.log('✔ Clean Shot 6 saved at 3200x2000!');

  await browser.close();
}

fixShot6Proper().catch(console.error);
