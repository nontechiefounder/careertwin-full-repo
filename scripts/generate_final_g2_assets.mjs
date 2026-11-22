import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '../apps/web/node_modules/playwright/index.mjs';

const ARTIFACT_DIR = '/Users/darshilparmar/.gemini/antigravity/brain/a0afa867-b745-4dd6-80a0-15abfe74e194';
const ARTIFACT_FOLDER = '/Users/darshilparmar/.gemini/antigravity/brain/a0afa867-b745-4dd6-80a0-15abfe74e194/g2_screenshots';
const PUBLIC_FOLDER = '/Users/darshilparmar/Desktop/Genome/careertwin-v2-memory-expansion-worktree/apps/web/public/g2_screenshots';
const WORKSPACE_FOLDER = '/Users/darshilparmar/Desktop/Genome/g2_screenshots';
const BASE_URL = process.env.WORKBYLINE_WEB_URL || 'http://localhost:3004';
const ROLE_ID = '4ec459b3-36b7-4ebf-b019-38c9c8f9a959';
const PACKET_ID = '33333333-3333-4333-a333-333333333333';

const RECRUITER_USER = {
  email: 'synthetic.employer.alpha@example.invalid',
  password: 'TestPassword123!',
};

async function generateG2Assets() {
  console.log('=== STARTING HIGH-RES G2 ASSET CAPTURE (10 SHOTS) ===');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Artifact Output: ${ARTIFACT_DIR}`);

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

  async function snap(filename, label) {
    const targetPath = path.join(ARTIFACT_DIR, filename);
    const folderPath = path.join(ARTIFACT_FOLDER, filename);
    const publicPath = path.join(PUBLIC_FOLDER, filename);
    await page.waitForTimeout(1000);
    // Dismiss any ephemeral toast if visible to keep shot clean
    await page.evaluate(() => {
      document.querySelectorAll('[data-sonner-toast]').forEach(t => t.remove());
    }).catch(() => {});
    await page.screenshot({ path: targetPath });
    fs.copyFileSync(targetPath, folderPath);
    fs.copyFileSync(targetPath, publicPath);
    fs.copyFileSync(targetPath, path.join(WORKSPACE_FOLDER, filename));
    console.log(`✔ [Captured] ${filename} - ${label}`);
  }

  // -------------------------------------------------------------
  // SHOT 1: Executive Landing & Platform Overview
  // -------------------------------------------------------------
  console.log('[1/10] Capturing Shot 01: Landing Page Hero...');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await snap('g2_01_platform_overview_hero.png', 'Autonomous AI Hiring & Proof-of-Work Platform');

  // -------------------------------------------------------------
  // AUTH: Sign In as Alpha Employer
  // -------------------------------------------------------------
  console.log('Authenticating as Alpha Recruiter...');
  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="email-input"]', { timeout: 15000 });
  await page.locator('[data-testid="email-input"]').first().fill(RECRUITER_USER.email);
  await page.locator('[data-testid="password-input"]').first().fill(RECRUITER_USER.password);
  await page.locator('[data-testid="login-btn"]').click();
  await page.waitForURL(url => !url.pathname.startsWith('/auth'), { timeout: 15000 });
  console.log('Authentication confirmed.');

  // -------------------------------------------------------------
  // SHOT 2: Hiring Intelligence Command Center
  // -------------------------------------------------------------
  console.log('[2/10] Capturing Shot 02: Employer Command Center Dashboard...');
  await page.goto(`${BASE_URL}/employer`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="dashboard-stat-cards"]', { timeout: 15000 });
  await page.waitForTimeout(2000);
  await snap('g2_02_hiring_intelligence_command_center.png', 'Hiring Intelligence Command Center & Pipeline Telemetry');

  // -------------------------------------------------------------
  // SHOT 3: AI Role Intake & Calibration Studio
  // -------------------------------------------------------------
  console.log('[3/10] Capturing Shot 03: Role Intake & Calibration Studio...');
  await page.goto(`${BASE_URL}/employer/intake`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[name="role_title"], input[placeholder*="Job title"], [data-testid="describe-role-tab"]', { timeout: 15000 }).catch(() => {});
  // Pre-fill a role title to showcase interactive workflow
  const roleTitleInput = page.locator('input[placeholder*="Role Title"], input[placeholder*="Job title"], input[name="role_title"]').first();
  if (await roleTitleInput.isVisible().catch(() => false)) {
    await roleTitleInput.fill('Staff Distributed Systems Architect');
  }
  await page.waitForTimeout(1500);
  await snap('g2_03_role_calibration_intake_studio.png', 'AI Role Calibration & Verifiable Proof Contract Studio');

  // -------------------------------------------------------------
  // SHOT 4: Evidence-Governed Role Workspace & Rubric Approval
  // -------------------------------------------------------------
  console.log('[4/10] Capturing Shot 04: Role Workspace & Rubric Approval...');
  await page.goto(`${BASE_URL}/employer/brief/${ROLE_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await snap('g2_04_role_workspace_rubric_approval.png', 'Evidence-Governed Role Workspace & Rubric Approval');

  // -------------------------------------------------------------
  // SHOT 5: Autonomous Multi-Agent Sourcing Hub
  // -------------------------------------------------------------
  console.log('[5/10] Capturing Shot 05: Autonomous AI Sourcing Hub...');
  await page.goto(`${BASE_URL}/employer/sourcing/${ROLE_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await snap('g2_05_autonomous_sourcing_copilot.png', 'Autonomous Multi-Agent Sourcing & Talent Matching Hub');

  // -------------------------------------------------------------
  // SHOT 6: Direct Candidate Search & 800M+ Talent Graph
  // -------------------------------------------------------------
  console.log('[6/10] Capturing Shot 06: Direct Global Talent Search...');
  await page.goto(`${BASE_URL}/employer/sourcing/${ROLE_ID}?tab=direct`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const searchBtn = page.locator('[data-testid="datavertex-search-btn"]');
  if (await searchBtn.isEnabled().catch(() => false)) {
    const titleInput = page.locator('input[placeholder*="Target Job Title"], input[placeholder*="Staff Distributed Systems"], input[placeholder*="Job titles"]');
    if (await titleInput.count() > 0) {
      await titleInput.first().fill('Full Stack Engineer');
    }
    await searchBtn.click();
    await page.waitForTimeout(2500);
  }
  await snap('g2_06_direct_talent_search_graph.png', 'Direct Candidate Search Across 800M+ Profile Talent Graph');

  // -------------------------------------------------------------
  // SHOT 7: Candidate Cohort Shortlist & Evaluation Matrix
  // -------------------------------------------------------------
  console.log('[7/10] Capturing Shot 07: Candidate Cohort Shortlist...');
  await page.goto(`${BASE_URL}/employer/shortlist/${ROLE_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await snap('g2_07_candidate_shortlist_matrix.png', 'Candidate Cohort Shortlist & Evaluation Matrix');

  // -------------------------------------------------------------
  // SHOT 8: Source-Faithful Candidate Trust Packet & Evidence Audit
  // -------------------------------------------------------------
  console.log('[8/10] Capturing Shot 08: Candidate Trust Packet & Evidence...');
  await page.goto(`${BASE_URL}/employer/packet/${PACKET_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await snap('g2_08_candidate_trust_packet_evidence.png', 'Source-Faithful Candidate Trust Packet & Evidence Audit Trail');

  // -------------------------------------------------------------
  // SHOT 9: Recruiter AI Copilot Chat
  // -------------------------------------------------------------
  console.log('[9/10] Capturing Shot 09: Recruiter AI Copilot Chat...');
  await page.goto(`${BASE_URL}/employer/chat`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const chatInput = page.locator('textarea, input[placeholder*="Ask"]').first();
  if (await chatInput.isVisible().catch(() => false)) {
    await chatInput.fill('Summarize candidate evidence strengths and identify any missing proof blockers for the distributed systems cohort.');
    const sendBtn = page.locator('button[type="submit"], button:has-text("Send"), button[aria-label="Send message"]');
    if (await sendBtn.count() > 0) {
      await sendBtn.first().click();
    } else {
      await chatInput.press('Enter');
    }
    await page.waitForTimeout(3500);
  }
  await snap('g2_09_recruiter_ai_copilot_chat.png', 'Recruiter AI Copilot & Real-Time Hiring Telemetry Chat');

  // -------------------------------------------------------------
  // SHOT 10: Head-to-Head Comparison & Value Benchmark
  // -------------------------------------------------------------
  console.log('[10/10] Capturing Shot 10: Platform ROI & Head-to-Head Comparison...');
  await page.goto(`${BASE_URL}/compare`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await snap('g2_10_head_to_head_comparison_matrix.png', 'Platform ROI & Head-to-Head Evaluation Benchmark');

  await browser.close();
  console.log('=== ALL 10 G2 ASSETS SUCCESSFULLY CAPTURED AT 3200x2000 RETINA ===');
}

generateG2Assets().catch(console.error);
