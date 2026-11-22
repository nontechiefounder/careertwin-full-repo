import { describe, it, expect } from 'vitest';
import { evaluateProofContractReadiness } from '@/lib/proofContractReadiness';

describe('evaluateProofContractReadiness — shared utility (UX-V2-D4)', () => {
  // 1. Complete contract
  it('1. isComplete=true when title, job_description, and must_haves are all present', () => {
    const result = evaluateProofContractReadiness({
      role_title: 'Backend Engineer',
      job_description: 'Build APIs at scale with Python and FastAPI.',
      must_haves: ['Python 3.10+', 'FastAPI'],
    });
    expect(result.isComplete).toBe(true);
    expect(result.missingFields).toHaveLength(0);
  });

  // 2. Missing title
  it('2. isComplete=false and missingFields contains role_title when title is missing', () => {
    const result = evaluateProofContractReadiness({
      role_title: '',
      job_description: 'Build APIs at scale with Python and FastAPI.',
      must_haves: ['Python 3.10+'],
    });
    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toContain('role_title');
  });

  // 3. Missing job description
  it('3. isComplete=false when job_description is missing and no role_summary', () => {
    const result = evaluateProofContractReadiness({
      role_title: 'Backend Engineer',
      job_description: '',
      must_haves: ['Python 3.10+'],
    });
    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toContain('job_description');
  });

  // 4. Short description rejected
  it('4. isComplete=false when job_description is shorter than 10 chars', () => {
    const result = evaluateProofContractReadiness({
      role_title: 'Backend Engineer',
      job_description: 'Short',
      must_haves: ['Python'],
    });
    expect(result.isComplete).toBe(false);
  });

  // 5. role_summary accepted as alternative
  it('5. isComplete=true when role_summary >= 10 chars and must_haves provided', () => {
    const result = evaluateProofContractReadiness({
      role_title: 'Data Engineer',
      role_summary: 'Build pipelines for internal analytics.',
      must_haves: ['dbt', 'Postgres'],
    });
    expect(result.isComplete).toBe(true);
  });

  // 6. Empty must_haves array
  it('6. isComplete=false when must_haves is an empty array', () => {
    const result = evaluateProofContractReadiness({
      role_title: 'Backend Engineer',
      job_description: 'Build APIs at scale with Python and FastAPI.',
      must_haves: [],
    });
    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toContain('must_haves');
  });

  // 7. explicit_requirements as alternative to must_haves
  it('7. isComplete=true when explicit_requirements is provided instead of must_haves', () => {
    const result = evaluateProofContractReadiness({
      role_title: 'Backend Engineer',
      job_description: 'Build APIs at scale with Python and FastAPI.',
      explicit_requirements: ['5+ years Python'],
    });
    expect(result.isComplete).toBe(true);
  });

  // 8. Null runData does not throw
  it('8. returns isComplete=false for null input without throwing', () => {
    const result = evaluateProofContractReadiness(null);
    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toHaveLength(3);
  });

  // 9. Undefined runData does not throw
  it('9. returns isComplete=false for undefined input without throwing', () => {
    const result = evaluateProofContractReadiness(undefined);
    expect(result.isComplete).toBe(false);
  });

  // 10. All three fields missing lists all three in missingFields
  it('10. all three missing fields listed when runData is empty object', () => {
    const result = evaluateProofContractReadiness({});
    expect(result.isComplete).toBe(false);
    expect(result.missingFields).toContain('role_title');
    expect(result.missingFields).toContain('job_description');
    expect(result.missingFields).toContain('must_haves');
  });
});
