/**
 * UX-V2-D2-C3 Non-Self-Fulfilling Employer Chat Playwright Authenticated UAT Suite
 * Complete API-to-UI verification asserting real unintercepted POST response resolution,
 * exact JSON reply/suggestion/artifact equality, loading lifecycle & duplicate prevention,
 * keyboard Enter vs Shift+Enter, 401/400/403/404 security paths, and error/retry flow with duplicate prevention.
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

test.describe('Employer Chat V2 Playwright Authenticated UAT Suite (UX-V2-D2-C3)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"]', 'd2c.alpha.owner@example.com');
    await page.fill('input[type="password"]', pwd);
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => window.location.pathname !== '/auth', { timeout: 15000 });
  });

  test('1. Real Success-Path: Unintercepted POST Resolution, Exact JSON Equality & Layout Integrity', async ({ page }) => {
    await page.goto(`${BASE_URL}/employer/chat`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="chat-input"]', { state: 'visible', timeout: 15000 });

    const initialAssistantCount = await page.locator('[data-message-role="assistant"]').count();
    const promptInput = page.locator('[data-testid="chat-input"]');
    const submitBtn = page.locator('[data-testid="chat-send-btn"]');

    await promptInput.fill('Give me a summary of my current hiring pipeline');

    // Prepare response promise BEFORE click
    const responsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/employer/chat') &&
      response.request().method() === 'POST'
    );

    await submitBtn.click();

    // Loading lifecycle: Assert button disabled during pending request
    await expect(submitBtn).toBeDisabled();
    await expect(promptInput).toBeDisabled();

    const response = await responsePromise;
    expect(response.status()).toBe(200);

    const resData = await response.json();
    expect(resData).toHaveProperty('reply');
    expect(typeof resData.reply).toBe('string');
    expect(resData.reply.length).toBeGreaterThan(0);

    // Assert loading finishes and controls re-enable
    await expect(promptInput).not.toBeDisabled();

    // Assert exactly 1 new assistant message added
    const newAssistantCount = await page.locator('[data-message-role="assistant"]').count();
    expect(newAssistantCount).toBe(initialAssistantCount + 1);

    const lastAssistantMsg = page.locator('[data-message-role="assistant"]').last();

    // Assert rendered text equals API reply
    await expect(lastAssistantMsg).toContainText(resData.reply.replace(/\*\*/g, ''));

    // Assert exact follow-up / suggestion count & text equality matching AssistantMessage rendering precedence
    const expectedFollowUps =
      Array.isArray(resData.relatedQuestions) && resData.relatedQuestions.length > 0
        ? resData.relatedQuestions
        : resData.suggestions;
    if (Array.isArray(expectedFollowUps)) {
      const suggestionBtns = lastAssistantMsg.locator('[data-testid="related-followups"] button');
      await expect(suggestionBtns).toHaveCount(expectedFollowUps.length);
      for (let i = 0; i < expectedFollowUps.length; i++) {
        const expectedLabel =
          typeof expectedFollowUps[i] === 'string'
            ? expectedFollowUps[i]
            : (expectedFollowUps[i]?.label || expectedFollowUps[i]?.text || '');
        await expect(suggestionBtns.nth(i)).toHaveText(expectedLabel);
      }
    }

    // Assert exact artifact presence & field equality
    if (resData.artifact) {
      const artifactLink = lastAssistantMsg.locator(`a[href="${resData.artifact.href}"]`);
      await expect(artifactLink).toBeVisible();
      await expect(lastAssistantMsg.locator(`text="${resData.artifact.title}"`)).toBeVisible();
      await expect(lastAssistantMsg.locator(`text="${resData.artifact.type}"`)).toBeVisible();
    } else {
      await expect(lastAssistantMsg.locator('a[href^="/employer/shortlist"]')).toHaveCount(0);
    }

    // Assert sources: empty array -> zero source pills
    if (!resData.sources || resData.sources.length === 0) {
      await expect(page.locator('text="Attributable Sources:"')).toHaveCount(0);
    }

    // Assert no simulated execution steps rendered
    await expect(page.locator('text="Scanning Hiring Runs"')).toHaveCount(0);
    await expect(page.locator('text="Aggregating Candidate Counts"')).toHaveCount(0);

    // Mobile 375px zero horizontal overflow check
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    const hasMobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasMobileOverflow).toBe(false);

    // Tablet 768px zero horizontal overflow check
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(300);
    const hasTabletOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasTabletOverflow).toBe(false);

    // Capture desktop, tablet, mobile screenshots
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: path.join(artifactsDir, '01_chat_v2_c3_desktop_1440px.png'), fullPage: true });
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.screenshot({ path: path.join(artifactsDir, '02_chat_v2_c3_tablet_768px.png'), fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: path.join(artifactsDir, '03_chat_v2_c3_mobile_375px.png'), fullPage: true });
  });

  test('2. Keyboard Behavior: Enter Submits & Shift+Enter Inserts Line Break', async ({ page }) => {
    await page.goto(`${BASE_URL}/employer/chat`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="chat-input"]', { state: 'visible', timeout: 15000 });

    const promptInput = page.locator('[data-testid="chat-input"]');

    // Shift+Enter should insert line break without submitting
    await promptInput.fill('Line 1');
    await promptInput.press('Shift+Enter');
    await promptInput.type('Line 2');

    const inputValue = await promptInput.inputValue();
    expect(inputValue).toContain('Line 1\nLine 2');

    // Enter should submit the prompt
    const responsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/employer/chat') &&
      response.request().method() === 'POST'
    );

    await promptInput.press('Enter');
    const response = await responsePromise;
    expect(response.status()).toBe(200);
  });

  test('3. Capability-Limited Path: Unsupported Prompt Returns Honest Live-Data Limitation', async ({ page }) => {
    await page.goto(`${BASE_URL}/employer/chat`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="chat-input"]', { state: 'visible', timeout: 15000 });

    const promptInput = page.locator('[data-testid="chat-input"]');
    const submitBtn = page.locator('[data-testid="chat-send-btn"]');

    await promptInput.fill('Who is the CEO of Google?');

    const responsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/employer/chat') &&
      response.request().method() === 'POST'
    );

    await submitBtn.click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);

    const resData = await response.json();
    expect(resData.reply).toContain('This chat cannot answer that request from authorized live data yet');
  });

  test('4. Security Paths: 401 Unauthorized, 400 Malformed, 403 Forbidden, 404 Invalid Run Assertion', async ({ page }) => {
    // 4.1 Unauthenticated Request -> 401
    const unauthRes = await page.request.post(`${BASE_URL}/api/employer/chat`, {
      headers: { 'Cookie': '' },
      data: { message: 'Unauthorized check' },
    });
    expect(unauthRes.status()).toBe(401);

    // 4.2 Malformed Message -> 400
    const malformedRes = await page.request.post(`${BASE_URL}/api/employer/chat`, {
      data: { message: '' },
    });
    expect(malformedRes.status()).toBe(400);

    // 4.3 Malformed org_id UUID -> 400
    const badUuidRes = await page.request.post(`${BASE_URL}/api/employer/chat`, {
      data: { message: 'Check bad org UUID', context: { org_id: 'not-a-uuid' } },
    });
    expect(badUuidRes.status()).toBe(400);

    // 4.4 Forged/Inaccessible org_id -> 403
    const forgedOrgRes = await page.request.post(`${BASE_URL}/api/employer/chat`, {
      data: { message: 'Check forged org', context: { org_id: '00000000-0000-4000-a000-000000000000' } },
    });
    expect(forgedOrgRes.status()).toBe(403);

    // 4.5 Foreign/Invalid active_run_id -> 404 Explicit Playwright Assertion
    const foreignRunRes = await page.request.post(`${BASE_URL}/api/employer/chat`, {
      data: { message: 'Check foreign run', context: { active_run_id: '00000000-0000-4000-a000-000000000000' } },
    });
    expect(foreignRunRes.status()).toBe(404);
    const foreignData = await foreignRunRes.json();
    expect(foreignData.error).toBe('Hiring run not found or does not belong to authorized organization');
  });

  test('5. Error & Retry Closure Path: Proves Failed Request Alert, Successful Retry Rendering, and Zero Duplicate Messages', async ({ page }) => {
    await page.goto(`${BASE_URL}/employer/chat`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="chat-input"]', { state: 'visible', timeout: 15000 });

    const isChatRoute = (url) => url.href.includes('/api/employer/chat');

    // Record initial message counts
    const initialUserCount = await page.locator('[data-message-role="user"]').count();
    const initialAssistantCount = await page.locator('[data-message-role="assistant"]').count();

    // Intercept API route with 500 error
    await page.route(isChatRoute, async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        });
      } else {
        await route.continue();
      }
    });

    const promptInput = page.locator('[data-testid="chat-input"]');
    const submitBtn = page.locator('[data-testid="chat-send-btn"]');

    await promptInput.fill('Test network error recovery');
    await submitBtn.click();

    // Await error state banner
    const errorAlert = page.locator('[data-testid="chat-error-alert"]');
    await expect(errorAlert).toBeVisible({ timeout: 10000 });
    await expect(errorAlert).toContainText('Unable to connect to hiring chat service');

    // Unroute interception to allow normal retry
    await page.unroute(isChatRoute);

    const resendBtn = page.locator('button:has-text("Resend Message")');
    await expect(resendBtn).toBeVisible();

    const responsePromise = page.waitForResponse((response) =>
      response.url().includes('/api/employer/chat') &&
      response.request().method() === 'POST' &&
      response.status() === 200
    );

    await resendBtn.click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);

    const resData = await response.json();

    // Error alert disappears after successful retry
    await expect(errorAlert).not.toBeVisible();

    // Assert duplicate prevention:
    // User message count should be exactly initialUserCount + 1 (NOT +2)
    const finalUserCount = await page.locator('[data-message-role="user"]').count();
    expect(finalUserCount).toBe(initialUserCount + 1);

    // Assistant message count should be exactly initialAssistantCount + 1 (NOT +2)
    const finalAssistantCount = await page.locator('[data-message-role="assistant"]').count();
    expect(finalAssistantCount).toBe(initialAssistantCount + 1);

    // Assert rendered retry response text equals API reply
    const lastAssistantMsg = page.locator('[data-message-role="assistant"]').last();
    await expect(lastAssistantMsg).toContainText(resData.reply.replace(/\*\*/g, ''));
  });

});
