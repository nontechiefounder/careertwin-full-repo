/**
 * Decision Blocker Engine & Minimum Sufficient Proof Protocol
 * CTW-IP-031, CTW-IP-033, CTW-IP-086, CTW-IP-087
 */

import { Claim, MinimumMissingProofItem, ProofContract } from '../../shared-contracts/src/index';

/**
 * Identifies unproven requirements blocking a hiring decision and generates Minimum Missing Proof items.
 * CTW-IP-031, CTW-IP-033, CTW-IP-086, CTW-IP-087
 */
export function generateDecisionBlockers(
  contract: ProofContract,
  claims: Claim[]
): MinimumMissingProofItem[] {
  const missingProofItems: MinimumMissingProofItem[] = [];

  // Disqualifier requirements are negative gates, not capabilities candidate must prove
  const unprovenReqs = contract.requirements.filter(req => {
    if (req.category === 'disqualifier') return false;

    const matchingClaims = claims.filter(c =>
      c.requirement_id ? c.requirement_id === req.id : c.claim_text.toLowerCase().includes(req.title.toLowerCase())
    );

    const hasExplicitNegation = matchingClaims.some(c =>
      (c as any).is_negated === true ||
      c.status === 'CONFLICTING' ||
      /\b(no|not|never|without|zero|lacks?)\b.*\b(experience|knowledge|skills?|proficiency)\b/i.test(c.claim_text)
    );

    const hasVerifiedPositive = matchingClaims.some(c =>
      !(c as any).is_negated &&
      c.status !== 'CONFLICTING' &&
      c.status !== 'UNPROVEN' &&
      c.status === 'VERIFIED'
    );

    if (hasExplicitNegation && !hasVerifiedPositive) {
      return true;
    }

    return !hasVerifiedPositive;
  });

  unprovenReqs.forEach(req => {
    const matchingClaims = claims.filter(c =>
      c.requirement_id ? c.requirement_id === req.id : c.claim_text.toLowerCase().includes(req.title.toLowerCase())
    );

    const negatedClaim = matchingClaims.find(c =>
      (c as any).is_negated === true ||
      c.status === 'CONFLICTING' ||
      /\b(no|not|never|without|zero|lacks?)\b.*\b(experience|knowledge|skills?|proficiency)\b/i.test(c.claim_text)
    );

    const selfReportedClaim = matchingClaims.find(c =>
      (c as any).evidence_classification === 'self_reported' ||
      c.status === 'INFERRED'
    );

    let whyInsufficient: string;
    if (negatedClaim) {
      whyInsufficient = `Candidate evidence explicitly indicates lack of experience: "${negatedClaim.claim_text}". Must-Have requirement "${req.title}" is unsatisfied.`;
    } else if (selfReportedClaim) {
      whyInsufficient = `Requirement "${req.title}" appears in resume skill list only ("${selfReportedClaim.claim_text}"). Self-reported listing does not demonstrate verified production competence under ProofContract.`;
    } else {
      whyInsufficient = `Not mentioned in candidate document. No verified evidence ref provided for requirement "${req.title}".`;
    }

    missingProofItems.push({
      unproven_requirement: req.title,
      gate_type: req.category || 'must_have',
      why_insufficient: whyInsufficient,
      minimum_next_proof: `Submit targeted code repository sample, architectural diagram, or work sample demonstrating ${req.title}.`,
      interview_probe: `Probe candidate on real production scenarios handling ${req.title}: "Describe a specific production incident where you implemented ${req.title}."`,
    });
  });

  // Fallback defaults if no specific contract requirements were mapped
  if (missingProofItems.length === 0 && claims.some(c => c.status === 'INFERRED' || c.status === 'UNPROVEN')) {
    missingProofItems.push({
      unproven_requirement: 'Production System Scale & Architecture',
      why_insufficient: 'Candidate claims experience, but lacks direct verified code or repository evidence span.',
      minimum_next_proof: 'Provide link to public repository, technical writeup, or verified GitHub commit.',
      interview_probe: 'Ask candidate to sketch their system architecture and explain trade-offs made during scaling.',
    });
  }

  return missingProofItems;
}
