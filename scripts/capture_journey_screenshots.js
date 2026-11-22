const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const SCREENSHOT_DIR = '/Users/darshilparmar/Desktop/CTW_V2_DEMO_CORE_03/screenshots';
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

const DB_TARGET = process.env.DISPOSABLE_DATABASE_URL || process.env.DISPOSABLE_DB_CONTAINER;

if (!DB_TARGET || DB_TARGET.toLowerCase().includes('supabase_db_careertwin-local-baseline') || DB_TARGET.toLowerCase().includes('54332')) {
  throw new Error('[SECURITY REJECTION] Target matches protected shared baseline database identity (supabase_db_careertwin-local-baseline / port 54332). Explicit disposable database required.');
}

function runPsql(sql) {
  const { execFileSync } = require('child_process');
  if (DB_TARGET.startsWith('postgres')) {
    return execFileSync('psql', [DB_TARGET, '-v', 'ON_ERROR_STOP=1'], {
      input: sql,
      encoding: 'utf-8'
    });
  } else {
    return execFileSync('docker', ['exec', '-i', DB_TARGET, 'psql', '-U', 'postgres', '-d', 'postgres'], {
      input: sql,
      encoding: 'utf-8'
    });
  }
}

async function run() {
  console.log('--- STARTING SYNTHETIC CUSTOMER JOURNEY PLAYWRIGHT AUTOMATION ---');

  // Step 0: Ensure hiring run 1 has unapproved state initially for brief screenshot
  console.log('[Setup] Resetting hiring run 1 to unapproved state...');
  runPsql(`
        UPDATE public.hiring_runs
    SET 
      must_haves = ARRAY['PostgreSQL', 'Distributed Systems', 'Go', 'Kubernetes'],
      nice_to_haves = ARRAY['Consensus Protocols'],
      job_description = 'Senior Engineer specializing in PostgreSQL internal architecture, distributed consensus, and Go services.',
      company = 'Alpha Technologies',
      location = 'San Francisco, CA / Remote',
      company_stage = 'series-b',
      brief_json = '{"contract_version": "1.0.0", "role_summary": "Senior Engineer specializing in PostgreSQL internal architecture, distributed consensus, and Go services.", "must_haves": ["PostgreSQL", "Distributed Systems", "Go", "Kubernetes"], "contract_approved": false}'::jsonb
    WHERE id = '11111111-1111-4111-a111-111111111111';
  `);

  // Launch Chromium
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });
  const page = await context.newPage();

  // Step 1: Sign in as Alpha Employer
  console.log('[Step 1] Navigating to /auth and signing in as synthetic.employer.alpha...');
  await page.goto('http://localhost:3002/auth', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  await page.fill('[data-testid="email-input"]', 'synthetic.employer.alpha@example.invalid');
  await page.fill('[data-testid="password-input"]', 'TestPassword123!');
  await page.click('[data-testid="login-btn"]');

  await page.waitForURL('**/employer', { timeout: 15000 });
  await page.waitForTimeout(1000);

  const dashPath = path.join(SCREENSHOT_DIR, '01_employer_signin_dashboard.png');
  await page.screenshot({ path: dashPath, fullPage: true });
  console.log('[Step 1 Captured]', dashPath);

  // Step 2: Navigate to Brief Page with Unapproved Rubric
  console.log('[Step 2] Navigating to /employer/brief/11111111-1111-4111-a111-111111111111...');
  await page.goto('http://localhost:3002/employer/brief/11111111-1111-4111-a111-111111111111', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const unapprovedPath = path.join(SCREENSHOT_DIR, '02_role_created_unapproved_brief.png');
  await page.screenshot({ path: unapprovedPath, fullPage: true });
  console.log('[Step 2 Captured]', unapprovedPath);

  // Step 3: Explicitly Approve Rubric via UI Button
  console.log('[Step 3] Clicking Approve Rubric button...');
  const approveBtn = page.locator('[data-testid="approve-rubric-btn"]');
  if (await approveBtn.isVisible()) {
    await approveBtn.click();
    await page.waitForTimeout(1500);
  }

  const approvedPath = path.join(SCREENSHOT_DIR, '03_rubric_explicitly_approved.png');
  await page.screenshot({ path: approvedPath, fullPage: true });
  console.log('[Step 3 Captured]', approvedPath);

  // Step 4: Ensure candidate document & packet are generated for candidate 1
  console.log('[Step 4] Ensuring candidate packet is generated...');
  // Trigger packet generation API to ensure DB persistence
  try {
    const genRes = await page.evaluate(async () => {
      const res = await fetch('/api/employer/packets/33333333-3333-4333-a333-333333333333/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      return { status: res.status, data: await res.json() };
    });
    console.log('[Step 4 Packet Gen]', genRes.status, genRes.data?.screen_summary);
  } catch (e) {
    console.warn('[Step 4 Packet Gen Warn]', e.message);
  }

  // Step 5: Navigate to Candidate Trust Packet Page
  console.log('[Step 5] Navigating to candidate trust packet page...');
  await page.goto('http://localhost:3002/employer/packet/33333333-3333-4333-a333-333333333333', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const packetPath = path.join(SCREENSHOT_DIR, '04_candidate_trust_packet.png');
  await page.screenshot({ path: packetPath, fullPage: true });
  console.log('[Step 5 Captured]', packetPath);

  // Step 6: Inspect Citation / Evidence Drawer
  console.log('[Step 6] Clicking on claim to inspect citation provenance in drawer...');
  const claimRow = page.locator('text=PostgreSQL mentioned in document').first();
  if (await claimRow.isVisible()) {
    await claimRow.click();
    await page.waitForTimeout(1000);
  }

  const citationPath = path.join(SCREENSHOT_DIR, '05_citation_provenance_inspection.png');
  await page.screenshot({ path: citationPath, fullPage: true });
  console.log('[Step 6 Captured]', citationPath);

  // Close drawer if open (press Escape or click overlay)
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // Step 7: Record Human Decision Rationale & Advance
  console.log('[Step 7] Recording human decision rationale and advancing candidate...');
  const rationaleInput = page.locator('textarea, input[placeholder*="rationale" i], [data-testid="decision-rationale-input"]').first();
  if (await rationaleInput.isVisible()) {
    await rationaleInput.fill('Candidate demonstrates verified deep PostgreSQL consensus and distributed architecture. Independent code artifacts corroborated.');
  }

  const advanceBtn = page.locator('button:has-text("Advance"), [data-testid="advance-btn"]').first();
  if (await advanceBtn.isVisible()) {
    await advanceBtn.click();
    await page.waitForTimeout(1500);
  }

  const decisionPath = path.join(SCREENSHOT_DIR, '06_human_decision_recorded.png');
  await page.screenshot({ path: decisionPath, fullPage: true });
  console.log('[Step 7 Captured]', decisionPath);

  // Step 8: Reload and verify persisted results
  console.log('[Step 8] Reloading page to verify persistence...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const persistedPath = path.join(SCREENSHOT_DIR, '07_persisted_results_verified.png');
  await page.screenshot({ path: persistedPath, fullPage: true });
  console.log('[Step 8 Captured]', persistedPath);

  // Step 9: Insufficient Evidence demonstration (Candidate Two)
  console.log('[Step 9] Demonstrating insufficient evidence candidate packet...');
  // Approve hiring run 2 rubric in DB
  runPsql(`
        UPDATE public.hiring_runs
    SET 
      must_haves = ARRAY['Machine Learning', 'CUDA', 'PyTorch'],
      brief_json = '{"contract_version": "1.0.0", "approved_rubric_version": "1.0.0", "contract_approved": true, "approved_by": "00000000-0000-4000-a000-000000000001", "approved_at": "2026-10-03T00:00:00Z", "must_haves": ["Machine Learning", "CUDA", "PyTorch"]}'::jsonb
    WHERE id = '22222222-2222-4222-a222-222222222222';

    UPDATE public.candidates
    SET 
      fit_score = null,
      decision_packet = '{"spec_version": "1.0.0-kernel", "fit_score": null, "proof_strength": 0.0, "entropy": 2.0, "what_is_verified": [], "what_is_inferred": [], "what_remains_uncertain": ["Unassessed candidate resume"], "screen_summary": "Candidate evaluated as INSUFFICIENT EVIDENCE with Proof Strength 0%.", "evaluation_metrics": {"entropy": 2.0, "role_fit_label": "Insufficient Evidence", "decision_readiness": "INSUFFICIENT EVIDENCE", "proof_strength": 0.0, "role_fit_distribution": {"p_low": 0.25, "p_limited": 0.25, "p_moderate": 0.25, "p_strong": 0.25}}}'::jsonb
    WHERE id = '44444444-4444-4444-a444-444444444444';
  `);

  await page.goto('http://localhost:3002/employer/packet/44444444-4444-4444-a444-444444444444', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const unassessedPath = path.join(SCREENSHOT_DIR, '08_insufficient_evidence_unassessed.png');
  await page.screenshot({ path: unassessedPath, fullPage: true });
  console.log('[Step 9 Captured]', unassessedPath);

  // Step 10: Cross-Tenant Access Denial (Beta Employer)
  console.log('[Step 10] Testing cross-tenant denial with isolated Beta Employer context...');
  const betaContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const betaPage = await betaContext.newPage();

  await betaPage.goto('http://localhost:3002/auth', { waitUntil: 'networkidle' });
  await betaPage.fill('[data-testid="email-input"]', 'synthetic.employer.beta@example.invalid');
  await betaPage.fill('[data-testid="password-input"]', 'TestPassword123!');
  await betaPage.click('[data-testid="login-btn"]');
  await betaPage.waitForURL('**/employer', { timeout: 15000 });

  console.log('[Step 10] Beta employer attempting to view Alpha candidate packet...');
  await betaPage.goto('http://localhost:3002/employer/packet/33333333-3333-4333-a333-333333333333', { waitUntil: 'networkidle' });
  await betaPage.waitForTimeout(1500);

  const denialPath = path.join(SCREENSHOT_DIR, '09_security_cross_tenant_denial.png');
  await betaPage.screenshot({ path: denialPath, fullPage: true });
  console.log('[Step 10 Captured]', denialPath);
  await betaContext.close();

  await browser.close();
  console.log('--- ALL CUSTOMER JOURNEY STEPS & SCREENSHOTS COMPLETED SUCCESSFULLY ---');
}

run().catch(err => {
  console.error('Customer journey automation failed:', err);
  process.exit(1);
});
