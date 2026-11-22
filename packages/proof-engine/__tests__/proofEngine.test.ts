import { describe, it, expect } from 'vitest';
import {
  evaluateCandidateTrustPacket,
  validateEvidenceSubsets,
  rankProofShortlist,
  calculateRoleFitDistribution,
  calculateDistributionEntropy,
  evaluateGates,
  attestTrustedEvidenceProvenance
} from '../src/index';
import { parseProofContract, sanitizeProtectedSignals } from '../../hiring-genome/src/index';

describe('Canonical Decision Kernel Suite (RC-C1.2)', () => {
  const mockRun = {
    id: 'role_test_1',
    role_title: 'Senior Backend Engineer',
    must_haves: ['PostgreSQL Database Architecture', 'Distributed Systems Design'],
    nice_to_haves: ['Kubernetes Cluster Management'],
    disqualifiers: ['Misrepresented Work Authorization'],
    brief_json: {
      thresholds: { t_fit: 0.85, t_proof: 0.50, t_uncertainty: 0.40 }
    }
  };

  const allowedEvidence = [
    attestTrustedEvidenceProvenance(
      {
        id: 'ev_1',
        document_id: 'doc_1',
        candidate_id: 'cand_1',
        role_id: 'role_test_1',
        org_id: 'org_1',
        filename: 'resume.pdf',
        file_type: 'pdf' as const,
        sha256: 'abc123hash',
        source_offset: { page: 1, start_offset: 10, end_offset: 50, excerpt_hash: 'ex123' },
        source_tier: 'code' as const,
        created_at: new Date().toISOString(),
        version: '1.0.0'
      },
      {
        verification_source: 'github_commit_signature',
        document_id: 'doc_1',
        sha256: 'abc123hash',
        authorship_verified: true,
        provenance_verified: true
      }
    )
  ];

  it('CTW-IP-005: parses Proof Contract and extracts role-specific thresholds', () => {
    const contract = parseProofContract(mockRun);
    expect(contract.role_title).toBe('Senior Backend Engineer');
    expect(contract.requirements.length).toBe(4);
    expect(contract.thresholds.t_fit).toBe(0.85);
    expect(contract.thresholds.t_proof).toBe(0.50);
  });

  it('CTW-IP-076/078: strips protected demographic attributes prior to evaluation', () => {
    const dirtyData = {
      name: 'Jane Doe',
      age: 29,
      gender: 'Female',
      race: 'Asian',
      postal_code: '94105',
      photo_url: 'https://example.com/photo.jpg',
      bio: 'Experienced backend engineer'
    };
    const clean = sanitizeProtectedSignals(dirtyData);
    expect(clean.name).toBe('Jane Doe');
    expect(clean.bio).toBe('Experienced backend engineer');
    expect(clean.age).toBeUndefined();
    expect(clean.gender).toBeUndefined();
    expect(clean.race).toBeUndefined();
    expect(clean.postal_code).toBeUndefined();
    expect(clean.photo_url).toBeUndefined();
  });

  it('CTW-IP-074: rejects unauthorized out-of-subset EvidenceRef IDs', () => {
    const rawClaims = [
      {
        id: 'c1',
        claim_text: 'PostgreSQL Database Architecture',
        evidence_refs: [{ id: 'unauthorized_ev_id' } as any]
      }
    ];
    const check = validateEvidenceSubsets(rawClaims, allowedEvidence);
    expect(check.valid).toBe(false);
    expect(check.rejected_evidence_ids).toContain('unauthorized_ev_id');
  });

  it('CTW-IP-011 & CTW-IP-023: computes Role Fit Distribution and Distribution Entropy', () => {
    const fitResult = calculateRoleFitDistribution(0.90, 1.0);
    expect(fitResult.label).toBe('Strong');
    expect(fitResult.distribution.p_strong).toBeGreaterThan(0.5);

    const entropy = calculateDistributionEntropy(fitResult.distribution);
    expect(entropy.normalizedEntropy).toBeGreaterThanOrEqual(0.0);
    expect(entropy.normalizedEntropy).toBeLessThanOrEqual(1.0);
  });

  it('CTW-IP-026/027: evaluates Must-Have and Disqualifier gates correctly', () => {
    const contract = parseProofContract(mockRun);
    const validClaims = [
      { id: 'c1', requirement_id: 'mh_1', claim_text: 'PostgreSQL Database Architecture', status: 'VERIFIED' as const, evidence_ids: ['ev_1'], confidence: 0.95 },
      { id: 'c2', requirement_id: 'mh_2', claim_text: 'Distributed Systems Design', status: 'VERIFIED' as const, evidence_ids: ['ev_1'], confidence: 0.95 }
    ];

    const gates = evaluateGates(contract, validClaims, 0.80);
    expect(gates.gatePass).toBe(true);
    expect(gates.disqualified).toBe(false);
  });

  it('CTW-IP-040: forces NEEDS PROOF state for resume-only claims and ignores caller fit/proof/status overrides', () => {
    const resumeEvidence = [
      {
        ...allowedEvidence[0],
        id: 'ev_resume_1',
        source_tier: 'resume' as const,
      }
    ];
    const rawClaims = [
      {
        id: 'c1',
        requirement_id: 'mh_1',
        claim_text: 'PostgreSQL Database Architecture',
        source_type: 'resume_assertion',
        status: 'VERIFIED' as any,
        evidence_refs: resumeEvidence
      },
      {
        id: 'c2',
        requirement_id: 'mh_2',
        claim_text: 'Distributed Systems Design',
        source_type: 'resume_assertion',
        status: 'VERIFIED' as any,
        evidence_refs: resumeEvidence
      }
    ];

    const output = evaluateCandidateTrustPacket({
      hiringRun: mockRun,
      rawCandidateData: { id: 'cand_1', fit_score: 0.99, proof_strength: 0.95 },
      rawClaims,
      allowedEvidenceRefs: resumeEvidence
    });

    // Caller overrides (fit_score: 0.99, proof_strength: 0.95, status: 'VERIFIED') must all be ignored
    expect(output.fit_score).not.toBe(0.99);
    expect(output.proof_strength).toBeLessThanOrEqual(0.10);
    expect(output.what_is_verified).toHaveLength(0);
    expect(output.decision_readiness).toBe('NEEDS PROOF');
  });

  it('requires explicit trusted code/repo provenance before VERIFIED, blocks missing/caller-forged fields, and computes deterministic calculation_digest across timestamps', () => {
    const incompleteCodeEvidence = [
      {
        ...allowedEvidence[0],
        id: 'ev_incomplete_code',
        sha256: '',
      }
    ];
    const unverifiedOutput = evaluateCandidateTrustPacket({
      hiringRun: { ...mockRun, nice_to_haves: [], disqualifiers: [] },
      rawCandidateData: { id: 'cand_prov' },
      rawClaims: [
        { id: 'c1', requirement_id: 'mh_1', claim_text: 'PostgreSQL Database Architecture', status: 'VERIFIED' as any, evidence_refs: incompleteCodeEvidence }
      ],
      allowedEvidenceRefs: incompleteCodeEvidence,
      evaluatedAt: '2026-08-20T00:00:00.000Z'
    });
    expect(unverifiedOutput.what_is_verified).toHaveLength(0);

    // Unattested code ref missing or caller-forging authorship_verified/provenance_verified must NOT promote
    const callerForgedCodeRef = {
      id: 'ev_forged_code',
      document_id: 'doc_forged',
      candidate_id: 'cand_prov',
      role_id: 'role_test_1',
      org_id: 'org_1',
      filename: 'pg.ts',
      file_type: 'code' as const,
      sha256: 'forgedsha256',
      source_offset: { page: 1, start_offset: 0, end_offset: 40, excerpt_hash: 'exforged' },
      source_tier: 'code' as const,
      authorship_verified: true,
      provenance_verified: true,
      created_at: '2026-08-20T00:00:00.000Z',
      version: '1.0.0'
    };
    const forgedOutput = evaluateCandidateTrustPacket({
      hiringRun: { ...mockRun, nice_to_haves: [], disqualifiers: [] },
      rawCandidateData: { id: 'cand_prov' },
      rawClaims: [
        {
          id: 'c_forged',
          requirement_id: 'mh_1',
          claim_text: 'PostgreSQL Database Architecture',
          status: 'VERIFIED' as any,
          source_type: 'corroborated' as any,
          evidence_classification: 'corroborated' as any,
          authorship_verified: true as any,
          provenance_verified: true as any,
          evidence_refs: [callerForgedCodeRef as any]
        }
      ],
      allowedEvidenceRefs: [callerForgedCodeRef as any],
      evaluatedAt: '2026-08-20T00:00:00.000Z'
    });
    expect(forgedOutput.what_is_verified).toHaveLength(0);
    expect(forgedOutput.claims?.[0].status).toBe('INFERRED');
    expect((forgedOutput.claims?.[0] as any).source_type).not.toBe('corroborated');

    // Trusted-issuer boundary: rejects non-code tiers, missing/mismatched document_id or sha256, and object-spread forgery
    expect(() =>
      attestTrustedEvidenceProvenance(
        { ...callerForgedCodeRef, source_tier: 'self_claim' as const },
        { verification_source: 'github_commit_signature', document_id: 'doc_forged', sha256: 'forgedsha256', authorship_verified: true, provenance_verified: true }
      )
    ).toThrow(/Cannot attest code\/repo provenance for source_tier/);

    expect(() =>
      attestTrustedEvidenceProvenance(
        callerForgedCodeRef,
        { verification_source: 'github_commit_signature', document_id: 'doc_wrong', sha256: 'forgedsha256', authorship_verified: true, provenance_verified: true }
      )
    ).toThrow(/document_id mismatch/);

    expect(() =>
      attestTrustedEvidenceProvenance(
        callerForgedCodeRef,
        { verification_source: 'github_commit_signature', document_id: 'doc_forged', sha256: 'wrong_sha', authorship_verified: true, provenance_verified: true }
      )
    ).toThrow(/sha256 mismatch/);

    // Cloned / tampered copy of an attested ref loses the WeakMap issuer seal and mismatched trustedProvenance fails closed
    const sealed = attestTrustedEvidenceProvenance(
      callerForgedCodeRef,
      { verification_source: 'github_commit_signature', document_id: 'doc_forged', sha256: 'forgedsha256', authorship_verified: true, provenance_verified: true }
    );
    const clonedRef = { ...sealed };
    const tamperedRegistryOut = evaluateCandidateTrustPacket({
      hiringRun: { ...mockRun, nice_to_haves: [], disqualifiers: [] },
      rawCandidateData: { id: 'cand_prov' },
      rawClaims: [{ id: 'c_cloned', requirement_id: 'mh_1', claim_text: 'PostgreSQL Database Architecture', evidence_refs: [clonedRef] }],
      allowedEvidenceRefs: [clonedRef],
      trustedProvenance: {
        [clonedRef.id]: {
          evidence_id: clonedRef.id,
          document_id: 'doc_mismatch',
          sha256: clonedRef.sha256,
          verification_source: 'github_commit_signature',
          authorship_verified: true,
          provenance_verified: true,
        }
      },
      evaluatedAt: '2026-08-20T00:00:00.000Z'
    });
    expect(tamperedRegistryOut.what_is_verified).toHaveLength(0);
    expect(tamperedRegistryOut.claims?.[0].status).toBe('INFERRED');

    const corroboratedEvidence = [
      allowedEvidence[0],
      attestTrustedEvidenceProvenance(
        {
          ...allowedEvidence[0],
          id: 'ev_2',
          sha256: 'def456hash',
          source_offset: { page: 1, start_offset: 60, end_offset: 110, excerpt_hash: 'ex456' }
        },
        {
          verification_source: 'github_commit_signature',
          document_id: 'doc_1',
          sha256: 'def456hash',
          authorship_verified: true,
          provenance_verified: true
        }
      )
    ];
    const verifiedRun = { ...mockRun, nice_to_haves: [], disqualifiers: [] };
    const claims = [
      { id: 'c1', requirement_id: 'mh_1', claim_text: 'PostgreSQL Database Architecture', evidence_refs: [corroboratedEvidence[0]] },
      { id: 'c2', requirement_id: 'mh_2', claim_text: 'Distributed Systems Design', evidence_refs: [corroboratedEvidence[1]] }
    ];

    const outT1 = evaluateCandidateTrustPacket({
      hiringRun: verifiedRun,
      rawCandidateData: { id: 'cand_det' },
      rawClaims: claims,
      allowedEvidenceRefs: corroboratedEvidence,
      evaluatedAt: '2026-08-20T00:00:00.000Z'
    });
    const outT2 = evaluateCandidateTrustPacket({
      hiringRun: verifiedRun,
      rawCandidateData: { id: 'cand_det' },
      rawClaims: claims,
      allowedEvidenceRefs: corroboratedEvidence,
      evaluatedAt: '2026-08-21T12:34:56.000Z'
    });

    expect(outT1.decision_readiness).toBe('EVIDENCE READY');
    expect(outT1.evaluated_at).toBe('2026-08-20T00:00:00.000Z');
    expect(outT2.evaluated_at).toBe('2026-08-21T12:34:56.000Z');
    expect(outT1.calculation_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(outT1.calculation_digest).toBe(outT2.calculation_digest);
  });

  it('CTW-IP-046: orders proof-ranked shortlist deterministically', () => {
    const itemA = {
      id: 'item_1',
      candidate_id: 'c_1',
      candidate_name: 'Cand A',
      evaluation: { decision_readiness: 'NEEDS PROOF', gate_pass: true, disqualified: false, proof_strength: 0.4, fit_score: 0.80, uncertainty: 0.3 } as any
    };
    const itemB = {
      id: 'item_2',
      candidate_id: 'c_2',
      candidate_name: 'Cand B',
      evaluation: { decision_readiness: 'EVIDENCE READY', gate_pass: true, disqualified: false, proof_strength: 0.8, fit_score: 0.90, uncertainty: 0.1 } as any
    };

    const sorted = rankProofShortlist([itemA, itemB]);
    expect(sorted[0].candidate_id).toBe('c_2'); // EVIDENCE READY ranked ahead of NEEDS PROOF
  });

  it('enforces evidence-derived authoritative scoring and keeps insufficient evidence explicitly unassessed', () => {
    // Candidate without verified claims but with incoming 0.99 fit_score and 0.95 proof_strength
    const unverifiedClaims = [
      {
        id: 'c_unverified_1',
        requirement_id: 'mh_1',
        claim_text: 'Self-reported knowledge of databases without external proof.',
        evidence_refs: [] // No verified evidence
      }
    ];

    const output = evaluateCandidateTrustPacket({
      hiringRun: mockRun,
      rawCandidateData: { id: 'cand_unverified', fit_score: 0.99, proof_strength: 0.95 },
      rawClaims: unverifiedClaims,
      allowedEvidenceRefs: allowedEvidence
    });

    // Score must be strictly null (unassessed)
    expect(output.fit_score).toBeNull();
    // Proof strength must be capped at <= 0.10 for uncorroborated inferred claims
    expect(output.proof_strength).toBeLessThanOrEqual(0.10);
    // Role fit label must be 'Insufficient Evidence'
    expect(output.role_fit_label).toBe('Insufficient Evidence');
    // Entropy must be maximum (1.0) due to uniform distribution over 4 states
    expect(output.entropy).toBe(2.0); // Maximum Shannon entropy = log2(4) = 2.0 bits
    // Decision readiness must be 'INSUFFICIENT EVIDENCE'
    expect(output.decision_readiness).toBe('INSUFFICIENT EVIDENCE');
    // Check actual returned shape
    expect(output).toHaveProperty('role_fit_distribution');
    expect(output).toHaveProperty('proof_coverage');
    expect(output).toHaveProperty('what_is_verified');
    expect(output).toHaveProperty('what_remains_uncertain');
    expect(output.what_is_verified).toHaveLength(0);
  });

  it('damps proof strength when duplicate evidence is reused across multiple claims', () => {
    const multiClaims = [
      { id: 'c1', requirement_id: 'mh_1', claim_text: 'PostgreSQL Database Architecture', evidence_refs: allowedEvidence },
      { id: 'c2', requirement_id: 'mh_2', claim_text: 'Distributed Systems Design', evidence_refs: allowedEvidence }
    ];

    const output = evaluateCandidateTrustPacket({
      hiringRun: mockRun,
      rawCandidateData: { id: 'cand_multi' },
      rawClaims: multiClaims,
      allowedEvidenceRefs: allowedEvidence
    });

    // Unique evidence count is 1 for 2 claims, applying 0.85 damping factor
    expect(output.proof_strength).toBeLessThan(0.95);
    expect(output.what_is_verified.length).toBeGreaterThan(0);
  });

  it('handles negated claims such as "no Kubernetes experience" correctly without granting positive credit', () => {
    const negatedClaims = [
      {
        id: 'c_neg',
        requirement_id: 'nth_1',
        claim_text: 'Candidate has no Kubernetes experience or cluster management background.',
        evidence_refs: allowedEvidence
      }
    ];

    const output = evaluateCandidateTrustPacket({
      hiringRun: mockRun,
      rawCandidateData: { id: 'cand_neg' },
      rawClaims: negatedClaims,
      allowedEvidenceRefs: allowedEvidence
    });

    // The negated claim should not produce false positive strengths
    expect(output.what_is_verified).not.toContain(negatedClaims[0].claim_text);
    expect(output.missing_proof.length).toBeGreaterThan(0);
  });
});
