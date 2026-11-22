/**
 * Candidate Readiness & Evidence State Classification Engine
 * CTW-IP-038, CTW-IP-039, CTW-IP-040
 */

import { ProofContract, ReadinessState } from '../../shared-contracts/src/index';

export interface ReadinessResult {
  readinessState: ReadinessState;
  isHighFitLowProof: boolean;
  explanation: string;
}

/**
 * Classifies Candidate Evidence Readiness State using role-specific thresholds.
 * CTW-IP-038, CTW-IP-039, CTW-IP-040
 */
export function classifyCandidateReadiness(
  contract: ProofContract,
  fitScore: number | null,
  proofStrength: number,
  gatePass: boolean,
  disqualified: boolean,
  hasBlockers: boolean
): ReadinessResult {
  const t_fit = contract.thresholds?.t_fit ?? 0.85;
  const t_proof = contract.thresholds?.t_proof ?? 0.50;

  if (disqualified) {
    return {
      readinessState: 'INSUFFICIENT EVIDENCE',
      isHighFitLowProof: false,
      explanation: 'Candidate matched role disqualifier requirement or critical attribute conflict.',
    };
  }

  // Zero verified claims / unassessed state is classified as INSUFFICIENT EVIDENCE
  if (fitScore === null || fitScore === undefined) {
    return {
      readinessState: 'INSUFFICIENT EVIDENCE',
      isHighFitLowProof: false,
      explanation: 'Insufficient evidence provided to assess candidate against approved role contract.',
    };
  }

  const isHighFit = fitScore >= t_fit;
  const isLowProof = proofStrength < 0.30;
  const isHighFitLowProof = isHighFit && isLowProof; // CTW-IP-040

  let readinessState: ReadinessState = 'INSUFFICIENT EVIDENCE';

  if (!gatePass || hasBlockers) {
    readinessState = 'NEEDS PROOF';
  } else if (isHighFitLowProof) {
    // CTW-IP-040: High-Fit / Low-Proof forces NEEDS PROOF state
    readinessState = 'NEEDS PROOF';
  } else if (isHighFit && proofStrength >= t_proof && !hasBlockers) {
    readinessState = 'EVIDENCE READY';
  } else if (fitScore >= 0.70 && proofStrength >= 0.30) {
    readinessState = 'HUMAN REVIEW REQUIRED';
  } else {
    readinessState = 'NEEDS PROOF';
  }

  return {
    readinessState,
    isHighFitLowProof,
    explanation: `Candidate classified as ${readinessState} based on fit (${fitScore}), proof (${proofStrength}), and gate pass status (${gatePass}).`,
  };
}
