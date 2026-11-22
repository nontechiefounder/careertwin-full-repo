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
    // Strict claim matching: match by requirement_id, or if no requirement_id is specified on claim, match by exact requirement title
    const matchingClaims = claims.filter(c => {
      if (c.requirement_id) {
        return c.requirement_id === req.id;
      }
      return c.claim_text.toLowerCase().includes(req.title.toLowerCase());
    });

    // Check for explicit negation or lack of experience assertion
    const hasExplicitNegation = matchingClaims.some(c =>
      (c as any).is_negated === true ||
      c.status === 'CONFLICTING' ||
      /\b(no|not|never|without|zero|lacks?)\b.*\b(experience|knowledge|skills?|proficiency)\b/i.test(c.claim_text)
    );

    // Only non-negated positive VERIFIED or INFERRED claims can satisfy a requirement
    const positiveVerifiedOrInferred = matchingClaims.filter(c =>
      !(c as any).is_negated &&
      c.status !== 'CONFLICTING' &&
      c.status !== 'UNPROVEN' &&
      (c.status === 'VERIFIED' || c.status === 'INFERRED')
    );

    // A self-reported resume skill list alone does not satisfy a Must-Have requirement
    const hasCorroboratedOrVerified = positiveVerifiedOrInferred.some(c =>
      c.status === 'VERIFIED' && (c as any).evidence_classification !== 'self_reported'
    );

    if (hasExplicitNegation) {
      if (!hasCorroboratedOrVerified) {
        failedMustHaves.push(req.title);
        return;
      }
    }

    if (positiveVerifiedOrInferred.length === 0 || !hasCorroboratedOrVerified) {
      failedMustHaves.push(req.title);
    }
  });

  // 2. Disqualifier Gate Check (CTW-IP-027)
  disqualifierReqs.forEach(req => {
    const matchingConflictingClaims = claims.filter(c => {
      const matches = c.requirement_id ? c.requirement_id === req.id : c.claim_text.toLowerCase().includes(req.title.toLowerCase());
      return matches && c.status === 'CONFLICTING';
    });

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
