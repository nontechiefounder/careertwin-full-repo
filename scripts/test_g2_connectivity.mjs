import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '../apps/web/node_modules/playwright/index.mjs';

const ARTIFACT_DIR = '/Users/darshilparmar/.gemini/antigravity/brain/a0afa867-b745-4dd6-80a0-15abfe74e194';
const BASE_URL = process.env.WORKBYLINE_WEB_URL || 'http://127.0.0.1:3004';

const RECRUITER_USER = {
  email: 'synthetic.employer.alpha@example.invalid',
  password: 'TestPassword123!',
};

async function inspectRoutes() {
  console.log(`Connecting to ${BASE_URL}...`);
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Users/darshilparmar/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: 'dark'
  });

  const page = await context.newPage();

  // Test 1: Landing page
  console.log('Testing / ...');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  console.log('Landing title:', await page.title());

  // Test 2: Auth page
  console.log('Testing /auth ...');
  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="email-input"]').first().fill(RECRUITER_USER.email);
  await page.locator('[data-testid="password-input"]').first().fill(RECRUITER_USER.password);
  await page.locator('[data-testid="login-btn"]').click();
  await page.waitForURL(url => !url.pathname.startsWith('/auth'), { timeout: 15000 }).catch(e => console.log('Auth redirect timeout:', e.message));
  console.log('Post-login URL:', page.url());

  // Check employer dashboard
  await page.goto(`${BASE_URL}/employer`, { waitUntil: 'networkidle' });
  console.log('Employer page loaded. Title:', await page.title());

  await browser.close();
}

inspectRoutes().catch(console.error);
