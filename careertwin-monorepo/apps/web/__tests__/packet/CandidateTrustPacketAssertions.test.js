/**
 * UX-V2-D1-C6 Accessibility & Final Non-Self-Fulfilling Assertion Suite
 * Strict dynamic API-to-UI verification with mustGet helper,
 * browser-context-associated API requests, strict data-claim-id selectors (no fallbacks),
 * exact Evidence Drawer & Audit Drawer metadata assertions, and pure product-controlled focus restoration.
 */

const { test, expect } = require('playwright/test');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const pwd = process.env.CAREERTWIN_STAGING_TEST_PASSWORD;
if (!pwd) {
  throw new Error('FAIL-CLOSED ERROR: Mandatory environment variable CAREERTWIN_STAGING_TEST_PASSWORD is missing.');
}

const artifactsDir = '/Users/darshilparmar/.gemini/antigravity-ide/brain/20ee2f64-dbf1-48be-938a-f48c5ba475a1';

// Strict helper function: Throws immediately when mandatory API field is absent
function mustGet(obj, pathStr, description) {
  const parts = pathStr.split('.');
  let current = obj;
  for (const p of parts) {
    if (current == null || typeof current !== 'object') {
      throw new Error(`[FAIL] Mandatory field "${pathStr}" (${description}) is missing in API payload.`);
    }
    current = current[p];
  }
  if (current == null) {
    throw new Error(`[FAIL] Mandatory field "${pathStr}" (${description}) is null or undefined in API payload.`);
  }
  return current;
}

// Test cohort extraction IDs (persisted database candidates)
const cohortExtractionIds = [
  '33333333-3333-4333-d2c3-111111111111', // Candidate Alpha (Linked Evidence)
  '66933d44-ec31-4f44-96b7-28b921f0c514', // PDF Candidate (Human Review Required)
  '6b6611a4-4f66-430b-b19d-b2b6d74003a0', // PDF Candidate (Needs Proof)
  '77a7c4d5-cc20-4a27-bb11-e2fbad2b87eb', // DOCX Candidate (Unlinked Evidence)
];

