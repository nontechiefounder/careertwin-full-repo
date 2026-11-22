/**
 * Proof-Ranked Shortlist Sorting Algorithm
 * CTW-IP-046
 */

import { EvaluationOutput } from '../../shared-contracts/src/index';

export interface ShortlistCandidateItem {
  id: string;
  candidate_id: string;
  candidate_name: string;
  evaluation: EvaluationOutput;
}

const READINESS_PRECEDENCE: Record<string, number> = {
  'EVIDENCE READY': 4,
  'HUMAN REVIEW REQUIRED': 3,
  'NEEDS PROOF': 2,
  'INSUFFICIENT EVIDENCE': 1,
};

/**
 * Sorts candidate shortlist deterministically by proof readiness, strength, fit, and uncertainty.
 * CTW-IP-046
 */
export function rankProofShortlist<T extends ShortlistCandidateItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const evalA = a.evaluation;
    const evalB = b.evaluation;

    // 1. Non-disqualified before disqualified
    if (evalA.disqualified !== evalB.disqualified) {
      return evalA.disqualified ? 1 : -1;
    }

    // 2. Gate pass status precedence
    if (evalA.gate_pass !== evalB.gate_pass) {
      return evalA.gate_pass ? -1 : 1;
    }

    // 3. Readiness State precedence
    const rA = READINESS_PRECEDENCE[evalA.decision_readiness] || 0;
    const rB = READINESS_PRECEDENCE[evalB.decision_readiness] || 0;
    if (rA !== rB) {
      return rB - rA;
    }

    // 4. Proof Strength precedence
    if (Math.abs(evalA.proof_strength - evalB.proof_strength) > 0.05) {
      return evalB.proof_strength - evalA.proof_strength;
    }

    // 5. Expected Role Fit score precedence
    const fitA = evalA.fit_score ?? 0;
    const fitB = evalB.fit_score ?? 0;
    if (Math.abs(fitA - fitB) > 0.05) {
      return fitB - fitA;
    }

    // 6. Uncertainty precedence (lower uncertainty is better)
    return evalA.uncertainty - evalB.uncertainty;
  });
}
