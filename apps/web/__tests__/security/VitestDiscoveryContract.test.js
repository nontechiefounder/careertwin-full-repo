import { describe, it, expect } from 'vitest';
import * as glob from 'glob';
import path from 'path';
import config from '../../vitest.config.mjs';

describe('Vitest Discovery Contract (UX-V2-D4-C1)', () => {
  it('validates the effective exported vitest.config.mjs rules directly', () => {
    const webRoot = path.resolve(__dirname, '../../');
    const globFn = glob.globSync || glob.sync || (glob.default && glob.default.sync);

    // Inspect the actual exported config object
    const testConfig = config.test || {};
    const includes = testConfig.include || [];
    const excludes = testConfig.exclude || [];

    // Verify config properties directly
    expect(includes).toContain('__tests__/**/*.{test,spec}.{js,jsx,ts,tsx}');
    expect(includes).toContain('../../packages/**/*.{test,spec}.{js,jsx,ts,tsx}');
    expect(excludes).toContain('**/*Assertions.test.js');
    expect(excludes).toContain('**/*E2E.test.js');
    expect(excludes).toContain('**/*Policy.test.js');

    // Collect files using actual config include pattern
    const webMatches = globFn('__tests__/**/*.{test,spec}.{js,jsx,ts,tsx}', { cwd: webRoot });

    // Verify Playwright suites match explicit exclude patterns
    const playwrightFiles = webMatches.filter(f => f.endsWith('Assertions.test.js'));
    expect(playwrightFiles.length).toBe(4);

    // Required Vitest test files that MUST remain included
    const requiredSuites = [
      'ProofContractReadiness.test.js',
      'SourcingSessionSecurity.test.js',
      'HiringRunSecurity.test.js',
      'ShortlistSecurity.test.js',
      'EmployerWorkspaceSecurity.test.js',
      'CandidateDisplayNormalization.test.js',
      'CandidateTrustPacketUI.test.jsx',
      'CandidateShortlistUI.test.jsx',
      'ReleaseBlockerVerification.test.jsx',
      'IngestionAndProvenanceIntegrity.test.jsx',
      'Core08IntegrityAndAudit.test.jsx',
      'Core09TransactionalDecisionsAndConcurrency.test.jsx',
      'Core09UploadAndProvenanceIntegrity.test.jsx',
      'Core09RouteSecurityAndDecoupling.test.js',
      'researchQA.test.js',
      'ResearchQAPanel.test.jsx',
      'ContextEvidenceFoundation.test.js',
      'ContextEvidencePanelStaleRunIsolation.test.jsx',
      'ProtectedDatabaseGuard.test.js',
      'CrossLanguageProxyContractUnit.test.js',
      'CrossLanguageLiveIntegration.test.js',
      'DataVertexAdapter.test.js',
      'Track1IntegrityRepairs.test.js',
      'DataVertexRoutesAuth.test.js',
      'CreditLedgerPrivilegeSecurity.test.js',
      'ScoreScaleAndEvidenceDedup.test.js',
      'DeviceSupportUnit.test.jsx',
      'V11SecurityRepairs.test.js',
    ];

    for (const suite of requiredSuites) {
      const found = webMatches.some(f => f.endsWith(suite));
      expect(found).toBe(true);
    }

    // Ensure total Vitest test files count in apps/web matches expected suites (excluding Playwright specs)
    const webVitestSuites = webMatches.filter(
      f => !f.endsWith('Assertions.test.js') && !f.endsWith('E2E.test.js') && !f.endsWith('Policy.test.js')
    );
    expect(webVitestSuites.length).toBe(68);
  });
});