test.describe('Candidate Trust Packet UX-V2-D1-C6 Assertion Suite', () => {
  test.setTimeout(60000);

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/auth', { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"]', 'd2c.alpha.owner@example.com');
    await page.fill('input[type="password"]', pwd);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname !== '/auth', { timeout: 20000 });
  });

  for (const extractionId of cohortExtractionIds) {
    test(`Strict API-to-UI Accessibility & Provenance for Extraction [${extractionId}]`, async ({ page }) => {
      // Reset viewport to Desktop 1440px
      await page.setViewportSize({ width: 1440, height: 900 });

      // Request authorized endpoint directly from API using authenticated browser request context
      const apiRes = await page.request.get(`http://localhost:3000/api/employer/packets/${extractionId}`);
      expect(apiRes.status()).toBe(200);

      const apiData = await apiRes.json();
      const packet = mustGet(apiData, 'packet', 'Root decision packet');
      const extraction = mustGet(apiData, 'extraction', 'Candidate extraction record');
      const hiringRun = mustGet(apiData, 'hiring_run', 'Hiring run record');

      // Derive expected mandatory values without fallbacks
      const expectedName = mustGet(extraction, 'candidate_name', 'Candidate name');
      const expectedRole = mustGet(hiringRun, 'role_title', 'Role title');
      const metrics = mustGet(packet, 'evaluation_metrics', 'Evaluation metrics');
      const expectedReadiness = mustGet(metrics, 'decision_readiness', 'Decision readiness');

      // Navigate browser page to Trust Packet UI
      await page.goto(`http://localhost:3000/employer/packet/${extractionId}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('header h1', { state: 'visible', timeout: 30000 });

      // 1. Candidate Identity & Target Role Exact Equality
      const uiName = await page.locator('header h1').textContent();
      expect(uiName.trim()).toBe(expectedName);

      const uiRoleSub = await page.locator('header p').textContent();
      expect(uiRoleSub).toContain(expectedRole);

      // 2. Exactly ONE Primary Readiness Badge
      const readinessBadge = page.locator('header span[role="status"]');
      await expect(readinessBadge).toHaveCount(1);
      await expect(readinessBadge).toContainText(expectedReadiness);

      // 3. Exact Rendered Transformations for Metrics & Role-Fit Distribution
      const overviewSection = page.locator('section[aria-label*="Decision Overview"]');
      await expect(overviewSection).toBeVisible();
      await expect(overviewSection).not.toContainText('Universal Fit Score');

      if (metrics.role_fit_label != null) {
        await expect(overviewSection).toContainText(metrics.role_fit_label);
      }
      if (metrics.role_fit_distribution) {
        const fitDist = metrics.role_fit_distribution;
        if (fitDist.p_strong != null) {
          await expect(overviewSection).toContainText(`${(fitDist.p_strong * 100).toFixed(0)}%`);
        }
        if (fitDist.p_moderate != null) {
          await expect(overviewSection).toContainText(`${(fitDist.p_moderate * 100).toFixed(0)}%`);
        }
        if (fitDist.p_low != null) {
          await expect(overviewSection).toContainText(`${(fitDist.p_low * 100).toFixed(0)}%`);
        }
      }

      if (metrics.proof_strength != null) {
        await expect(overviewSection).toContainText(metrics.proof_strength.toFixed(2));
      }
      if (metrics.proof_coverage != null) {
        await expect(overviewSection).toContainText(`${(metrics.proof_coverage * 100).toFixed(0)}%`);
      }
      if (metrics.uncertainty != null) {
        await expect(overviewSection).toContainText(metrics.uncertainty.toFixed(2));
      }
      if (metrics.gate_pass === true) {
        await expect(overviewSection).toContainText('Passed');
      } else if (metrics.gate_pass === false) {
        await expect(overviewSection).toContainText('Review Needed');
      }

      // 4. Claims & Canonical Evidence Relationship Resolution
      const rawClaims = packet.claim_ledger || packet.claims || [];
      const refMap = new Map();
      (packet.evidence_refs || []).forEach(r => { if (r && r.id) refMap.set(r.id, r); });

      for (let i = 0; i < rawClaims.length; i++) {
        const claim = rawClaims[i];
        if (typeof claim === 'string') continue;

        // Resolve evidence relationship strictly across all canonical forms
        let matchedRef = null;
        if (claim.evidence_ref && typeof claim.evidence_ref === 'object') {
          matchedRef = claim.evidence_ref;
        } else if (claim.evidence_id && refMap.has(claim.evidence_id)) {
          matchedRef = refMap.get(claim.evidence_id);
        } else if (Array.isArray(claim.evidence_ids) && claim.evidence_ids.length > 0 && refMap.has(claim.evidence_ids[0])) {
          matchedRef = refMap.get(claim.evidence_ids[0]);
        } else if (claim.claim_edges && Array.isArray(claim.claim_edges) && claim.claim_edges.length > 0 && refMap.has(claim.claim_edges[0])) {
          matchedRef = refMap.get(claim.claim_edges[0]);
        }

        const claimId = claim.id || `claim_${i}`;
        
        // DIRECTIVE 4: Strict data-claim-id selection ONLY (No broad div/filter/hasText fallback)
        const claimCard = page.locator(`[data-claim-id="${claimId}"]`).first();
        await expect(claimCard).toBeVisible();

        if (claim.status || claim.claim_state) {
          const claimState = claim.status || claim.claim_state;
          await expect(claimCard).toContainText(claimState);
        }

        if (matchedRef) {
          // MANDATORY LINKED CLAIM ASSERTION
          const citationBtn = claimCard.locator('button[aria-label*="citation"]').first();
          await expect(citationBtn).toBeVisible();
          
          // Focusing BEFORE opening is permitted
          await citationBtn.focus();
          await citationBtn.click();

          const evidenceDrawer = page.locator('[role="dialog"]:has-text("Evidence Source Citation")');
          await expect(evidenceDrawer).toBeVisible();

          // DIRECTIVE 5 & PART 1.A: Exact Evidence Drawer Assertions for locator, page/paragraph_id/row_index, offsets, file_hash, normalized_text_sha256
          if (matchedRef.filename) {
            await expect(evidenceDrawer.locator('text=' + matchedRef.filename).first()).toBeVisible();
          }
          if (matchedRef.mime_type || matchedRef.source_type) {
            await expect(evidenceDrawer).toContainText(matchedRef.mime_type || matchedRef.source_type);
          }
          if (matchedRef.excerpt) {
            await expect(evidenceDrawer.locator('label:has-text("Document Excerpt Context") + div')).toContainText(matchedRef.excerpt);
          }
          if (matchedRef.excerpt_hash) {
            await expect(evidenceDrawer.locator('text=' + matchedRef.excerpt_hash).first()).toBeVisible();
          }
          if (matchedRef.document_id) {
            await expect(evidenceDrawer).toContainText(matchedRef.document_id);
          }

          // Exact Locator details
          if (matchedRef.locator) {
            if (typeof matchedRef.locator === 'object') {
              if (matchedRef.locator.page != null) {
                await expect(evidenceDrawer).toContainText(`Page ${matchedRef.locator.page}`);
              }
              if (matchedRef.locator.paragraph_id != null) {
                await expect(evidenceDrawer).toContainText(`Paragraph ${matchedRef.locator.paragraph_id}`);
              }
              if (matchedRef.locator.row_index != null) {
                await expect(evidenceDrawer).toContainText(`Row ${matchedRef.locator.row_index}`);
              }
            } else {
              await expect(evidenceDrawer).toContainText(String(matchedRef.locator));
            }
          }

          // Offsets
          const startOffset = matchedRef.source_offset?.start_offset ?? matchedRef.start_offset ?? null;
          const endOffset = matchedRef.source_offset?.end_offset ?? matchedRef.end_offset ?? null;
          if (startOffset != null && endOffset != null) {
            await expect(evidenceDrawer).toContainText(`[${startOffset} - ${endOffset}]`);
          }

          // PART 1.A: Separately labeled Physical File Hash & Normalized Text SHA-256
          const physFileHash = matchedRef.file_sha256 || matchedRef.file_hash;
          if (physFileHash) {
            await expect(evidenceDrawer).toContainText(`Physical File Hash: ${physFileHash}`);
          } else {
            await expect(evidenceDrawer).toContainText('Physical File Hash: Not available');
          }
          if (matchedRef.normalized_text_sha256) {
            await expect(evidenceDrawer).toContainText(`Normalized Text SHA-256: ${matchedRef.normalized_text_sha256}`);
          } else {
            await expect(evidenceDrawer).toContainText('Normalized Text SHA-256: Not available');
          }

          // DIRECTIVE 2 & 3: Escape & Product-Controlled Focus Restoration ONLY (No post-close citationBtn.focus())
          await page.keyboard.press('Escape');
          await expect(evidenceDrawer).not.toBeVisible();
          
          await expect.poll(async () =>
            citationBtn.evaluate((el) => document.activeElement === el)
          ).toBe(true);
        } else {
          // MANDATORY UNLINKED CLAIM ASSERTION (INSIDE EXACT CLAIM CARD)
          await expect(claimCard).toContainText('No attributable EvidenceRef supplied');
          const cardCitations = claimCard.locator('button[aria-label*="citation"]');
          await expect(cardCitations).toHaveCount(0);
        }
      }

      // 5. Row-Labeled Audit Details Drawer Field Assertions & Product-Controlled Focus Restoration
      const auditBtn = page.getByRole('button', { name: /View Audit Details/i });
      await expect(auditBtn).toBeVisible();
      await auditBtn.focus();
      await auditBtn.click();

      const auditDrawer = page.locator('[role="dialog"]:has-text("Audit Details & Provenance")');
      await expect(auditDrawer).toBeVisible();

      // Row-labeled audit drawer field comparisons
      const checkRow = async (label, expectedVal) => {
        const row = auditDrawer.locator(`div:has(span:has-text("${label}"))`).first();
        await expect(row).toBeVisible();
        if (expectedVal && expectedVal !== 'Not available') {
          await expect(row).toContainText(expectedVal);
        } else {
          await expect(row).toContainText('Not available');
        }
      };

      await checkRow('Claim Ledger ID', packet.ledger_id);
      await checkRow('Ledger Revision', packet.ledger_revision != null ? `REV ${packet.ledger_revision}` : 'Not available');
      await checkRow('Candidate Document ID', packet.candidate_document_id);
      await checkRow('Normalized Text SHA-256', packet.normalized_text_sha256);
      await checkRow('File SHA-256', packet.file_sha256 || packet.file_hash);
      await checkRow('Extractor Version', packet.extractor_version);
      await checkRow('Kernel Version', packet.kernel_version || packet.evaluation_version);
      await checkRow('Evaluator Actor ID', packet.actor_id);
      
      // DIRECTIVE 6: Evaluation Timestamp labeled-row assertion
      await checkRow('Evaluation Timestamp', packet.evaluation_timestamp ? new Date(packet.evaluation_timestamp).toUTCString() : 'Not available');

      // DIRECTIVE 2 & 3: Escape & Product-Controlled Focus Restoration ONLY (No post-close auditBtn.focus())
      await page.keyboard.press('Escape');
      await expect(auditDrawer).not.toBeVisible();

      await expect.poll(async () =>
        auditBtn.evaluate((el) => document.activeElement === el)
      ).toBe(true);

      // 6. Governance Notice Copy
      const govNotice = page.locator('p:has-text("CareerTWiN supports evidence review")').first();
      await expect(govNotice).toBeVisible();

      // 7. Mobile 375px Viewport Zero Horizontal Overflow Check
      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(400);

      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalOverflow).toBe(false);

      // Capture desktop and mobile screenshots
      const slug = expectedName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.screenshot({ path: path.join(artifactsDir, `01_${slug}_desktop_1440px.png`), fullPage: true });
      await page.setViewportSize({ width: 375, height: 812 });
      await page.screenshot({ path: path.join(artifactsDir, `02_${slug}_mobile_375px.png`), fullPage: true });
    });
  }

});
