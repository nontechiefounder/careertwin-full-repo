/**
 * Master Proof Engine Package Entrypoint (packages/proof-engine)
 * Exports all decision kernel modules and master evaluateCandidateTrustPacket function.
 */

import { Claim, EvidenceRef, EvaluationOutput, ProofContract } from '../../shared-contracts/src/index';
import { parseProofContract, sanitizeProtectedSignals } from '../../hiring-genome/src/index';
import { buildClaimGraphAndLedger, ExtractedClaimInput, TrustedProvenanceRecord, validateEvidenceSubsets } from './claimGraph';
import { evaluateGates } from './gates';
import { calculateRoleFitDistribution, calculateProofMetrics, calculateDistributionEntropy, calculateCandidateUncertainty } from './evaluations';
import { generateDecisionBlockers } from './blockers';
import { classifyCandidateReadiness } from './readiness';
import { rankProofShortlist } from './shortlist';

export * from './claimGraph';
export * from './gates';
export * from './evaluations';
export * from './blockers';
export * from './readiness';
export * from './shortlist';

export interface EvaluateCandidateInput {
  hiringRun: Record<string, any>;
  rawCandidateData: Record<string, any>;
  rawClaims: ExtractedClaimInput[];
  allowedEvidenceRefs: EvidenceRef[];
  actorId?: string;
  evaluatedAt?: string;
  trustedProvenance?: Record<string, TrustedProvenanceRecord>;
}

function stableJson(value: any): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
}

