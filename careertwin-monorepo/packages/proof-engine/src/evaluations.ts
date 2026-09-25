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
): { distribution: RoleFitDistribution; expectedScore: number | null; label: 'Strong' | 'Moderate' | 'Limited' | 'Low' } {
  if (score === null || score === undefined) {
    return {
      distribution: { p_low: 0.25, p_limited: 0.25, p_moderate: 0.25, p_strong: 0.25 },
      expectedScore: null,
      label: 'Low',
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

  let label: 'Strong' | 'Moderate' | 'Limited' | 'Low' = 'Low';
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

  // Proof coverage ratio (CTW-IP-013)
  const satisfiedCount = verifiedClaims.length + inferredClaims.length * 0.5;
  const proofCoverage = Math.min(1.0, Math.max(0.0, satisfiedCount / totalReqs));

  // Proof strength score (CTW-IP-012)
  let proofStrength = rawProofStrength;
  if (proofStrength === undefined || proofStrength === null) {
    const verifiedSum = verifiedClaims.reduce((acc, c) => acc + c.confidence, 0);
    const inferredSum = inferredClaims.reduce((acc, c) => acc + c.confidence * 0.5, 0);
    proofStrength = (verifiedSum + inferredSum) / Math.max(1, claims.length);
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
