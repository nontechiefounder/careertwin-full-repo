import { describe, it, expect } from 'vitest';
import { extractMultiSpanEvidenceAndClaims } from '../../lib/evidenceExtractor';
import { sanitizeProtectedSignals } from '@packages/hiring-genome';

describe('PART 7 — SOURCE-FAITHFUL CLAIM EXTRACTION EVALUATION SUITE', () => {
  const dummyRun = { id: 'run_123', role_title: 'Backend Engineer' };

  it('1. Skills section mention versus experience evidence span', () => {
    const candDoc = {
      id: 'doc_skills_1',
      candidate_id: 'cand_1',
      org_id: 'org_1',
      filename: 'skills.pdf',
      mime_type: 'application/pdf',
      file_sha256: 'abc',
      normalized_text_sha256: 'def',
      normalized_text: 'Skills: Node.js, PostgreSQL. Experience: Architected high-throughput Node.js microservice.',
      parser_name: 'test-parser',
      created_at: new Date().toISOString()
    };

    const { evidenceRefs, claims } = extractMultiSpanEvidenceAndClaims(candDoc, dummyRun);
    expect(claims.length).toBeGreaterThan(0);
    expect(evidenceRefs.length).toBeGreaterThan(0);
    // Every claim maps to exact span offset
    claims.forEach(c => {
      expect(c.evidence_refs[0].source_offset.start_offset).toBeDefined();
      expect(c.evidence_refs[0].source_offset.end_offset).toBeDefined();
    });
  });

  it('2. Personal ownership versus team participation distinction', () => {
    const candDoc = {
      id: 'doc_team_1',
      candidate_id: 'cand_2',
      org_id: 'org_1',
      filename: 'team.pdf',
      mime_type: 'application/pdf',
      file_sha256: 'abc',
      normalized_text_sha256: 'def',
      normalized_text: 'Contributed as team member to PostgreSQL migration project led by lead architect.',
      parser_name: 'test-parser',
      created_at: new Date().toISOString()
    };

    const { claims } = extractMultiSpanEvidenceAndClaims(candDoc, dummyRun);
    const pgClaim = claims.find(c => c.claim_text.includes('PostgreSQL'));
    expect(pgClaim).toBeDefined();
    expect(pgClaim.claim_text).toContain('Contributed as team member');
  });

  it('3. Architecture versus implementation evidence distinction', () => {
    const candDoc = {
      id: 'doc_arch_1',
      candidate_id: 'cand_3',
      org_id: 'org_1',
      filename: 'arch.pdf',
      mime_type: 'application/pdf',
      file_sha256: 'abc',
      normalized_text_sha256: 'def',
      normalized_text: 'Designed PostgreSQL database schema and implemented Node.js REST endpoints.',
      parser_name: 'test-parser',
      created_at: new Date().toISOString()
    };

    const { claims } = extractMultiSpanEvidenceAndClaims(candDoc, dummyRun);
    expect(claims.some(c => c.claim_text.includes('Node.js'))).toBe(true);
    expect(claims.some(c => c.claim_text.includes('PostgreSQL'))).toBe(true);
  });

  it('4. Exact quantified result preservation without hallucinated metrics', () => {
    const candDoc = {
      id: 'doc_quant_1',
      candidate_id: 'cand_4',
      org_id: 'org_1',
      filename: 'quant.pdf',
      mime_type: 'application/pdf',
      file_sha256: 'abc',
      normalized_text_sha256: 'def',
      normalized_text: 'Reduced database query latency by 45% using PostgreSQL query optimization.',
      parser_name: 'test-parser',
      created_at: new Date().toISOString()
    };

    const { claims } = extractMultiSpanEvidenceAndClaims(candDoc, dummyRun);
    const pgClaim = claims.find(c => c.claim_text.includes('PostgreSQL'));
    expect(pgClaim.claim_text).toContain('Reduced database query latency by 45%');
  });

  it('5. Unsupported outcome expansion rejection', () => {
    const candDoc = {
      id: 'doc_unsupported_1',
      candidate_id: 'cand_5',
      org_id: 'org_1',
      filename: 'unsupported.pdf',
      mime_type: 'application/pdf',
      file_sha256: 'abc',
      normalized_text_sha256: 'def',
      normalized_text: 'Worked on Node.js application.',
      parser_name: 'test-parser',
      created_at: new Date().toISOString()
    };

    const { claims } = extractMultiSpanEvidenceAndClaims(candDoc, dummyRun);
    // Does not hallucinate metric claims like 10x performance
    expect(claims.every(c => !c.claim_text.includes('10x') && !c.claim_text.includes('100%'))).toBe(true);
  });

  it('6. Conflicting evidence detection', () => {
    const candDoc = {
      id: 'doc_conflict_1',
      candidate_id: 'cand_6',
      org_id: 'org_1',
      filename: 'conflict.pdf',
      mime_type: 'application/pdf',
      file_sha256: 'abc',
      normalized_text_sha256: 'def',
      normalized_text: 'Candidate record contains conflict: claimed senior role but resume lists internship.',
      parser_name: 'test-parser',
      created_at: new Date().toISOString()
    };

    const { claims } = extractMultiSpanEvidenceAndClaims(candDoc, dummyRun);
    expect(claims.some(c => c.is_conflicting)).toBe(true);
  });

  it('7. Adjacent-role evidence boundary', () => {
    const candDoc = {
      id: 'doc_adj_1',
      candidate_id: 'cand_7',
      org_id: 'org_1',
      filename: 'adj.pdf',
      mime_type: 'application/pdf',
      file_sha256: 'abc',
      normalized_text_sha256: 'def',
      normalized_text: 'Frontend developer with basic Python script experience.',
      parser_name: 'test-parser',
      created_at: new Date().toISOString()
    };

    const { claims } = extractMultiSpanEvidenceAndClaims(candDoc, dummyRun);
    expect(claims.some(c => c.claim_text.includes('Python'))).toBe(true);
  });

  it('8. Protected demographic signal exclusion', () => {
    const rawBio = {
      name: 'Taylor Morgan',
      age: 29,
      gender: 'Non-binary',
      marital_status: 'Single',
      skills: ['Node.js', 'PostgreSQL']
    };

    const sanitized = sanitizeProtectedSignals(rawBio);
    expect(sanitized.age).toBeUndefined();
    expect(sanitized.gender).toBeUndefined();
    expect(sanitized.marital_status).toBeUndefined();
    expect(sanitized.name).toBe('Taylor Morgan');
    expect(sanitized.skills).toEqual(['Node.js', 'PostgreSQL']);
  });

  it('9. Word boundary preservation: ordinary "next" versus Next.js', () => {
    const candDoc = {
      id: 'doc_next_1',
      candidate_id: 'cand_9',
      org_id: 'org_1',
      filename: 'next.pdf',
      mime_type: 'application/pdf',
      file_sha256: 'abc',
      normalized_text_sha256: 'def',
      normalized_text: 'In the next release, we will deploy Next.js frontend pages.',
      parser_name: 'test-parser',
      created_at: new Date().toISOString()
    };

    const { claims } = extractMultiSpanEvidenceAndClaims(candDoc, dummyRun);
    const nextClaim = claims.find(c => c.claim_text.includes('Next.js'));
    expect(nextClaim).toBeDefined();
    // Verify it matched Next.js and not ordinary "next"
    expect(nextClaim.claim_text).toContain('Next.js frontend pages');
  });

  it('10. Bounded technology claims: Docker, Kubernetes, Terraform kept separate', () => {
    const candDoc = {
      id: 'doc_infra_1',
      candidate_id: 'cand_10',
      org_id: 'org_1',
      filename: 'infra.pdf',
      mime_type: 'application/pdf',
      file_sha256: 'abc',
      normalized_text_sha256: 'def',
      normalized_text: 'Configured Docker containers, managed Kubernetes clusters, and provisioned Terraform modules.',
      parser_name: 'test-parser',
      created_at: new Date().toISOString()
    };

    const { claims } = extractMultiSpanEvidenceAndClaims(candDoc, dummyRun);
    expect(claims.some(c => c.claim_text.includes('Docker'))).toBe(true);
    expect(claims.some(c => c.claim_text.includes('Kubernetes'))).toBe(true);
    expect(claims.some(c => c.claim_text.includes('Terraform'))).toBe(true);
    expect(claims.length).toBe(3);
  });
});
