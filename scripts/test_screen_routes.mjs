import { chromium } from '../apps/web/node_modules/playwright/index.mjs';

const BASE_URL = process.env.WORKBYLINE_WEB_URL || 'http://127.0.0.1:3004';
const RECRUITER_USER = {
  email: 'synthetic.employer.alpha@example.invalid',
  password: 'TestPassword123!',
};

async function testScreens() {
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

  // Login first
  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="email-input"]').first().fill(RECRUITER_USER.email);
  await page.locator('[data-testid="password-input"]').first().fill(RECRUITER_USER.password);
  await page.locator('[data-testid="login-btn"]').click();
  await page.waitForURL(url => !url.pathname.startsWith('/auth'), { timeout: 15000 });

  const testUrls = [
    { name: '1_Landing', url: `${BASE_URL}/` },
    { name: '2_Dashboard', url: `${BASE_URL}/employer` },
    { name: '3_Brief', url: `${BASE_URL}/employer/brief/1bea003e-9466-4e4e-a185-6cc7cdd06ff1` },
    { name: '4_Sourcing_Autonomous', url: `${BASE_URL}/employer/sourcing/1bea003e-9466-4e4e-a185-6cc7cdd06ff1` },
    { name: '5_Sourcing_Direct', url: `${BASE_URL}/employer/sourcing/1bea003e-9466-4e4e-a185-6cc7cdd06ff1?tab=direct` },
    { name: '6_Shortlist', url: `${BASE_URL}/employer/shortlist/1bea003e-9466-4e4e-a185-6cc7cdd06ff1` },
    { name: '7_Packet_1', url: `${BASE_URL}/employer/packet/33333333-3333-4333-a333-333333333333` },
    { name: '7_Packet_2', url: `${BASE_URL}/employer/brief/1bea003e-9466-4e4e-a185-6cc7cdd06ff1?tab=evidence` },
    { name: '8_Chat', url: `${BASE_URL}/employer/chat` },
    { name: '9_Compare', url: `${BASE_URL}/compare` },
    { name: '10_Candidate_Profile', url: `${BASE_URL}/candidate/proof-profile/cand-101` },
    { name: '10_Candidate_Screen', url: `${BASE_URL}/candidate/screen/sess-001` },
    { name: '10_Candidate_Onboard', url: `${BASE_URL}/candidate/onboarding` },
    { name: '10_Candidate_Status', url: `${BASE_URL}/candidate/status/cand-101` },
  ];

  for (const item of testUrls) {
    try {
      const res = await page.goto(item.url, { waitUntil: 'networkidle', timeout: 10000 });
      console.log(`${item.name} (${item.url}): status=${res?.status()} title="${await page.title()}"`);
    } catch (e) {
      console.log(`${item.name} error:`, e.message);
    }
  }

  await browser.close();
}

testScreens().catch(console.error);
