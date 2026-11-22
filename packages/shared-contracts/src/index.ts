/**
 * workBYLiNE Shared Contracts (packages/shared-contracts)
 * CTW-IP-005, CTW-IP-015, CTW-IP-016, CTW-IP-017, CTW-IP-093
 */

export interface ProofRequirement {
  id: string;
  title: string;
  category: 'must_have' | 'nice_to_have' | 'disqualifier';
  description?: string;
  importance_weight?: number; // 0.0 to 1.0
}

export interface ProofContract {
  role_id: string;
  role_title: string;
  company?: string;
  version: string; // e.g. "1.0.0"
  requirements: ProofRequirement[];
  thresholds: {
    t_fit: number; // e.g. 0.85
    t_proof: number; // e.g. 0.50
    t_uncertainty: number; // e.g. 0.40
  };
  created_at: string;
}

export interface EvidenceRef {
  id: string;
  document_id: string;
  candidate_id: string;
  role_id: string;
  org_id: string;
  filename: string;
  file_type: 'pdf' | 'docx' | 'csv' | 'json' | 'code';
  sha256: string;
  source_offset?: {
    page?: number;
    start_offset?: number;
    end_offset?: number;
    excerpt_hash?: string;
  };
  source_tier: 'code' | 'repo' | 'document' | 'self_claim';
  created_at: string;
  version: string;
}

export type ClaimStatus = 'VERIFIED' | 'INFERRED' | 'CONFLICTING' | 'MISSING' | 'UNPROVEN';

export interface Claim {
  id: string;
  requirement_id?: string;
  claim_text: string;
  status: ClaimStatus;
  evidence_ids: string[];
  rationale?: string;
  confidence: number; // 0.0 to 1.0
}

export interface ClaimEdge {
  id: string;
  claim_id: string;
  evidence_id: string;
  relationship: 'SUPPORTS' | 'CONTRADICTS';
  provenance_hash: string;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  candidate_id: string;
  role_id: string;
  claim_id: string;
  previous_status?: ClaimStatus;
  new_status: ClaimStatus;
  actor_id: string;
  actor_type: 'system' | 'human_reviewer';
  reason?: string;
  timestamp: string;
  version: string;
}

export type ReadinessState = 
  | 'EVIDENCE READY' 
  | 'NEEDS PROOF' 
  | 'HUMAN REVIEW REQUIRED' 
  | 'INSUFFICIENT EVIDENCE';

export interface RoleFitDistribution {
  p_low: number;
  p_limited: number;
  p_moderate: number;
  p_strong: number;
}

export interface MinimumMissingProofItem {
  unproven_requirement: string;
  why_insufficient: string;
  minimum_next_proof: string;
  interview_probe: string;
}

export interface EvidenceBreakdown {
  verified_claims_count: number;
  resume_assertion_count: number;
  skill_list_count: number;
  contradiction_count: number;
  negated_count: number;
}

export interface EvaluationOutput {
  spec_version: string;
  role_id: string;
  candidate_id: string;
  fit_score: number | null;
  verified_proof_score?: number | null;
  assertion_alignment_score?: number | null;
  evidence_breakdown?: EvidenceBreakdown;
  role_fit_distribution: RoleFitDistribution;
  role_fit_label: 'Strong' | 'Moderate' | 'Limited' | 'Low' | 'Insufficient Evidence';
  proof_strength: number;
  proof_strength_label: 'Strong' | 'Moderate' | 'Limited' | 'None';
  proof_coverage: number;
  uncertainty: number;
  entropy: number;
  contradiction_penalty: number;
  gate_pass: boolean;
  disqualified: boolean;
  disqualification_reasons: string[];
  missing_proof: MinimumMissingProofItem[];
  decision_readiness: ReadinessState;
  what_is_verified: string[];
  what_is_inferred: string[];
  what_remains_uncertain: string[];
  evaluated_at: string;
}
