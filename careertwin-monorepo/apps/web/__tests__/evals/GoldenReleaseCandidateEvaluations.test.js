import { describe, test, expect } from 'vitest';
import {
  calculateDecoupledMetrics,
  sanitizeProtectedSignals,
  classifyClaimEvidence,
  generateMinimumMissingProof,
  EvaluationOutputSchema
} from '../../lib/evaluations.js';

/**
 * Production-Linked Golden Release Candidate (RC) Evaluation Suite (RC-C1.1)
 * 
 * Invokes real production modules from `lib/evaluations.js` covering all 6 cases:
 * 1. Strong fit / strong proof (EVIDENCE READY)
 * 2. High fit / weak proof (Decoupled metrics -> NEEDS PROOF)
 * 3. Team contribution / ownership ambiguity (INFERRED)
 * 4. Conflicting evidence (CONFLICTING)
 * 5. Insufficient evidence / Minimum Missing Proof
 * 6. Protected-signal invariance (Bias Invariance)
 * 7. Zod Schema Validation
 */

describe('Golden Release Candidate Evaluation Suite (Production-Linked)', () => {

  // Case 1: Strong fit / strong proof
  test('Case 1: Strong fit / strong proof has high fit score, high proof strength, and explicit provenance', () => {
    const metrics = calculateDecoupledMetrics(0.92, 0.88, 0, 5, false);
    const claimResult = classifyClaimEvidence('Built distributed Postgres cluster', [
      { source_document_id: 'doc-1', source_offset: 'resume.pdf:L42-L58', excerpt_hash: 'a1b2c3d4', text_span: 'Built distributed Postgres cluster' }
    ]);

    expect(metrics.decision_readiness).toBe('EVIDENCE READY');
    expect(metrics.role_fit_label).toBe('Strong');
    expect(metrics.proof_strength_label).toBe('Strong');
    expect(metrics.uncertainty).toBeLessThanOrEqual(0.15);
    expect(claimResult.status).toBe('SUPPORTED');
    expect(claimResult.provenance).toHaveProperty('source_offset');
    expect(claimResult.provenance).toHaveProperty('excerpt_hash');
  });

  // Case 2: Strong fit / weak proof (NEEDS PROOF)
  test('Case 2: Strong fit / weak proof resolves to NEEDS PROOF and High Uncertainty', () => {
    const metrics = calculateDecoupledMetrics(0.90, 0.15, 3, 4, false);

    expect(metrics.decision_readiness).toBe('NEEDS PROOF');
    expect(metrics.decision_readiness).not.toBe('EVIDENCE READY');
    expect(metrics.role_fit_label).toBe('Strong');
    expect(metrics.proof_strength_label).toBe('Limited');
    expect(metrics.uncertainty).toBeGreaterThanOrEqual(0.60);
  });

  // Case 3: Ownership ambiguity
  test('Case 3: Ownership ambiguity (team accomplishment) resolves to INFERRED', () => {
    const claimResult = classifyClaimEvidence('Team built high-throughput event bus handling 100k QPS', [
      { text_span: 'Company backend team engineered high-throughput bus' }
    ]);

    expect(claimResult.status).toBe('INFERRED');
    expect(claimResult.status).not.toBe('SUPPORTED');
  });

  // Case 4: Conflicting evidence
  test('Case 4: Conflicting evidence is explicitly classified as CONFLICTING', () => {
    const claimResult = classifyClaimEvidence('Claims 8 years of React experience', [
      { source_document_id: 'doc-resume', source_offset: 'resume.pdf:L10', excerpt_hash: 'h-10', is_conflicting: true }
    ]);

    expect(claimResult.status).toBe('CONFLICTING');
  });

  // Case 5: Insufficient evidence & Minimum Missing Proof
  test('Case 5: Insufficient evidence generates actionable Minimum Missing Proof items', () => {
    const missingProofItems = generateMinimumMissingProof(
      ['PostgreSQL query optimization & indexing'],
      ['Resume lists general database concepts'],
      []
    );

    expect(missingProofItems.length).toBe(1);
    const item = missingProofItems[0];
    expect(item.unproven_requirement).toBe('PostgreSQL query optimization & indexing');
    expect(item.why_insufficient).toBeTruthy();
    expect(item.minimum_next_proof).toBeTruthy();
    expect(item.interview_probe).toBeTruthy();
  });

  // Case 6: Protected-signal trap (Bias Invariance)
  test('Case 6: Protected attributes are completely stripped before scoring', () => {
    const rawCandidate = {
      skills: ['Python', 'PostgreSQL', 'FastAPI'],
      experience_years: 5,
      age: 48,
      gender: 'Female',
      race: 'Underrepresented Minority',
      graduation_year: 1998,
      postal_code: '94102',
      photo_url: 'https://example.com/photo.jpg'
    };

    const sanitized = sanitizeProtectedSignals(rawCandidate);

    expect(sanitized).toHaveProperty('skills');
    expect(sanitized).toHaveProperty('experience_years');
    expect(sanitized).not.toHaveProperty('age');
    expect(sanitized).not.toHaveProperty('gender');
    expect(sanitized).not.toHaveProperty('race');
    expect(sanitized).not.toHaveProperty('graduation_year');
    expect(sanitized).not.toHaveProperty('postal_code');
    expect(sanitized).not.toHaveProperty('photo_url');
  });

  // Case 7: Zod Schema Enforcement Test
  test('Case 7: Zod Schema Validator validates evaluation output structure strictly', () => {
    const evalData = {
      ...calculateDecoupledMetrics(0.90, 0.15, 3, 4, false),
      missing_proof: generateMinimumMissingProof(['PostgreSQL tuning'], [], [])
    };

    const parsed = EvaluationOutputSchema.safeParse(evalData);
    expect(parsed.success).toBe(true);
  });

});
