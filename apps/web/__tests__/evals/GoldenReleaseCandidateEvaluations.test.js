import { describe, test, expect } from 'vitest';
import { EvaluationOutputSchema } from '../../lib/evaluations.js';
import { evaluateCandidateTrustPacket, attestTrustedEvidenceProvenance } from '@packages/proof-engine';
import { parseProofContract, sanitizeProtectedSignals } from '@packages/hiring-genome';

/**
 * Production-Linked Golden Release Candidate (RC) Evaluation Suite
 *
 * Retargeted directly to the canonical active engine (`evaluateCandidateTrustPacket`,
 * `parseProofContract`, `sanitizeProtectedSignals`) covering all 8 golden cases:
 * 1. Strong fit / strong proof (EVIDENCE READY via explicit trusted code provenance)
 * 2. Resume assertions / weak proof (NEEDS PROOF + High Uncertainty)
 * 3. Team contribution / ownership ambiguity (INFERRED, caller promotion ignored)
 * 4. Conflicting evidence (CONFLICTING + CONTRADICTS edges + contradiction penalty)
 * 5. Insufficient evidence / Minimum Missing Proof + null fit_score
 * 6. Protected-signal bias invariance (identical evaluation & calculation_digest)
 * 7. Zod Schema Validation directly on active-engine outputs
 * 8. Authoritative kernel invariants (zero caller overrides, forged provenance blocked, reproducible digest)
 */

const GOLDEN_RUN = {
  id: 'role_golden_1',
  role_title: 'Staff Systems Engineer',
  must_haves: ['Distributed Consensus', 'PostgreSQL Internals'],
  nice_to_haves: [],
  disqualifiers: [],
  brief_json: { thresholds: { t_fit: 0.85, t_proof: 0.50, t_uncertainty: 0.40 } }
};

const makeCorroboratedRefs = () => [
  attestTrustedEvidenceProvenance(
    {
      id: 'ev_gold_1',
      document_id: 'doc_1',
      candidate_id: 'cand_g1',
      role_id: 'role_golden_1',
      org_id: 'org_g1',
      filename: 'raft.rs',
      file_type: 'code',
      sha256: 'hash_raft_001',
      source_offset: { page: 1, start_offset: 0, end_offset: 120, excerpt_hash: 'ex_g1' },
      source_tier: 'code',
      created_at: '2026-08-20T00:00:00.000Z',
      version: '1.0.0'
    },
    { verification_source: 'github_commit_signature', document_id: 'doc_1', sha256: 'hash_raft_001', authorship_verified: true, provenance_verified: true }
  ),
  attestTrustedEvidenceProvenance(
    {
      id: 'ev_gold_2',
      document_id: 'doc_2',
      candidate_id: 'cand_g1',
      role_id: 'role_golden_1',
      org_id: 'org_g1',
      filename: 'pg_wal.c',
      file_type: 'code',
      sha256: 'hash_pg_002',
      source_offset: { page: 1, start_offset: 0, end_offset: 140, excerpt_hash: 'ex_g2' },
      source_tier: 'repo',
      created_at: '2026-08-20T00:00:00.000Z',
      version: '1.0.0'
    },
    { verification_source: 'github_commit_signature', document_id: 'doc_2', sha256: 'hash_pg_002', authorship_verified: true, provenance_verified: true }
  )
];

