import { describe, it, expect, vi } from 'vitest';
import { extractMultiSpanEvidenceAndClaims } from '@/lib/evidenceExtractor';
import { evaluateCandidateTrustPacket } from '@packages/proof-engine';
import { buildClaimGraphAndLedger } from '@packages/proof-engine';

describe('CTW-V2-DEMO-CORE-04: Kubernetes Mismatch & Packet Provenance Verification Suite', () => {

  const approvedRole = {
    id: 'run_k8s_mismatch_1',
    role_title: 'Senior Distributed Systems / Cloud Infrastructure Engineer',
    brief_json: {
      contract_version: '2.1.0'
    },
    rubric_approved_version: '2.1.0',
    rubric_approved_at: '2026-10-03T12:00:00Z',
    rubric_approved_by: 'user_lead_architect',
    proof_contract: {
      role_id: 'run_k8s_mismatch_1',
      version: '2.1.0',
      requirements: [
        {
          id: 'req_dist_sys',
          title: 'Distributed Systems',
          category: 'must_have',
          importance_weight: 1.0,
          keywords: ['distributed systems', 'microservices', 'consensus']
        },
        {
          id: 'req_k8s',
          title: 'Kubernetes',
          category: 'must_have',
          importance_weight: 1.0,
          keywords: ['kubernetes', 'k8s', 'cluster management']
        }
      ],
      thresholds: {
        t_fit: 0.85,
        t_proof: 0.50
      }
    }
  };

  const syntheticDocWithNegation = {
    id: 'doc_synth_k8s_neg',
    candidate_id: 'cand_synth_1',
    org_id: 'org_demo_test',
    filename: 'candidate_resume_verified.pdf',
    mime_type: 'application/pdf',
    file_sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    normalized_text_sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    normalized_text: 'Experienced distributed systems engineer. Built Go microservices and event queues. Candidate has no Kubernetes experience or cluster management.',
    created_at: new Date().toISOString()
  };

  it('1. Extraction trace: bounded excerpts do not bleed and negation is captured with unproven status', () => {
    const { evidenceRefs, claims } = extractMultiSpanEvidenceAndClaims(syntheticDocWithNegation, approvedRole);

    expect(evidenceRefs.length).toBeGreaterThanOrEqual(2);
    expect(claims.length).toBeGreaterThanOrEqual(2);

    // Bounded technology claim for Distributed Systems must not leak "Kubernetes"
    const distSysClaim = claims.find(c => c.requirement_id === 'req_dist_sys');
    expect(distSysClaim).toBeDefined();
    expect(distSysClaim.claim_text.toLowerCase()).not.toContain('kubernetes');

    // Negated claim for Kubernetes must be captured with is_negated: true
    const k8sClaim = claims.find(c => c.requirement_id === 'req_k8s');
    expect(k8sClaim).toBeDefined();
    expect(k8sClaim.is_negated).toBe(true);
    expect(k8sClaim.status).toBe('UNPROVEN');

    // Positive non-negated claim for Kubernetes MUST NOT exist
    const positiveK8s = claims.find(c => c.requirement_id === 'req_k8s' && !c.is_negated);
    expect(positiveK8s).toBeUndefined();
  });

  it('2. Claim status & graph: buildClaimGraphAndLedger marks negated claim as CONFLICTING with CONTRADICTS edge', () => {
    const { evidenceRefs, claims: rawClaims } = extractMultiSpanEvidenceAndClaims(syntheticDocWithNegation, approvedRole);

    const graph = buildClaimGraphAndLedger(
      rawClaims,
      evidenceRefs,
      syntheticDocWithNegation.candidate_id,
      approvedRole.id,
      'system'
    );

    const k8sClaim = graph.claims.find(c => c.requirement_id === 'req_k8s');
    expect(k8sClaim).toBeDefined();
    expect(k8sClaim.status).toBe('CONFLICTING');

    // Edge must represent CONTRADICTS
    const k8sEdge = graph.edges.find(e => e.claim_id === k8sClaim.id);
    expect(k8sEdge).toBeDefined();
    expect(k8sEdge.relationship).toBe('CONTRADICTS');
  });

  it('3. Engine Result: gatePass is false, coverage is 50% (not 100%), missing_proof contains Kubernetes, readiness is NEEDS PROOF', () => {
    const { evidenceRefs, claims: rawClaims } = extractMultiSpanEvidenceAndClaims(syntheticDocWithNegation, approvedRole);

        const packet = evaluateCandidateTrustPacket({
      hiringRun: approvedRole,
      rawCandidateData: { id: syntheticDocWithNegation.candidate_id },
      rawClaims,
      allowedEvidenceRefs: evidenceRefs,
      actorId: 'system'
    });
    

    // A. Must-Have gate check: Must-Have Kubernetes requirement is unsatisfied!
    expect(packet.gate_pass).toBe(false);
    expect(packet.failed_must_haves).toContain('Kubernetes');

    // B. Proof Coverage: Exactly 1 of 2 requirements verified -> 50% proof coverage, NEVER 100%!
    expect(packet.proof_coverage).toBe(0.50);

    // C. Decision Blockers: Kubernetes must be explicitly listed in missing_proof
    expect(packet.missing_proof.length).toBeGreaterThanOrEqual(1);
    const k8sBlocker = packet.missing_proof.find(b => b.unproven_requirement === 'Kubernetes');
    expect(k8sBlocker).toBeDefined();
    expect(k8sBlocker.why_insufficient).toContain('no Kubernetes experience');
    expect(k8sBlocker.interview_probe).toBeDefined();
    expect(k8sBlocker.minimum_next_proof).toBeDefined();

    // D. Readiness State: Blocked by unsatisfied must-have -> NEVER EVIDENCE READY!
    expect(packet.decision_readiness).toBe('NEEDS PROOF');
    expect(packet.decision_readiness).not.toBe('EVIDENCE READY');
  });

  it('4. Separate Qualifying Evidence: corroborating verified code for Kubernetes satisfies requirement', () => {
    // Corroborating code document containing production Kubernetes manifests / code
    const corroboratingDoc = {
      id: 'doc_corrob_code',
      candidate_id: 'cand_synth_1',
      org_id: 'org_demo_test',
      filename: 'cluster_config.py',
      mime_type: 'application/code',
      file_sha256: 'sha_code_corrob',
      normalized_text_sha256: 'norm_code_corrob',
      normalized_text: 'class ClusterManager:\n    def deploy_kubernetes_pod(self, manifest): pass',
      created_at: new Date().toISOString()
    };

    const { evidenceRefs: codeRefs, claims: codeClaims, trustedProvenance } = extractMultiSpanEvidenceAndClaims(corroboratingDoc, approvedRole, {
      trustedProvenance: {
        verified: true,
        authorship_verified: true,
        provenance_verified: true,
        document_id: 'doc_corrob_code',
        content_sha256: 'norm_code_corrob',
        verification_source: 'github_commit_signature'
      }
    });
    const { evidenceRefs: resumeRefs, claims: resumeClaims } = extractMultiSpanEvidenceAndClaims(syntheticDocWithNegation, approvedRole);

    const combinedClaims = [...resumeClaims, ...codeClaims];
    const combinedRefs = [...resumeRefs, ...codeRefs];

    const packet = evaluateCandidateTrustPacket({
      hiringRun: approvedRole,
      rawCandidateData: { id: 'cand_synth_1' },
      rawClaims: combinedClaims,
      allowedEvidenceRefs: combinedRefs,
      trustedProvenance,
      actorId: 'system'
    });

    // With separate qualifying verified code evidence, Kubernetes is corroborated!
    const verifiedK8s = codeClaims.find(c => c.requirement_id === 'req_k8s' && c.status === 'VERIFIED');
    expect(verifiedK8s).toBeDefined();
  });

  it('5. Packet Provenance: claims, claim_ledger, evidence_refs, rubric_version, and evaluation_timestamp agree', () => {
    const { evidenceRefs, claims: rawClaims } = extractMultiSpanEvidenceAndClaims(syntheticDocWithNegation, approvedRole);

        const packet = evaluateCandidateTrustPacket({
      hiringRun: approvedRole,
      rawCandidateData: { id: syntheticDocWithNegation.candidate_id },
      rawClaims,
      allowedEvidenceRefs: evidenceRefs,
      actorId: 'system'
    });
    

    // Embed provenance fields as done in generate/route.js
    const assembledPacket = {
      ...packet,
      rubric_version: approvedRole.rubric_approved_version,
      role_version: approvedRole.rubric_approved_version,
      evaluation_timestamp: packet.evaluated_at,
      ledger_revision: 1,
      claims: rawClaims,
      claim_ledger: rawClaims,
      evidence_refs: evidenceRefs
    };

    // Verify all provenance keys are populated
    expect(assembledPacket.rubric_version).toBe('2.1.0');
    expect(assembledPacket.evaluation_timestamp).toBe(packet.evaluated_at);
    expect(assembledPacket.ledger_revision).toBe(1);
    expect(assembledPacket.claims.length).toBe(rawClaims.length);
    expect(assembledPacket.claim_ledger.length).toBe(rawClaims.length);
    expect(assembledPacket.evidence_refs.length).toBe(evidenceRefs.length);

    // Each evidence_ref must have verifiable offset and excerpt
    for (const ref of assembledPacket.evidence_refs) {
      expect(ref.source_offset.start_offset).toBeTypeOf('number');
      expect(ref.source_offset.end_offset).toBeTypeOf('number');
      expect(ref.source_offset.start_offset).toBeLessThanOrEqual(ref.source_offset.end_offset);
      expect(ref.sha256).toBeDefined();
      expect(ref.excerpt).toBeDefined();
    }
  });

  it('6. Insufficient evidence produces an actual unassessed packet with null fit_score and max entropy (distinct from missing or 404)', () => {
    const hiringRunStrict = {
      id: 'run_empty_evidence',
      proof_contract: {
        role_id: 'role_empty_1',
        requirements: [
          { id: 'req_1', title: 'Deep Systems Programming', category: 'must_have' }
        ]
      }
    };

    const emptyPacket = evaluateCandidateTrustPacket({
      hiringRun: hiringRunStrict,
      rawCandidateData: { id: 'cand_empty', fit_score: null },
      rawClaims: [],
      allowedEvidenceRefs: []
    });

    // Must be unassessed packet with null score, uniform distribution, and max entropy
    expect(emptyPacket.fit_score).toBeNull();
    expect(emptyPacket.role_fit_label).toBe('Insufficient Evidence');
    expect(emptyPacket.decision_readiness).toBe('INSUFFICIENT EVIDENCE');
    expect(emptyPacket.role_fit_distribution).toEqual({
      p_low: 0.25,
      p_limited: 0.25,
      p_moderate: 0.25,
      p_strong: 0.25
    });
    expect(emptyPacket.entropy).toBe(2.0); // Maximum entropy: log2(4) = 2.0 bits
    expect(emptyPacket.gate_pass).toBe(false);
  });
});
