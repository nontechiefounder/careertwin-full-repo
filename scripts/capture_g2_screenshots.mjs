import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '../apps/web/node_modules/playwright/index.mjs';

const ARTIFACT_DIR = '/Users/darshilparmar/.gemini/antigravity/brain/a0afa867-b745-4dd6-80a0-15abfe74e194';
const BASE_URL = process.env.WORKBYLINE_WEB_URL || 'http://127.0.0.1:3004';
const ROLE_ID = '1bea003e-9466-4e4e-a185-6cc7cdd06ff1';
const PACKET_ID = '33333333-3333-4333-a333-333333333333';

const RECRUITER_USER = {
  email: 'synthetic.employer.alpha@example.invalid',
  password: 'TestPassword123!',
};

async function captureG2Screenshots() {
  console.log('=== STARTING G2 PROFESSIONAL SCREENSHOT CAPTURE (10 SHOTS) ===');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Output: ${ARTIFACT_DIR}`);

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

  // Helper for crisp screenshot
  async function takeShot(filename, description) {
    const filePath = path.join(ARTIFACT_DIR, filename);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: filePath });
    console.log(`✔ [Captured ${filename}]: ${description}`);
  }

  // 1. Landing Page / Executive Hero
  console.log('[1/10] Capturing Landing Page Hero...');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await takeShot('g2_01_platform_overview_hero.png', 'Platform Overview & Hero Positioning');

  // Login
  console.log('Authenticating recruiter session...');
  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'networkidle' });
  await page.locator('[data-testid="email-input"]').first().fill(RECRUITER_USER.email);
  await page.locator('[data-testid="password-input"]').first().fill(RECRUITER_USER.password);
  await page.locator('[data-testid="login-btn"]').click();
  await page.waitForURL(url => !url.pathname.startsWith('/auth'), { timeout: 15000 });
  console.log('Authenticated successfully.');

  // 2. Roles Workspace / Command Center Dashboard
  console.log('[2/10] Capturing Employer Command Center Dashboard...');
  await page.goto(`${BASE_URL}/employer`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await takeShot('g2_02_hiring_intelligence_command_center.png', 'Hiring Intelligence Command Center & Pipeline Telemetry');

  // 3. Role Calibration & Proof Contract Brief
  console.log('[3/10] Capturing Role Brief & Proof Contract...');
  await page.goto(`${BASE_URL}/employer/brief/${ROLE_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await takeShot('g2_03_role_calibration_proof_contract.png', 'Role Calibration, Evaluation Rubrics & Verifiable Proof Contract');

  // 4. Autonomous AI Sourcing & Agent Copilot Hub
  console.log('[4/10] Capturing Autonomous Multi-Agent Sourcing Hub...');
  await page.goto(`${BASE_URL}/employer/sourcing/${ROLE_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await takeShot('g2_04_autonomous_sourcing_copilot.png', 'Autonomous AI Sourcing Hub & Multi-Agent Talent Matching');

  // 5. Direct Talent Search & DataVertex Candidate Graph
  console.log('[5/10] Capturing Direct Talent Search & Candidate Graph...');
  await page.goto(`${BASE_URL}/employer/sourcing/${ROLE_ID}?tab=direct`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const searchBtn = page.locator('[data-testid="datavertex-search-btn"]');
  if (await searchBtn.isEnabled().catch(() => false)) {
    const titleInput = page.locator('input[placeholder*="Target Job Title"], input[placeholder*="Staff Distributed Systems"], input[placeholder*="Job titles"]');
    if (await titleInput.count() > 0) {
      await titleInput.first().fill('Distributed Systems Lead');
    }
    await searchBtn.click();
    await page.waitForTimeout(1500);
  }
  await takeShot('g2_05_direct_talent_search_graph.png', 'Direct Candidate Search & 800M+ Verified Profile Graph');

  // 6. Candidate Cohort Shortlist & Evaluation Matrix
  console.log('[6/10] Capturing Candidate Cohort Shortlist...');
  await page.goto(`${BASE_URL}/employer/shortlist/${ROLE_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await takeShot('g2_06_candidate_shortlist_matrix.png', 'Candidate Cohort Shortlist & Stage Progression Matrix');

  // 7. Candidate Trust Packet & Evidence Audit Trail
  console.log('[7/10] Capturing Candidate Trust Packet...');
  await page.goto(`${BASE_URL}/employer/packet/${PACKET_ID}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  // Try to open claim drawer if available
  const claimRow = page.locator('text=PostgreSQL, text=Distributed Systems, [data-testid="claim-row"]').first();
  if (await claimRow.isVisible().catch(() => false)) {
    await claimRow.click().catch(() => {});
    await page.waitForTimeout(800);
  }
  await takeShot('g2_07_candidate_trust_packet_evidence.png', 'Source-Faithful Candidate Trust Packet & Evidence Breakdown');

  // 8. Recruiter AI Copilot & Real-Time Intelligence Chat
  console.log('[8/10] Capturing Recruiter AI Copilot Chat...');
  await page.goto(`${BASE_URL}/employer/chat`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const chatInput = page.locator('textarea, input[placeholder*="Ask"]').first();
  if (await chatInput.isVisible().catch(() => false)) {
    await chatInput.fill('Compare the top 2 candidates for the Distributed Systems role based on verified proof of work.');
    const sendBtn = page.locator('button[type="submit"], button:has-text("Send"), button[aria-label="Send message"]');
    if (await sendBtn.count() > 0) {
      await sendBtn.first().click();
    } else {
      await chatInput.press('Enter');
    }
    await page.waitForTimeout(3000);
  }
  await takeShot('g2_08_recruiter_ai_copilot_chat.png', 'Recruiter AI Copilot & Grounded Hiring Telemetry Chat');

  // 9. Side-by-Side Candidate Benchmark Matrix
  console.log('[9/10] Capturing Side-by-Side Candidate Benchmark Matrix...');
  await page.goto(`${BASE_URL}/compare`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await takeShot('g2_09_candidate_comparison_benchmark.png', 'Side-by-Side Candidate Benchmark Matrix & Claim Alignment');

  // 10. Candidate Verified Proof Profile & Credential Experience
  console.log('[10/10] Capturing Candidate Verified Proof Profile...');
  await page.goto(`${BASE_URL}/candidate/proof-profile/cand-101`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await takeShot('g2_10_candidate_verified_proof_profile.png', 'Candidate Verified Proof Profile & Cryptographic Credential');

  await browser.close();
  console.log('=== ALL 10 G2 SCREENSHOTS CAPTURED SUCCESSFULLY ===');
}

captureG2Screenshots().catch(console.error);