function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const bitLen = bytes.length * 8;
  const padLen = ((bytes.length + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(padLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(padLen - 4, bitLen >>> 0, false);
  const w = new Uint32Array(64);
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < padLen; i += 64) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(i + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(7, w[t - 15]) ^ rotr(18, w[t - 15]) ^ (w[t - 15] >>> 3);
      const s1 = rotr(17, w[t - 2]) ^ rotr(19, w[t - 2]) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return Array.from(H).map(x => x.toString(16).padStart(8, '0')).join('');
}

/**
 * Master Deterministic Decision Kernel Pipeline
 * Assembles complete structured Candidate Evaluation & Trust Packet output.
 */
export function evaluateCandidateTrustPacket(
  input: EvaluateCandidateInput
): EvaluationOutput & {
  gates?: any;
  failed_must_haves?: string[];
  claims?: Claim[];
  claim_edges?: ClaimEdge[];
  calculation_digest?: string;
} {
  const executionTimestamp = input.evaluatedAt || new Date().toISOString();

  // 1. Sanitize protected demographic attributes (CTW-IP-076, CTW-IP-078)
  const sanitizedCandidate = sanitizeProtectedSignals(input.rawCandidateData || {});

  // 2. Parse Proof Contract & role-specific thresholds (CTW-IP-005)
  const contract: ProofContract = parseProofContract(input.hiringRun || {});

  // 3. Build Claim Graph, Provenance Edges & Ledger (CTW-IP-009, 010, 015, 016, 017, 018, 074)
  const candidateId = sanitizedCandidate.id || 'unknown_candidate';
  const roleId = contract.role_id;
  const graphResult = buildClaimGraphAndLedger(
    input.rawClaims || [],
    input.allowedEvidenceRefs || [],
    candidateId,
    roleId,
    input.actorId || 'system',
    executionTimestamp,
    input.trustedProvenance
  );

  const claims = graphResult.claims;

  // 4. Calculate Proof Strength & Coverage deterministically (caller overrides ignored)
  const proofMetrics = calculateProofMetrics(contract, claims);

  // Derive fit_score strictly from approved requirements and validated evidence;
  // caller-supplied fit_score is never honored.
  // Distinctly tracks verified external proof score vs self-reported assertion alignment score (F05).
  let rawFitScore: number | null = null;
  let verifiedProofScore: number | null = null;
  let assertionAlignmentScore: number | null = null;

  if (graphResult.verifiedCount > 0 || claims.some(c => c.status === 'VERIFIED') || claims.some(c => (c as any).source_type === 'resume_assertion')) {
    let totalWeight = 0;
    let earnedWeight = 0;
    let verifiedEarnedWeight = 0;
    let assertedWeight = 0;

    for (const req of contract.requirements) {
      const weight = typeof req.importance_weight === 'number' ? req.importance_weight : 1.0;
      totalWeight += weight;
      const matchingClaim = claims.find(c => {
        const match = c.requirement_id ? c.requirement_id === req.id : c.claim_text.toLowerCase().includes(req.title.toLowerCase());
        return match && !(c as any).is_negated && c.status !== 'CONFLICTING';
      });
      if (matchingClaim && matchingClaim.status === 'VERIFIED') {
        earnedWeight += weight;
        verifiedEarnedWeight += weight;
        assertedWeight += weight;
      } else if (matchingClaim && matchingClaim.status === 'INFERRED') {
        earnedWeight += weight * 0.5;
        assertedWeight += weight;
      }
    }
    rawFitScore = totalWeight > 0 ? Number((earnedWeight / totalWeight).toFixed(2)) : proofMetrics.proofCoverage;
    verifiedProofScore = totalWeight > 0 ? Number((verifiedEarnedWeight / totalWeight).toFixed(2)) : 0;
    assertionAlignmentScore = totalWeight > 0 ? Number((assertedWeight / totalWeight).toFixed(2)) : null;
  } else {
    rawFitScore = null;
    verifiedProofScore = 0;
    assertionAlignmentScore = null;
  }

  // 5. Calculate Role Fit Distribution (CTW-IP-011)
  const totalClaimsCount = claims.length || 1;
  const verifiedRatio = graphResult.verifiedCount / totalClaimsCount;
  const fitResult = calculateRoleFitDistribution(rawFitScore, verifiedRatio);

  // 6. Calculate Distribution Entropy & Uncertainty (CTW-IP-022, CTW-IP-023, CTW-IP-024, CTW-IP-025)
  const entropyResult = calculateDistributionEntropy(fitResult.distribution);
  const unverifiedRatio = (graphResult.inferredCount + graphResult.uncertainCount) / totalClaimsCount;
  const hasContradictions = graphResult.conflictingCount > 0;
  const uncertaintyResult = calculateCandidateUncertainty(
    proofMetrics.proofStrength,
    unverifiedRatio,
    entropyResult.normalizedEntropy,
    hasContradictions
  );

  // 7. Evaluate Deterministic Must-Have & Disqualifier Gates (CTW-IP-026, CTW-IP-027)
  const gateResult = evaluateGates(contract, claims, proofMetrics.proofStrength);

  // 8. Generate Decision Blockers & Minimum Sufficient Proof (CTW-IP-031, CTW-IP-033, CTW-IP-086, CTW-IP-087)
  const missingProofItems = generateDecisionBlockers(contract, claims);

  // 9. Classify Candidate Readiness & State (CTW-IP-038, CTW-IP-039, CTW-IP-040)
  const readinessResult = classifyCandidateReadiness(
    contract,
    fitResult.expectedScore,
    proofMetrics.proofStrength,
    gateResult.gatePass,
    gateResult.disqualified,
    missingProofItems.length > 0
  );

  // 10. Assemble structured Trust Matrix items
  const whatIsVerified = claims.filter(c => c.status === 'VERIFIED').map(c => c.claim_text);
  const whatIsInferred = claims.filter(c => c.status === 'INFERRED').map(c => c.claim_text);
  const whatRemainsUncertain = claims
    .filter(c => c.status === 'MISSING' || c.status === 'UNPROVEN' || c.status === 'CONFLICTING')
    .map(c => c.claim_text);

  const deterministicCore = {
    spec_version: '1.0.0-kernel',
    role_id: roleId,
    candidate_id: candidateId,
    fit_score: fitResult.expectedScore,
    assertion_alignment_score: assertionAlignmentScore,
    verified_proof_score: verifiedProofScore,
    evidence_breakdown: {
      verified_claims_count: graphResult.verifiedCount,
      resume_assertion_count: claims.filter(c => (c as any).source_type === 'resume_assertion').length,
      skill_list_count: claims.filter(c => (c as any).source_type === 'skill_list').length,
      contradiction_count: graphResult.conflictingCount,
      negated_count: claims.filter(c => (c as any).is_negated).length
    },
    role_fit_distribution: fitResult.distribution,
    role_fit_label: fitResult.label,
    proof_strength: proofMetrics.proofStrength,
    proof_strength_label: proofMetrics.proofLabel,
    proof_coverage: proofMetrics.proofCoverage,
    uncertainty: uncertaintyResult.uncertainty,
    entropy: entropyResult.entropy,
    contradiction_penalty: uncertaintyResult.contradictionPenalty,
    gate_pass: gateResult.gatePass,
    disqualified: gateResult.disqualified,
    disqualification_reasons: gateResult.disqualificationReasons,
    missing_proof: missingProofItems,
    decision_readiness: readinessResult.readinessState,
    what_is_verified: whatIsVerified,
    what_is_inferred: whatIsInferred,
    what_remains_uncertain: whatRemainsUncertain,
    claims,
    claim_edges: graphResult.edges.map(({ created_at: _omitTs, ...deterministicEdge }) => deterministicEdge),
    gates: gateResult,
    failed_must_haves: gateResult.failedMustHaves,
  };

  return {
    ...deterministicCore,
    claim_edges: graphResult.edges,
    calculation_digest: sha256Hex(stableJson(deterministicCore)),
    evaluated_at: executionTimestamp,
  };
}