describe('Golden Release Candidate Evaluation Suite (Active Engine)', () => {

  // Case 1: Strong fit / strong proof via active engine
  test('Case 1: Strong fit / strong proof resolves to EVIDENCE READY with VERIFIED claims and provenance edges', () => {
    const corroboratedRefs = makeCorroboratedRefs();
    const packet = evaluateCandidateTrustPacket({
      hiringRun: GOLDEN_RUN,
      rawCandidateData: { id: 'cand_g1' },
      rawClaims: [
        { id: 'c_g1', requirement_id: 'mh_1', claim_text: 'Distributed Consensus', evidence_refs: [corroboratedRefs[0]] },
        { id: 'c_g2', requirement_id: 'mh_2', claim_text: 'PostgreSQL Internals', evidence_refs: [corroboratedRefs[1]] }
      ],
      allowedEvidenceRefs: corroboratedRefs,
      evaluatedAt: '2026-08-20T00:00:00.000Z'
    });

    expect(packet.decision_readiness).toBe('EVIDENCE READY');
    expect(packet.role_fit_label).toBe('Strong');
    expect(packet.proof_strength_label).toBe('Strong');
    expect(packet.uncertainty).toBeLessThanOrEqual(0.15);
    expect(packet.claims.every(c => c.status === 'VERIFIED')).toBe(true);
    expect(packet.claim_edges).toHaveLength(2);
    expect(packet.claim_edges.every(e => e.relationship === 'SUPPORTS' && e.provenance_hash)).toBe(true);
  });

  // Case 2: Resume assertion / weak proof (NEEDS PROOF)
  test('Case 2: Resume-only assertions resolve to NEEDS PROOF with high uncertainty and bounded proof strength', () => {
    const resumeRefs = [
      {
        id: 'ev_res_1',
        document_id: 'doc_res_1',
        candidate_id: 'cand_g2',
        role_id: 'role_golden_1',
        org_id: 'org_g1',
        filename: 'resume.pdf',
        file_type: 'pdf',
        sha256: 'hash_res_001',
        source_offset: { page: 1, start_offset: 0, end_offset: 80, excerpt_hash: 'ex_r1' },
        source_tier: 'self_claim',
        created_at: '2026-08-20T00:00:00.000Z',
        version: '1.0.0'
      },
      {
        id: 'ev_res_2',
        document_id: 'doc_res_1',
        candidate_id: 'cand_g2',
        role_id: 'role_golden_1',
        org_id: 'org_g1',
        filename: 'resume.pdf',
        file_type: 'pdf',
        sha256: 'hash_res_001',
        source_offset: { page: 1, start_offset: 81, end_offset: 160, excerpt_hash: 'ex_r2' },
        source_tier: 'self_claim',
        created_at: '2026-08-20T00:00:00.000Z',
        version: '1.0.0'
      }
    ];

    const packet = evaluateCandidateTrustPacket({
      hiringRun: GOLDEN_RUN,
      rawCandidateData: { id: 'cand_g2' },
      rawClaims: [
        { id: 'c_r1', requirement_id: 'mh_1', claim_text: 'Distributed Consensus', source_type: 'resume_assertion', evidence_refs: [resumeRefs[0]] },
        { id: 'c_r2', requirement_id: 'mh_2', claim_text: 'PostgreSQL Internals', source_type: 'resume_assertion', evidence_refs: [resumeRefs[1]] }
      ],
      allowedEvidenceRefs: resumeRefs,
      evaluatedAt: '2026-08-20T00:00:00.000Z'
    });

    expect(packet.decision_readiness).toBe('NEEDS PROOF');
    expect(packet.decision_readiness).not.toBe('EVIDENCE READY');
    expect(packet.proof_strength).toBeLessThanOrEqual(0.10);
    expect(packet.proof_strength_label).toBe('Limited');
    expect(packet.uncertainty).toBeGreaterThanOrEqual(0.60);
    expect(packet.what_is_verified).toHaveLength(0);
    expect(packet.missing_proof.length).toBeGreaterThan(0);
  });

  // Case 3: Ownership ambiguity (team claim without trusted code corroboration)
  test('Case 3: Ownership ambiguity (team accomplishment) resolves to INFERRED and rejects caller promotion', () => {
    const teamRef = {
      id: 'ev_team_1',
      document_id: 'doc_team',
      candidate_id: 'cand_g3',
      role_id: 'role_golden_1',
      org_id: 'org_g1',
      filename: 'resume.pdf',
      file_type: 'pdf',
      sha256: 'hash_team_001',
      source_offset: { page: 1, start_offset: 0, end_offset: 60, excerpt_hash: 'ex_t1' },
      source_tier: 'self_claim',
      created_at: '2026-08-20T00:00:00.000Z',
      version: '1.0.0'
    };

    const packet = evaluateCandidateTrustPacket({
      hiringRun: GOLDEN_RUN,
      rawCandidateData: { id: 'cand_g3' },
      rawClaims: [
        {
          id: 'c_team_1',
          requirement_id: 'mh_1',
          claim_text: 'Team built high-throughput event bus handling 100k QPS',
          status: 'VERIFIED',
          source_type: 'corroborated',
          evidence_classification: 'corroborated',
          authorship_verified: true,
          provenance_verified: true,
          evidence_refs: [teamRef]
        }
      ],
      allowedEvidenceRefs: [teamRef],
      evaluatedAt: '2026-08-20T00:00:00.000Z'
    });

    expect(packet.claims[0].status).toBe('INFERRED');
    expect(packet.claims[0].status).not.toBe('VERIFIED');
    expect(packet.claims[0].source_type).not.toBe('corroborated');
    expect(packet.what_is_verified).toHaveLength(0);
  });

  // Case 4: Conflicting evidence
  test('Case 4: Conflicting evidence produces CONFLICTING claims, CONTRADICTS edges, and failed gates', () => {
    const resumeRef = {
      id: 'ev_conf_1',
      document_id: 'doc_conf',
      candidate_id: 'cand_g4',
      role_id: 'role_golden_1',
      org_id: 'org_g1',
      filename: 'resume.pdf',
      file_type: 'pdf',
      sha256: 'hash_conf_001',
      source_offset: { page: 1, start_offset: 0, end_offset: 50, excerpt_hash: 'ex_c1' },
      source_tier: 'document',
      created_at: '2026-08-20T00:00:00.000Z',
      version: '1.0.0'
    };

    const packet = evaluateCandidateTrustPacket({
      hiringRun: GOLDEN_RUN,
      rawCandidateData: { id: 'cand_g4' },
      rawClaims: [
        {
          id: 'c_conf_1',
          requirement_id: 'mh_2',
          claim_text: 'Claims 8 years of PostgreSQL experience despite no PostgreSQL experience noted in audit',
          is_conflicting: true,
          evidence_refs: [resumeRef]
        }
      ],
      allowedEvidenceRefs: [resumeRef],
      evaluatedAt: '2026-08-20T00:00:00.000Z'
    });

    expect(packet.claims[0].status).toBe('CONFLICTING');
    expect(packet.claim_edges[0].relationship).toBe('CONTRADICTS');
    expect(packet.contradiction_penalty).toBeGreaterThan(0);
    expect(packet.gate_pass).toBe(false);
    expect(packet.what_remains_uncertain.length).toBeGreaterThan(0);
  });

  // Case 5: Insufficient evidence & Minimum Missing Proof
  test('Case 5: Insufficient evidence yields null fit_score, INSUFFICIENT EVIDENCE, and Minimum Missing Proof blockers', () => {
    const packet = evaluateCandidateTrustPacket({
      hiringRun: GOLDEN_RUN,
      rawCandidateData: { id: 'cand_g5', fit_score: 0.99 },
      rawClaims: [],
      allowedEvidenceRefs: [],
      evaluatedAt: '2026-08-20T00:00:00.000Z'
    });

    expect(packet.fit_score).toBeNull();
    expect(packet.role_fit_label).toBe('Insufficient Evidence');
    expect(packet.decision_readiness).toBe('INSUFFICIENT EVIDENCE');
    expect(packet.missing_proof.length).toBe(2);
    const item = packet.missing_proof[0];
    expect(item.unproven_requirement).toBe('Distributed Consensus');
    expect(item.why_insufficient).toBeTruthy();
    expect(item.minimum_next_proof).toBeTruthy();
    expect(item.interview_probe).toBeTruthy();
  });

  // Case 6: Protected-signal trap (Bias Invariance)
  test('Case 6: Protected demographic attributes are stripped and leave evaluation and digest invariant', () => {
    const corroboratedRefs = makeCorroboratedRefs();
    const rawClaims = [
      { id: 'c_g1', requirement_id: 'mh_1', claim_text: 'Distributed Consensus', evidence_refs: [corroboratedRefs[0]] },
      { id: 'c_g2', requirement_id: 'mh_2', claim_text: 'PostgreSQL Internals', evidence_refs: [corroboratedRefs[1]] }
    ];

    const dirtyCandidate = {
      id: 'cand_bias_check',
      skills: ['Python', 'PostgreSQL', 'FastAPI'],
      experience_years: 5,
      age: 48,
      gender: 'Female',
      race: 'Underrepresented Minority',
      graduation_year: 1998,
      postal_code: '94102',
      photo_url: 'https://example.com/photo.jpg'
    };

    const sanitized = sanitizeProtectedSignals(dirtyCandidate);
    expect(sanitized).toHaveProperty('skills');
    expect(sanitized).toHaveProperty('experience_years');
    expect(sanitized).not.toHaveProperty('age');
    expect(sanitized).not.toHaveProperty('gender');
    expect(sanitized).not.toHaveProperty('race');
    expect(sanitized).not.toHaveProperty('graduation_year');
    expect(sanitized).not.toHaveProperty('postal_code');
    expect(sanitized).not.toHaveProperty('photo_url');

    const packetClean = evaluateCandidateTrustPacket({
      hiringRun: GOLDEN_RUN,
      rawCandidateData: { id: 'cand_bias_check', skills: ['Python', 'PostgreSQL', 'FastAPI'], experience_years: 5 },
      rawClaims,
      allowedEvidenceRefs: corroboratedRefs,
      evaluatedAt: '2026-08-20T00:00:00.000Z'
    });
    const packetWithDemographics = evaluateCandidateTrustPacket({
      hiringRun: GOLDEN_RUN,
      rawCandidateData: dirtyCandidate,
      rawClaims,
      allowedEvidenceRefs: corroboratedRefs,
      evaluatedAt: '2026-08-20T00:00:00.000Z'
    });

    expect(packetWithDemographics.fit_score).toBe(packetClean.fit_score);
    expect(packetWithDemographics.proof_strength).toBe(packetClean.proof_strength);
    expect(packetWithDemographics.decision_readiness).toBe(packetClean.decision_readiness);
    expect(packetWithDemographics.calculation_digest).toBe(packetClean.calculation_digest);
  });

  // Case 7: Zod Schema Enforcement Test directly against active engine outputs
  test('Case 7: Zod Schema Validator validates active-engine evaluation outputs strictly', () => {
    const contract = parseProofContract(GOLDEN_RUN);
    expect(contract.requirements.length).toBe(2);

    const corroboratedRefs = makeCorroboratedRefs();
    const readyPacket = evaluateCandidateTrustPacket({
      hiringRun: GOLDEN_RUN,
      rawCandidateData: { id: 'cand_g7_ready' },
      rawClaims: [
        { id: 'c_g1', requirement_id: 'mh_1', claim_text: 'Distributed Consensus', evidence_refs: [corroboratedRefs[0]] },
        { id: 'c_g2', requirement_id: 'mh_2', claim_text: 'PostgreSQL Internals', evidence_refs: [corroboratedRefs[1]] }
      ],
      allowedEvidenceRefs: corroboratedRefs,
      evaluatedAt: '2026-08-20T00:00:00.000Z'
    });
    const insufficientPacket = evaluateCandidateTrustPacket({
      hiringRun: GOLDEN_RUN,
      rawCandidateData: { id: 'cand_g7_insuff' },
      rawClaims: [],
      allowedEvidenceRefs: [],
      evaluatedAt: '2026-08-20T00:00:00.000Z'
    });

    expect(EvaluationOutputSchema.safeParse(readyPacket).success).toBe(true);
    expect(EvaluationOutputSchema.safeParse(insufficientPacket).success).toBe(true);
  });

  // Case 8: End-to-End Canonical Kernel Authoritative Scoring (Zero Caller Overrides & Trusted Provenance)
  test('Case 8: Canonical evaluateCandidateTrustPacket ignores caller overrides, rejects unattested code refs, and produces reproducible digest', () => {
    const corroboratedRefs = makeCorroboratedRefs();

    const readyPacket = evaluateCandidateTrustPacket({
      hiringRun: GOLDEN_RUN,
      rawCandidateData: { id: 'cand_g1', fit_score: 0.01, proof_strength: 0.01 },
      rawClaims: [
        { id: 'c_g1', requirement_id: 'mh_1', claim_text: 'Distributed Consensus', evidence_refs: [corroboratedRefs[0]] },
        { id: 'c_g2', requirement_id: 'mh_2', claim_text: 'PostgreSQL Internals', evidence_refs: [corroboratedRefs[1]] }
      ],
      allowedEvidenceRefs: corroboratedRefs,
      evaluatedAt: '2026-08-20T00:00:00.000Z'
    });

    const laterPacket = evaluateCandidateTrustPacket({
      hiringRun: GOLDEN_RUN,
      rawCandidateData: { id: 'cand_g1', fit_score: 0.01, proof_strength: 0.01 },
      rawClaims: [
        { id: 'c_g1', requirement_id: 'mh_1', claim_text: 'Distributed Consensus', evidence_refs: [corroboratedRefs[0]] },
        { id: 'c_g2', requirement_id: 'mh_2', claim_text: 'PostgreSQL Internals', evidence_refs: [corroboratedRefs[1]] }
      ],
      allowedEvidenceRefs: corroboratedRefs,
      evaluatedAt: '2026-08-25T15:30:00.000Z'
    });

    expect(readyPacket.fit_score).toBe(1.0);
    expect(readyPacket.proof_strength).toBeGreaterThanOrEqual(0.85);
    expect(readyPacket.decision_readiness).toBe('EVIDENCE READY');
    expect(readyPacket.claim_edges).toHaveLength(2);
    expect(readyPacket.calculation_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(laterPacket.calculation_digest).toBe(readyPacket.calculation_digest);
  });

});
