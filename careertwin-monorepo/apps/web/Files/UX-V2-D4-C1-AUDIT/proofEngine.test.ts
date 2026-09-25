import { describe, it, expect } from 'vitest';
import {
  evaluateCandidateTrustPacket,
  validateEvidenceSubsets,
  rankProofShortlist,
  calculateRoleFitDistribution,
  calculateDistributionEntropy,
  evaluateGates
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
    }
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

  it('CTW-IP-040: forces NEEDS PROOF state for High-Fit / Low-Proof candidate', () => {
    const rawClaims = [
      { id: 'c1', requirement_id: 'mh_1', claim_text: 'PostgreSQL Database Architecture', evidence_refs: allowedEvidence },
      { id: 'c2', requirement_id: 'mh_2', claim_text: 'Distributed Systems Design', evidence_refs: allowedEvidence }
    ];

    const output = evaluateCandidateTrustPacket({
      hiringRun: mockRun,
      rawCandidateData: { id: 'cand_1', fit_score: 0.92, proof_strength: 0.20 },
      rawClaims,
      allowedEvidenceRefs: allowedEvidence
    });

    expect(output.fit_score).toBe(0.92);
    expect(output.proof_strength).toBe(0.20);
    expect(output.decision_readiness).toBe('NEEDS PROOF');
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
});
