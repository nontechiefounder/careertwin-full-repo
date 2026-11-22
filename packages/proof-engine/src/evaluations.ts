/**
 * Core Evaluation Engine (Role Fit Distribution, Proof Strength, Coverage, Entropy & Uncertainty)
 * CTW-IP-011, CTW-IP-012, CTW-IP-013, CTW-IP-022, CTW-IP-023, CTW-IP-024, CTW-IP-025
 */

import { Claim, ProofContract, RoleFitDistribution } from '../../shared-contracts/src/index';

/**
 * Calculates Role Fit Distribution over 4 ordered levels (Low, Limited, Moderate, Strong)
 * CTW-IP-011
 */
export function calculateRoleFitDistribution(
  score: number | null,
  verifiedRatio: number
): { distribution: RoleFitDistribution; expectedScore: number | null; label: 'Strong' | 'Moderate' | 'Limited' | 'Low' | 'Insufficient Evidence' } {
  if (score === null || score === undefined) {
    return {
      distribution: { p_low: 0.25, p_limited: 0.25, p_moderate: 0.25, p_strong: 0.25 },
      expectedScore: null,
      label: 'Insufficient Evidence',
    };
  }

  const s = Math.min(1.0, Math.max(0.0, score));

  // Compute Dirichlet-inspired distribution over levels
  let p_strong = Math.max(0.0, Math.min(1.0, (s - 0.70) / 0.30)) * 0.7 + s * 0.3 * verifiedRatio;
  let p_moderate = Math.max(0.0, 1.0 - Math.abs(s - 0.70) * 3) * 0.6;
  let p_limited = Math.max(0.0, 1.0 - Math.abs(s - 0.50) * 3) * 0.4;
  let p_low = Math.max(0.0, (0.50 - s) / 0.50) * 0.8;

  const total = p_strong + p_moderate + p_limited + p_low || 1.0;
  p_strong /= total;
  p_moderate /= total;
  p_limited /= total;
  p_low /= total;

  let label: 'Strong' | 'Moderate' | 'Limited' | 'Low' | 'Insufficient Evidence' = 'Low';
  if (s >= 0.85) label = 'Strong';
  else if (s >= 0.70) label = 'Moderate';
  else if (s >= 0.50) label = 'Limited';

  return {
    distribution: {
      p_low: Number(p_low.toFixed(3)),
      p_limited: Number(p_limited.toFixed(3)),
      p_moderate: Number(p_moderate.toFixed(3)),
      p_strong: Number(p_strong.toFixed(3)),
    },
    expectedScore: Number(s.toFixed(2)),
    label,
  };
}

/**
 * Calculates Distribution Entropy H(p) = - sum p_k log2(p_k)
 * CTW-IP-023
 */
export function calculateDistributionEntropy(dist: RoleFitDistribution): { entropy: number; normalizedEntropy: number } {
  const probs = [dist.p_low, dist.p_limited, dist.p_moderate, dist.p_strong];
  let h = 0.0;

  probs.forEach(p => {
    if (p > 0.0001) {
      h -= p * Math.log2(p);
    }
  });

  const maxH = Math.log2(4); // 2.0 bits max entropy for 4 levels
  const normH = Math.min(1.0, Math.max(0.0, h / maxH));

  return {
    entropy: Number(h.toFixed(3)),
    normalizedEntropy: Number(normH.toFixed(3)),
  };
}

/**
 * Calculates Evidence Strength S(e) and Proof Coverage C(p)
 * CTW-IP-012, CTW-IP-013
 */
