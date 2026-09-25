/**
 * Master Proof Engine Package Entrypoint (packages/proof-engine)
 * Exports all decision kernel modules and master evaluateCandidateTrustPacket function.
 */

import { Claim, EvidenceRef, EvaluationOutput, ProofContract } from '../../shared-contracts/src/index';
import { parseProofContract, sanitizeProtectedSignals } from '../../hiring-genome/src/index';
import { buildClaimGraphAndLedger, ExtractedClaimInput, validateEvidenceSubsets } from './claimGraph';
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
}

/**
 * Master Deterministic Decision Kernel Pipeline
 * Assembles complete structured Candidate Evaluation & Trust Packet output.
 */
export function evaluateCandidateTrustPacket(input: EvaluateCandidateInput): EvaluationOutput {
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
    input.actorId || 'system'
  );

  const claims = graphResult.claims;

  // 4. Calculate Role Fit Distribution (CTW-IP-011)
  const rawFitScore = typeof sanitizedCandidate.fit_score === 'number' ? sanitizedCandidate.fit_score : null;
  const totalClaimsCount = claims.length || 1;
  const verifiedRatio = graphResult.verifiedCount / totalClaimsCount;
  const fitResult = calculateRoleFitDistribution(rawFitScore, verifiedRatio);

  // 5. Calculate Proof Strength & Coverage (CTW-IP-012, CTW-IP-013)
  const proofMetrics = calculateProofMetrics(contract, claims, sanitizedCandidate.proof_strength);

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

  return {
    spec_version: '1.0.0-kernel',
    role_id: roleId,
    candidate_id: candidateId,
    fit_score: fitResult.expectedScore,
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
    evaluated_at: new Date().toISOString(),
  };
}
