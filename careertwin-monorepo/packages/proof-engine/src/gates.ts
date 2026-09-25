/**
 * Deterministic Must-Have & Disqualifier Gates
 * CTW-IP-026, CTW-IP-027
 */

import { ProofContract, Claim } from '../../shared-contracts/src/index';

export interface GateResult {
  gatePass: boolean;
  disqualified: boolean;
  failedMustHaves: string[];
  disqualificationReasons: string[];
}

/**
 * Evaluates Must-Have and Disqualifier deterministic gates against candidate claims.
 * CTW-IP-026, CTW-IP-027
 */
export function evaluateGates(
  contract: ProofContract,
  claims: Claim[],
  proofStrength: number
): GateResult {
  const failedMustHaves: string[] = [];
  const disqualificationReasons: string[] = [];

  const mustHaveReqs = contract.requirements.filter(r => r.category === 'must_have');
  const disqualifierReqs = contract.requirements.filter(r => r.category === 'disqualifier');

  // 1. Must-Have Requirement Gate Check (CTW-IP-026)
  mustHaveReqs.forEach(req => {
    const matchingClaims = claims.filter(c => 
      c.requirement_id === req.id || 
      c.claim_text.toLowerCase().includes(req.title.toLowerCase())
    );

    const hasVerifiedOrInferred = matchingClaims.some(c => c.status === 'VERIFIED' || c.status === 'INFERRED');
    if (!hasVerifiedOrInferred) {
      failedMustHaves.push(req.title);
    }
  });

  // 2. Disqualifier Gate Check (CTW-IP-027)
  disqualifierReqs.forEach(req => {
    const matchingConflictingClaims = claims.filter(c =>
      (c.requirement_id === req.id || c.claim_text.toLowerCase().includes(req.title.toLowerCase())) &&
      c.status === 'CONFLICTING'
    );

    if (matchingConflictingClaims.length > 0) {
      disqualificationReasons.push(`Matched Disqualifier Requirement: ${req.title}`);
    }
  });

  const gatePass = failedMustHaves.length === 0;
  const disqualified = disqualificationReasons.length > 0;

  return {
    gatePass,
    disqualified,
    failedMustHaves,
    disqualificationReasons,
  };
}
