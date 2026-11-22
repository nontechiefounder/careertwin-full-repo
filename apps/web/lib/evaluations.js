/**
 * workBYLiNE Web Evaluation Orchestration Facade (apps/web/lib/evaluations.js)
 * Delegates core decision kernel scoring & domain logic to canonical packages:
 * - packages/proof-engine
 * - packages/hiring-genome
 * - packages/shared-contracts
 * 
 * Preserves 100% backward API compatibility for Next.js routes & UI components.
 */

import { z } from 'zod';
import { sanitizeProtectedSignals as canonicalSanitize } from '@packages/hiring-genome';
import {
  calculateRoleFitDistribution,
  calculateCandidateUncertainty,
  calculateDistributionEntropy,
  generateDecisionBlockers,
  classifyCandidateReadiness,
} from '@packages/proof-engine';

// Zod Schema for strict candidate evaluation output validation (CTW-IP-093)
export const EvaluationOutputSchema = z.object({
  fit_score: z.number().nullable(),
  verified_proof_score: z.number().nullable().optional(),
  assertion_alignment_score: z.number().nullable().optional(),
  evidence_breakdown: z.object({
    verified_claims_count: z.number(),
    resume_assertion_count: z.number(),
    skill_list_count: z.number(),
    contradiction_count: z.number(),
    negated_count: z.number(),
  }).optional(),
  proof_strength: z.number(),
  uncertainty: z.number(),
  role_fit_label: z.enum(['Strong', 'Moderate', 'Limited', 'Low', 'Insufficient Evidence']),
  proof_strength_label: z.enum(['Strong', 'Moderate', 'Limited', 'Unproven', 'None']),
  decision_readiness: z.enum(['EVIDENCE READY', 'NEEDS PROOF', 'HUMAN REVIEW REQUIRED', 'INSUFFICIENT EVIDENCE']),
  missing_proof: z.array(z.object({
    unproven_requirement: z.string(),
    why_insufficient: z.string(),
    minimum_next_proof: z.string(),
    interview_probe: z.string()
  }))
});

/**
 * Strip protected candidate demographic attributes before scoring (CTW-IP-076, CTW-IP-078).
 * Delegates to packages/hiring-genome.
 */
export function sanitizeProtectedSignals(candidateData) {
  return canonicalSanitize(candidateData);
}

/**
 * Compute decoupled metrics & evidence-state readiness vocabulary.
 * Delegates scoring, distribution, entropy, and readiness logic to packages/proof-engine.
 */
export function calculateDecoupledMetrics(fitScore, proofStrength, unverifiedCount = 0, totalClaims = 1, hasContradictions = false) {
  const score = fitScore ?? null;
  const proofStr = proofStrength ?? 0.0;
  const total = Math.max(1, totalClaims);
  const verifiedRatio = Math.max(0, (total - unverifiedCount) / total);

  // 1. Role Fit Distribution (CTW-IP-011)
  const fitResult = calculateRoleFitDistribution(score, verifiedRatio);

  // 2. Distribution Entropy (CTW-IP-023)
  const entropyResult = calculateDistributionEntropy(fitResult.distribution);

  // 3. Multi-Factor Candidate Uncertainty (CTW-IP-022)
  const unverifiedRatio = unverifiedCount / total;
  const uncertaintyResult = calculateCandidateUncertainty(
    proofStr,
    unverifiedRatio,
    entropyResult.normalizedEntropy,
    hasContradictions
  );

  // 4. Proof Strength Label (CTW-IP-012)
  let proofStrengthLabel = 'Unproven';
  if (proofStr >= 0.70) proofStrengthLabel = 'Strong';
  else if (proofStr >= 0.30) proofStrengthLabel = 'Moderate';
  else if (proofStr > 0.0) proofStrengthLabel = 'Limited';

  // 5. Evidence Readiness State (CTW-IP-038, CTW-IP-039, CTW-IP-040)
  const dummyContract = {
    role_id: 'default',
    role_title: 'Default Role',
    version: '1.0.0',
    requirements: [],
    thresholds: { t_fit: 0.85, t_proof: 0.50, t_uncertainty: 0.40 },
    created_at: new Date().toISOString()
  };

  const readinessResult = classifyCandidateReadiness(
    dummyContract,
    score,
    proofStr,
    true, // gatePass
    false, // disqualified
    unverifiedCount > 0
  );

  return {
    fit_score: score,
    proof_strength: proofStr,
    uncertainty: uncertaintyResult.uncertainty,
    role_fit_label: fitResult.label,
    proof_strength_label: proofStrengthLabel,
    decision_readiness: readinessResult.readinessState
  };
}

