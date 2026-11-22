const { test, expect } = require('playwright/test');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const pwd = process.env.CAREERTWIN_STAGING_TEST_PASSWORD;
if (!pwd) {
  throw new Error('FAIL-CLOSED ERROR: CAREERTWIN_STAGING_TEST_PASSWORD is required.');
}

const BASE_URL = process.env.APP_URL || `http://localhost:${process.env.DISPOSABLE_VERIFICATION_PORT || '3010'}`;
const ALPHA_RUN_ID = '11111111-1111-4111-d2c1-111111111111';
const artifactsDir = process.env.ARTIFACTS_DIR || path.join(__dirname, '../../test-artifacts');
fs.mkdirSync(artifactsDir, { recursive: true });

async function signInAsEmployer(page) {
  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', 'd2c.alpha.owner@example.com');
  await page.fill('input[type="password"]', pwd);
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => !window.location.pathname.startsWith('/auth'), { timeout: 15000 });
}

test.describe('Device-Support Policy End-to-End Verification', () => {
  test('1. Public, legal, support, and /auth pages (including recovery & invite) remain accessible on phone viewports', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    const page = await context.newPage();

    for (const publicRoute of ['/', '/about', '/compare', '/contact', '/pricing', '/privacy', '/terms']) {
      await page.goto(`${BASE_URL}${publicRoute}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('device-support-screen')).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);
    }

    await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('auth-page')).toBeVisible();
    await expect(page.getByTestId('device-support-screen')).toHaveCount(0);

    await page.goto(`${BASE_URL}/auth?tab=register`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('auth-page')).toBeVisible();
    await expect(page.getByTestId('device-support-screen')).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toBeVisible();

    await page.goto(`${BASE_URL}/auth?tab=recovery`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h3:has-text("Reset Password")')).toBeVisible();
    await expect(page.getByTestId('device-support-screen')).toHaveCount(0);

    await page.goto(`${BASE_URL}/auth?invite=sample-invite-check`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('text=Team Invitation')).toBeVisible();
    await expect(page.getByTestId('device-support-screen')).toHaveCount(0);

    // Email verification confirmation callback must remain accessible on phone (redirects back to /auth)
    await page.goto(`${BASE_URL}/api/auth/confirm`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.location.pathname.startsWith('/auth'), { timeout: 10000 });
    await expect(page.getByTestId('device-support-screen')).toHaveCount(0);

    await context.close();
  });

  test('2. Unauthenticated phone preserves intended destination without leaking tokens across /auth into dedicated device-support screen', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    const page = await context.newPage();

    // Visit protected workspace route unauthenticated with sensitive token query param
    await page.goto(`${BASE_URL}/employer/brief/${ALPHA_RUN_ID}?tab=evidence&token=secret_should_strip`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.location.pathname.startsWith('/auth'), { timeout: 15000 });
    expect(page.url()).toContain('redirect_to=');
    expect(page.url()).not.toContain('secret_should_strip');

    // Sign in on phone
    await page.fill('input[type="email"]', 'd2c.alpha.owner@example.com');
    await page.fill('input[type="password"]', pwd);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => window.location.pathname.startsWith('/employer/brief/'), { timeout: 15000 });

    // Must render dedicated DeviceSupportGate outside NaiveShell
    const gate = page.getByTestId('device-support-screen');
    await expect(gate).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('device-support-heading')).toHaveText('Continue on a larger screen');
    await expect(page.getByTestId('device-support-message')).toHaveText(
      'You’re signed in. To use the workBYLiNE workspace, open it on a desktop, laptop, Mac or iPad.'
    );
    await expect(page.getByTestId('device-support-destination')).toHaveText(`/employer/brief/${ALPHA_RUN_ID}?tab=evidence`);
    await expect(page.getByTestId('device-support-workspace-container')).toHaveCount(0);
    await expect(page.locator('aside')).toHaveCount(0);

    // Zero horizontal overflow
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);

    // Screenshot phone device-support screen
    await page.screenshot({ path: path.join(artifactsDir, 'device_support_phone_390px.png'), fullPage: true });

    // Reload stays gated
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('device-support-screen')).toBeVisible();

    // Candidate routes also gated on phone
    await page.goto(`${BASE_URL}/candidate/onboarding`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('device-support-screen')).toBeVisible();
    await expect(page.getByTestId('device-support-heading')).toHaveText('Continue on a larger screen');

    // Sign out button signs user out cleanly to /auth
    await page.getByTestId('device-support-signout-btn').click();
    await page.waitForFunction(() => window.location.pathname.startsWith('/auth'), { timeout: 15000 });

    // Revisit protected URL after signout -> expired/signed-out redirects back to /auth
    await page.goto(`${BASE_URL}/employer`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.location.pathname.startsWith('/auth'), { timeout: 15000 });

    await context.close();
  });

  test('3. Portrait (375, 390, 430), landscape phone (844x390), and onboarding copy checks', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    const page = await context.newPage();
    await signInAsEmployer(page);

    for (const vp of [
      { width: 375, height: 667 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 844, height: 390 }, // Phone landscape
    ]) {
      await page.setViewportSize(vp);
      await page.goto(`${BASE_URL}/employer`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('device-support-screen')).toBeVisible();
      await expect(page.getByTestId('device-support-heading')).toHaveText('Continue on a larger screen');
      await expect(page.getByTestId('device-support-workspace-container')).toHaveCount(0);
      await expect(page.locator('aside')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    }

    // Verify onboarding copy after email verification onboarding query marker
    await page.goto(`${BASE_URL}/employer?onboarding=1`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('device-support-message')).toHaveText(
      'Your account is ready. To use the workBYLiNE workspace, open it on a desktop, laptop, Mac or iPad.'
    );

    // Back to website link returns to / cleanly without credentials
    const backHref = await page.getByTestId('device-support-back-btn').getAttribute('href');
    expect(backHref).toBe('/');
    await page.getByTestId('device-support-back-btn').click();
    await page.waitForFunction(() => window.location.pathname === '/', { timeout: 10000 });

    await context.close();
  });

  test('4. iPad (>= 768px portrait & landscape, including desktop-mode Macintosh UA) allows workspace; narrow iPad (< 768px) shows Make this window wider', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 768, height: 1024 },
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 });
      Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
    });

    const page = await context.newPage();
    await signInAsEmployer(page);
    await page.goto(`${BASE_URL}/employer`, { waitUntil: 'domcontentloaded' });

    // iPad portrait 768x1024 -> Workspace allowed
    await expect(page.getByTestId('device-support-screen')).toHaveCount(0);
    await page.waitForSelector('[data-testid="stat-active-roles"]', { state: 'visible', timeout: 15000 });
    await page.screenshot({ path: path.join(artifactsDir, 'device_support_ipad_768px.png'), fullPage: true });

    // iPad landscape 1024x768 -> Workspace allowed
    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(page.getByTestId('device-support-screen')).toHaveCount(0);

    // Narrow iPad Split View 507x1024 -> Blocked with "Make this window wider"
    await page.setViewportSize({ width: 507, height: 1024 });
    await expect(page.getByTestId('device-support-screen')).toBeVisible();
    await expect(page.getByTestId('device-support-heading')).toHaveText('Make this window wider');

    await context.close();
  });

  test('5. Desktop breakpoints (1024..1920) allow workspace and dynamic resize < 768px preserves unsaved form work', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await signInAsEmployer(page);

    for (const vp of [
      { width: 1024, height: 768 },
      { width: 1280, height: 800 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize(vp);
      await page.goto(`${BASE_URL}/employer`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('device-support-screen')).toHaveCount(0);
      await page.waitForSelector('[data-testid="stat-active-roles"]', { state: 'visible', timeout: 15000 });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: path.join(artifactsDir, 'device_support_desktop_1440px.png'), fullPage: true });

    // Open intake form and enter unsaved text
    await page.goto(`${BASE_URL}/employer/intake`, { waitUntil: 'domcontentloaded' });
    const titleInput = page.getByTestId('role-title-input');
    await expect(titleInput).toBeVisible({ timeout: 15000 });
    await titleInput.fill('Staff Distributed Reliability Engineer');

    // Shrink window below 768px -> blocked while preserving workspace mount with aria-hidden
    await page.setViewportSize({ width: 640, height: 800 });
    await expect(page.getByTestId('device-support-screen')).toBeVisible();
    await expect(page.getByTestId('device-support-heading')).toHaveText('Make this window wider');
    await expect(page.getByTestId('device-support-workspace-container')).toHaveCount(1);
    await expect(page.getByTestId('device-support-workspace-container')).toHaveAttribute('aria-hidden', 'true');

    // Widen back to desktop -> unsaved text is still intact
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByTestId('device-support-screen')).toHaveCount(0);
    await expect(page.getByTestId('role-title-input')).toHaveValue('Staff Distributed Reliability Engineer');

    await context.close();
  });
});
