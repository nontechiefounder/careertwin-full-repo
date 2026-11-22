import { evaluateCandidateTrustPacket, attestTrustedEvidenceProvenance } from '@packages/proof-engine';
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


describe('PART 8 — CUSTOMER JOURNEY VERIFICATION SUITE (CTW-V2-DEMO-CORE-01)', () => {
  const dummyRun = { id: 'run_123', role_title: 'Backend Engineer' };

  it('1. Renaming the same document does not change its assessment or claims', () => {
    const originalDoc = {
      id: 'doc_101',
      candidate_id: 'cand_101',
      org_id: 'org_1',
      filename: 'original_resume.pdf',
      mime_type: 'application/pdf',
      file_sha256: 'hash123',
      normalized_text_sha256: 'normhash123',
      normalized_text: 'Experienced engineer with 5 years of PostgreSQL and Docker deployment.',
      parser_name: 'test-parser',
      created_at: new Date().toISOString()
    };
    const renamedDoc = {
      ...originalDoc,
      filename: 'cand_08_disqualified_fixture.pdf'
    };

    const resOriginal = extractMultiSpanEvidenceAndClaims(originalDoc, dummyRun);
    const resRenamed = extractMultiSpanEvidenceAndClaims(renamedDoc, dummyRun);

    expect(resRenamed.claims.length).toBe(resOriginal.claims.length);
    expect(resRenamed.claims.map(c => c.claim_text)).toEqual(resOriginal.claims.map(c => c.claim_text));
    expect(resRenamed.claims.every(c => !c.is_conflicting)).toBe(true);
  });

  it('2. Different approved roles use their own requirement IDs without fixture leakage', () => {
    const roleA = {
      id: 'run_security',
      role_title: 'Security Lead',
      proof_contract: {
        role_id: 'role_sec_99',
        requirements: [
          { id: 'req_sec_cryptography', title: 'Cryptography', category: 'must_have', keywords: ['crypto', 'encryption', 'ssl'] }
        ]
      }
    };
    const roleB = {
      id: 'run_react',
      role_title: 'Frontend Lead',
      proof_contract: {
        role_id: 'role_fe_88',
        requirements: [
          { id: 'req_fe_react', title: 'React Performance', category: 'must_have', keywords: ['react', 'next.js', 'virtual dom'] }
        ]
      }
    };

    const docCrypto = {
      id: 'doc_c1',
      candidate_id: 'cand_c1',
      org_id: 'org_1',
      filename: 'sec.pdf',
      mime_type: 'application/pdf',
      file_sha256: 'h1',
      normalized_text_sha256: 'nh1',
      normalized_text: 'Implemented end-to-end encryption and SSL cryptography.',
      parser_name: 'test-parser',
      created_at: new Date().toISOString()
    };

    const resA = extractMultiSpanEvidenceAndClaims(docCrypto, roleA);
    const resB = extractMultiSpanEvidenceAndClaims(docCrypto, roleB);

    // In Role A, matched requirement is req_sec_cryptography, NOT mh_1 or mh_2
    expect(resA.claims.some(c => c.requirement_id === 'req_sec_cryptography')).toBe(true);
    expect(resA.claims.every(c => c.requirement_id !== 'mh_1' && c.requirement_id !== 'mh_2')).toBe(true);

    // In Role B, crypto is NOT matching req_fe_react
    expect(resB.claims.some(c => c.requirement_id === 'req_fe_react')).toBe(false);
  });

  it('3. "Resolved a conflict" does not disqualify a candidate', () => {
    const teamConflictDoc = {
      id: 'doc_res_1',
      candidate_id: 'cand_res_1',
      org_id: 'org_1',
      filename: 'leadership_resume.pdf',
      mime_type: 'application/pdf',
      file_sha256: 'h1',
      normalized_text_sha256: 'nh1',
      normalized_text: 'Successfully resolved a conflict between engineering and product teams over roadmap priorities.',
      parser_name: 'test-parser',
      created_at: new Date().toISOString()
    };

    const { claims } = extractMultiSpanEvidenceAndClaims(teamConflictDoc, dummyRun);
    expect(claims.every(c => !c.is_conflicting)).toBe(true);
  });

  it('4. Missing evidence does not become positive proof in deterministic engine', () => {
    const hiringRun = {
      id: 'run_strict',
      role_title: 'Principal Systems Architect',
      proof_contract: {
        role_id: 'role_strict_1',
        requirements: [
          { id: 'req_must_1', title: 'Distributed Systems', category: 'must_have', min_evidence_items: 2 },
          { id: 'req_must_2', title: 'Kernel Optimization', category: 'must_have', min_evidence_items: 1 }
        ]
      }
    };

    const input = {
      hiringRun,
      rawCandidateData: { id: 'cand_partial_1', fit_score: 85 },
      rawClaims: [
        {
          id: 'claim_1',
          claim_text: 'Designed distributed message queue.',
          requirement_id: 'req_must_1',
          status: 'VERIFIED',
          evidence_refs: [{ id: 'ev_1', source_tier: 'document', source_offset: { start_offset: 0, end_offset: 35, excerpt_hash: 'hash1' } }]
        }
      ],
      allowedEvidenceRefs: [
        {
          id: 'ev_1',
          source_type: 'RESUME',
          mime_type: 'application/pdf',
          filename: 'resume.pdf',
          file_sha256: 'sha1',
          normalized_text_sha256: 'norm1',
          source_offset: { start_offset: 0, end_offset: 35 },
          text_span: 'Designed distributed message queue.'
        }
      ]
    };

    const packet = evaluateCandidateTrustPacket(input);

    expect(packet.gate_pass).toBe(false);
    expect(packet.missing_proof.some(p => p.unproven_requirement === 'Kernel Optimization')).toBe(true);
    expect(packet.decision_readiness).not.toBe('INTERVIEW_READY');
  });

  it('5. Packet scores agree with the deterministic proof-engine (fail-closed on unattested input; evidence-derived on attested input)', () => {
    const hiringRun = {
      id: 'run_math_1',
      proof_contract: {
        role_id: 'role_math_1',
        requirements: [
          { id: 'req_math_1', title: 'Go Microservices', category: 'must_have', min_evidence_items: 1 }
        ]
      }
    };

    // A) Unattested RESUME ref with caller-forged fit_score=0.90 & status='VERIFIED' must fail closed
    const unattestedResult = evaluateCandidateTrustPacket({
      hiringRun,
      rawCandidateData: { id: 'cand_math_1', fit_score: 0.90 },
      rawClaims: [
        {
          id: 'claim_m1',
          claim_text: 'Built high scale Go microservices.',
          requirement_id: 'req_math_1',
          status: 'VERIFIED',
          evidence_refs: [{ id: 'ev_m1', source_tier: 'document', source_offset: { start_offset: 0, end_offset: 35, excerpt_hash: 'hashm1' } }]
        }
      ],
      allowedEvidenceRefs: [
        {
          id: 'ev_m1',
          source_type: 'RESUME',
          mime_type: 'application/pdf',
          filename: 'go.pdf',
          file_sha256: 'sha_m1',
          normalized_text_sha256: 'norm_m1',
          source_offset: { start_offset: 0, end_offset: 35 },
          text_span: 'Built high scale Go microservices.'
        }
      ]
    });

    expect(unattestedResult.fit_score).toBeNull();
    expect(unattestedResult.gate_pass).toBe(false);
    expect(unattestedResult.what_is_verified).toEqual([]);
    expect(unattestedResult.claims[0].status).toBe('INFERRED');
    expect(unattestedResult.proof_coverage).toBeGreaterThan(0);

    // B) Server-attested corroborated code evidence yields deterministic score (1.0), ignoring caller fit_score=0.90
    const attestedCodeRef = attestTrustedEvidenceProvenance(
      {
        id: 'ev_code_m1',
        document_id: 'doc_code_m1',
        candidate_id: 'cand_math_1',
        role_id: 'role_math_1',
        org_id: 'org_1',
        filename: 'go_service.go',
        file_type: 'code',
        sha256: 'sha_code_m1',
        source_offset: { page: 1, start_offset: 0, end_offset: 35, excerpt_hash: 'hashm1' },
        source_tier: 'code',
        created_at: '2026-08-20T00:00:00.000Z',
        version: '1.0.0'
      },
      {
        verification_source: 'github_commit_signature',
        document_id: 'doc_code_m1',
        sha256: 'sha_code_m1',
        authorship_verified: true,
        provenance_verified: true
      }
    );

    const engineResult = evaluateCandidateTrustPacket({
      hiringRun,
      rawCandidateData: { id: 'cand_math_1', fit_score: 0.90 },
      rawClaims: [
        {
          id: 'claim_m1',
          claim_text: 'Built high scale Go microservices.',
          requirement_id: 'req_math_1',
          evidence_refs: [attestedCodeRef]
        }
      ],
      allowedEvidenceRefs: [attestedCodeRef],
      evaluatedAt: '2026-08-20T00:00:00.000Z'
    });

    expect(engineResult.fit_score).toBe(1);
    expect(engineResult.fit_score).not.toBe(0.9);
    expect(engineResult.gate_pass).toBe(true);
    expect(engineResult.disqualified).toBe(false);
    expect(engineResult.proof_coverage).toBe(1);
    expect(engineResult.what_is_verified).toHaveLength(1);
    expect(engineResult.spec_version).toBe('1.0.0-kernel');
  });

  it('6. Negated claims such as "no Kubernetes experience" do not satisfy requirements', () => {
    const roleK8s = {
      id: 'run_k8s',
      role_title: 'DevOps Engineer',
      proof_contract: {
        role_id: 'role_k8s_1',
        requirements: [
          { id: 'req_k8s', title: 'Kubernetes', category: 'must_have', keywords: ['kubernetes', 'k8s'] }
        ]
      }
    };

    const docNegated = {
      id: 'doc_neg_1',
      candidate_id: 'cand_neg_1',
      org_id: 'org_1',
      filename: 'resume_negated.pdf',
      mime_type: 'application/pdf',
      file_sha256: 'h_neg',
      normalized_text_sha256: 'nh_neg',
      normalized_text: 'Proficient in Docker and Linux. Have no Kubernetes experience or cluster management.',
      parser_name: 'test-parser',
      created_at: new Date().toISOString()
    };

    const { claims } = extractMultiSpanEvidenceAndClaims(docNegated, roleK8s);

    // Assert that "no Kubernetes experience" was NOT extracted as a positive verified claim
    const positiveK8s = claims.find(c => c.requirement_id === 'req_k8s' && !c.is_negated);
    expect(positiveK8s).toBeUndefined();

    // Assert negated claim was captured with unproven status
    const negatedClaim = claims.find(c => c.is_negated === true);
    expect(negatedClaim).toBeDefined();
    expect(negatedClaim.status).toBe('UNPROVEN');
  });

  it('7. Distinguishes resume self-claims from independently corroborated evidence (code/repo)', () => {
    const roleDev = {
      id: 'run_dev_1',
      proof_contract: {
        role_id: 'role_dev_1',
        requirements: [
          { id: 'req_rust', title: 'Rust Systems Programming', category: 'must_have' }
        ]
      }
    };

    // Case A: Resume text alone (self_claim)
    const resumeDoc = {
      id: 'doc_resume',
      candidate_id: 'cand_self',
      org_id: 'org_1',
      filename: 'resume.pdf',
      mime_type: 'application/pdf',
      file_sha256: 'h_res',
      normalized_text_sha256: 'nh_res',
      normalized_text: 'Experienced in Rust systems programming and high performance networking.',
      parser_metadata: { is_self_claim: true },
      created_at: new Date().toISOString()
    };

    const resA = extractMultiSpanEvidenceAndClaims(resumeDoc, roleDev);
    expect(resA.evidenceRefs[0].source_tier).toBe('self_claim');

    // Case B: Verified code repository artifact
    const codeDoc = {
      id: 'doc_code',
      candidate_id: 'cand_code',
      org_id: 'org_1',
      filename: 'main.rs',
      mime_type: 'application/code',
      file_sha256: 'h_code',
      normalized_text_sha256: 'nh_code',
      normalized_text: 'fn main() { println!("Rust systems programming production service"); }',
      created_at: new Date().toISOString()
    };

    const resB = extractMultiSpanEvidenceAndClaims(codeDoc, roleDev);
    expect(resB.evidenceRefs[0].source_tier).toBe('code');
  });

  it('8. Candidate with zero verified claims produces explicit insufficient-evidence / not-assessed state without arbitrary 0.85 fallback', () => {
    const hiringRun = {
      id: 'run_unverified',
      proof_contract: {
        role_id: 'role_unverified_1',
        requirements: [
          { id: 'req_ai', title: 'Deep Learning Kernel Optimization', category: 'must_have', min_evidence_items: 1 }
        ]
      }
    };

    // Candidate data with NO verified claims and legacy/null fit_score
    const input = {
      hiringRun,
      rawCandidateData: { id: 'cand_no_proof', fit_score: null },
      rawClaims: [],
      allowedEvidenceRefs: []
    };

    const result = evaluateCandidateTrustPacket(input);

    // Must return explicit null fit_score and Insufficient Evidence label
    expect(result.fit_score).toBeNull();
    expect(result.role_fit_label).toBe('Insufficient Evidence');
    expect(result.decision_readiness).toBe('INSUFFICIENT EVIDENCE');
    expect(result.gate_pass).toBe(false);
  });
});