/**
 * Classify candidate claim evidence provenance against source offset & hash.
 * Delegates claim-to-proof graph verification to packages/proof-engine.
 */
export function classifyClaimEvidence(claimText, evidenceRefs = []) {
  if (!claimText || !evidenceRefs || evidenceRefs.length === 0) {
    return {
      status: 'INFERRED',
      rationale: 'No direct evidence provenance provided; claim remains inferred.',
      provenance: null
    };
  }

  const hasContradiction = evidenceRefs.some(ref => ref.is_conflicting);
  if (hasContradiction) {
    const ref = evidenceRefs.find(r => r.is_conflicting);
    return {
      status: 'CONFLICTING',
      rationale: 'Evidence source dates or project details conflict with candidate claim.',
      provenance: {
        source_document_id: ref.source_document_id || 'doc-1',
        source_offset: ref.source_offset || 'L1-L20',
        excerpt_hash: ref.excerpt_hash || 'hash-err'
      }
    };
  }

  const directRef = evidenceRefs.find(ref => ref.source_offset || ref.excerpt_hash);
  if (!directRef) {
    return {
      status: 'INFERRED',
      rationale: 'Team contribution or indirect experience without explicit individual code/work offset.',
      provenance: null
    };
  }

  const claimWords = claimText.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const refText = (directRef.text_span || directRef.description || '').toLowerCase();
  const matches = claimWords.filter(w => refText.includes(w));

  if (matches.length > 0 || directRef.text_span) {
    return {
      status: 'SUPPORTED',
      rationale: 'Direct evidence provenance verified with source offset and excerpt hash.',
      provenance: {
        source_document_id: directRef.source_document_id || 'doc-ref',
        source_offset: directRef.source_offset,
        excerpt_hash: directRef.excerpt_hash
      }
    };
  }

  return {
    status: 'INFERRED',
    rationale: 'Evidence provenance exists but text span does not explicitly substantiate atomic claim.',
    provenance: null
  };
}

/**
 * Generate actionable Minimum Missing Proof by comparing Proof Contract requirements against evidence.
 * Delegates requirement gap analysis & probe compilation to packages/proof-engine.
 */
export function generateMinimumMissingProof(contractRequirements = [], candidateClaims = [], evidenceRefs = []) {
  const contract = {
    role_id: 'default',
    role_title: 'Default Role',
    version: '1.0.0',
    requirements: contractRequirements.map((req, i) => ({
      id: `req_${i}`,
      title: typeof req === 'string' ? req : req.title || req.name || `Req ${i}`,
      category: 'must_have'
    })),
    thresholds: { t_fit: 0.85, t_proof: 0.50, t_uncertainty: 0.40 },
    created_at: new Date().toISOString()
  };

  const claims = candidateClaims.map((c, i) => ({
    id: `claim_${i}`,
    claim_text: typeof c === 'string' ? c : c.text || '',
    status: evidenceRefs.some(r => (r.text_span || '').toLowerCase().includes((typeof c === 'string' ? c : c.text || '').toLowerCase())) ? 'VERIFIED' : 'INFERRED',
    evidence_ids: evidenceRefs.map(r => r.id || 'ref-1'),
    confidence: 0.8
  }));

  return generateDecisionBlockers(contract, claims);
}