export function calculateProofMetrics(
  contract: ProofContract,
  claims: Claim[],
  rawProofStrength?: number
): { proofStrength: number; proofCoverage: number; proofLabel: 'Strong' | 'Moderate' | 'Limited' | 'None' } {
  const totalReqs = contract.requirements.length || 1;
  const verifiedClaims = claims.filter(c => c.status === 'VERIFIED');
  const inferredClaims = claims.filter(c => c.status === 'INFERRED');

  // Duplicate evidence handling: Collect unique evidence IDs
  const uniqueEvidenceIds = new Set<string>();
  claims.forEach(c => {
    (c.evidence_ids || []).forEach(eid => uniqueEvidenceIds.add(eid));
  });

  // Approved requirement weights (CTW-IP-005, CTW-IP-013)
  let totalWeight = 0;
  let satisfiedWeight = 0;
  for (const req of contract.requirements) {
    const weight = typeof req.importance_weight === 'number' ? req.importance_weight : 1.0;
    totalWeight += weight;

    // Strict matching: by requirement_id, or if unassigned, by exact requirement title
    const reqClaims = claims.filter(c => {
      if (c.requirement_id) {
        return c.requirement_id === req.id;
      }
      return ((c.claim_text || (c as any).statement || '').toLowerCase().includes(req.title.toLowerCase()));
    });

    const isNegated = reqClaims.some(c =>
      (c as any).is_negated === true ||
      c.status === 'CONFLICTING' ||
      /\b(no|not|never|without|zero|lacks?)\b.*\b(experience|knowledge|skills?|proficiency)\b/i.test(c.claim_text)
    );

    const matchingVerified = verifiedClaims.filter(c => {
      const match = c.requirement_id ? c.requirement_id === req.id : ((c.claim_text || (c as any).statement || '').toLowerCase().includes(req.title.toLowerCase()));
      return match && !(c as any).is_negated && c.status === 'VERIFIED';
    });

    const matchingInferred = inferredClaims.filter(c => {
      const match = c.requirement_id ? c.requirement_id === req.id : ((c.claim_text || (c as any).statement || '').toLowerCase().includes(req.title.toLowerCase()));
      return match && !(c as any).is_negated && c.status === 'INFERRED';
    });

    const hasDetailedResumeAssertion = matchingInferred.some(c =>
      (c as any).source_type === 'resume_assertion'
    );

    // If candidate has an explicit negated assertion for this requirement,
    // only separate qualifying verified corroborating evidence can satisfy it.
    if (isNegated) {
      if (matchingVerified.length > 0) {
        satisfiedWeight += weight;
      }
      // Negated requirements without separate verified evidence earn 0 weight
    } else if (matchingVerified.length > 0) {
      satisfiedWeight += weight;
    } else if (hasDetailedResumeAssertion) {
      // Detailed resume assertion satisfies coverage without inflating to verified
      satisfiedWeight += weight;
    } else if (matchingInferred.length > 0) {
      // Skill-list mentions earn 0.5 weight
      satisfiedWeight += weight * 0.5;
    }
  }

  const proofCoverage = totalWeight > 0
    ? Math.min(1.0, Math.max(0.0, satisfiedWeight / totalWeight))
    : Math.min(1.0, Math.max(0.0, (verifiedClaims.length + inferredClaims.length * 0.5) / totalReqs));

  // Authoritative evidence-derived proof strength (CTW-IP-012); caller overrides are ignored.
  void rawProofStrength;
  let proofStrength = 0.0;
  if (verifiedClaims.length === 0) {
    // Zero verified claims cannot exceed 0.10 (strictly unproven)
    proofStrength = inferredClaims.length > 0 ? 0.10 : 0.0;
  } else {
    const verifiedSum = verifiedClaims.reduce((acc, c) => acc + c.confidence, 0);
    const inferredSum = inferredClaims.reduce((acc, c) => acc + c.confidence * 0.5, 0);
    proofStrength = (verifiedSum + inferredSum) / Math.max(1, claims.length);
    // Duplicate evidence damping: single evidence ref for multiple claims
    if (uniqueEvidenceIds.size === 1 && verifiedClaims.length > 1) {
      proofStrength = proofStrength * 0.85;
    }
  }

  proofStrength = Math.min(1.0, Math.max(0.0, proofStrength));

  let proofLabel: 'Strong' | 'Moderate' | 'Limited' | 'None' = 'None';
  if (proofStrength >= 0.70) proofLabel = 'Strong';
  else if (proofStrength >= 0.30) proofLabel = 'Moderate';
  else if (proofStrength > 0.0) proofLabel = 'Limited';

  return {
    proofStrength: Number(proofStrength.toFixed(2)),
    proofCoverage: Number(proofCoverage.toFixed(2)),
    proofLabel,
  };
}

/**
 * Calculates Candidate Uncertainty incorporating Distribution Entropy H(p)
 * CTW-IP-022, CTW-IP-023, CTW-IP-024, CTW-IP-025
 */
export function calculateCandidateUncertainty(
  proofStrength: number,
  unverifiedRatio: number,
  normalizedEntropy: number,
  hasContradictions: boolean
): { uncertainty: number; contradictionPenalty: number } {
  const contradictionPenalty = hasContradictions ? 0.35 : 0.0; // CTW-IP-025

  // Canonical Multi-Factor Uncertainty (CTW-IP-022, CTW-IP-023)
  const proofDeficit = 1.0 - proofStrength;
  const rawUncertainty =
    0.40 * proofDeficit +
    0.25 * unverifiedRatio +
    0.25 * normalizedEntropy +
    contradictionPenalty;

  const uncertainty = Math.min(1.0, Math.max(0.0, rawUncertainty));

  return {
    uncertainty: Number(uncertainty.toFixed(2)),
    contradictionPenalty,
  };
}
