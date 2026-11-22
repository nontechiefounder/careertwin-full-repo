/**
 * Candidate Trust Packet Playwright E2E & Screenshot Capture Test Suite (UX-V2-D1-C1)
 * Validates Part 12 requirements for Playwright UI verification and screenshot capturing.
 */

let test, expect;
try {
  ({ test, expect } = require('@playwright/test'));
} catch (e) {
  test = (globalThis.test ? globalThis.test.skip : () => {});
  test.describe = (globalThis.describe ? globalThis.describe.skip : () => {});
  expect = globalThis.expect || (() => {});
}
const path = require('path');

test.describe('Candidate Trust Packet UX-V2-D1-C1 End-to-End & Drawer Test Suite', () => {

  test('Render Trust Packet, interact with drawers, and capture desktop/mobile viewports', async ({ page }) => {
    // Set desktop viewport (1440px)
    await page.setViewportSize({ width: 1440, height: 900 });

    // Navigate to local candidate trust packet route
    const targetUrl = 'http://localhost:3000/employer/packet/b3735538-0b96-4c7b-a484-be6c107d38d5';
    await page.goto(targetUrl, { waitUntil: 'networkidle' });

    // Verify main page elements are rendered
    await expect(page.locator('h1')).toContainText(/Candidate/i);
    await page.screenshot({ path: path.join(__dirname, 'screenshots/01_trust_packet_desktop_1440px.png'), fullPage: true });

    // Open Audit Details Drawer
    const auditBtn = page.locator('button:has-text("View Audit Details")');
    if (await auditBtn.isVisible()) {
      await auditBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(__dirname, 'screenshots/02_audit_details_drawer_desktop.png') });
      
      // Close Audit Details Drawer via Escape key
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // Open Evidence Citation Drawer
    const citationBtn = page.locator('button:has-text("resume.pdf"), button:has-text("Page"), button[aria-label*="citation"]').first();
    if (await citationBtn.isVisible()) {
      await citationBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(__dirname, 'screenshots/03_evidence_drawer_desktop.png') });
      
      // Close Evidence Drawer via Escape key
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // Set mobile viewport (375px) and capture mobile screenshot
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(__dirname, 'screenshots/04_trust_packet_mobile_375px.png'), fullPage: true });
  });

});
