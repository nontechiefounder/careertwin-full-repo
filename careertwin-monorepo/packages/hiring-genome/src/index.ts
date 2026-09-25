/**
 * CareerTWiN Hiring Genome Package (packages/hiring-genome)
 * CTW-IP-005, CTW-IP-076, CTW-IP-078, CTW-IP-079
 */

import { ProofContract, ProofRequirement } from '../../shared-contracts/src/index';

/**
 * Default fallback thresholds if role-specific Proof Contract thresholds are missing.
 * Explicitly versioned & labeled provisional v1.0.
 */
export const PROVISIONAL_DEFAULT_THRESHOLDS = {
  version: '1.0.0-provisional',
  t_fit: 0.85,
  t_proof: 0.50,
  t_uncertainty: 0.40,
};

/**
 * Extracts and validates Proof Contract from hiring run raw data or brief JSON.
 * CTW-IP-005
 */
export function parseProofContract(hiringRun: Record<string, any>): ProofContract {
  const briefJson = hiringRun?.brief_json || {};
  const mustHaves = hiringRun?.must_haves || briefJson.must_haves || [];
  const niceToHaves = hiringRun?.nice_to_haves || briefJson.nice_to_haves || [];
  const disqualifiers = hiringRun?.disqualifiers || briefJson.disqualifiers || [];

  const requirements: ProofRequirement[] = [];

  mustHaves.forEach((req: string, idx: number) => {
    requirements.push({
      id: `mh_${idx + 1}`,
      title: typeof req === 'string' ? req : (req as any).title || `Must-Have ${idx + 1}`,
      category: 'must_have',
      importance_weight: 1.0,
    });
  });

  niceToHaves.forEach((req: string, idx: number) => {
    requirements.push({
      id: `nth_${idx + 1}`,
      title: typeof req === 'string' ? req : (req as any).title || `Nice-to-Have ${idx + 1}`,
      category: 'nice_to_have',
      importance_weight: 0.5,
    });
  });

  disqualifiers.forEach((req: string, idx: number) => {
    requirements.push({
      id: `disq_${idx + 1}`,
      title: typeof req === 'string' ? req : (req as any).title || `Disqualifier ${idx + 1}`,
      category: 'disqualifier',
      importance_weight: 1.0,
    });
  });

  const customThresholds = briefJson.thresholds || {};

  return {
    role_id: hiringRun?.id || 'unknown_role',
    role_title: hiringRun?.role_title || 'Unspecified Role',
    company: hiringRun?.company || undefined,
    version: briefJson.contract_version || '1.0.0',
    requirements,
    thresholds: {
      t_fit: typeof customThresholds.t_fit === 'number' ? customThresholds.t_fit : PROVISIONAL_DEFAULT_THRESHOLDS.t_fit,
      t_proof: typeof customThresholds.t_proof === 'number' ? customThresholds.t_proof : PROVISIONAL_DEFAULT_THRESHOLDS.t_proof,
      t_uncertainty: typeof customThresholds.t_uncertainty === 'number' ? customThresholds.t_uncertainty : PROVISIONAL_DEFAULT_THRESHOLDS.t_uncertainty,
    },
    created_at: hiringRun?.created_at || new Date().toISOString(),
  };
}

/**
 * Protected Demographic Attributes Blocklist (CTW-IP-076, CTW-IP-078)
 * Strictly deletes prohibited signals before candidate evaluation.
 */
const PROHIBITED_ATTRIBUTES = [
  'age', 'date_of_birth', 'dob', 'gender', 'sex', 'sexual_orientation',
  'race', 'ethnicity', 'religion', 'disability', 'medical_condition',
  'pregnancy', 'nationality', 'citizenship', 'address', 'postal_code',
  'zip_code', 'photo_url', 'avatar', 'graduation_year', 'marital_status'
];

/**
 * Strips protected signals from untrusted candidate data objects.
 * CTW-IP-076
 */
export function sanitizeProtectedSignals<T extends Record<string, any>>(data: T): T {
  if (!data || typeof data !== 'object') return data;
  const sanitized = Array.isArray(data) ? [...data] : { ...data };

  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (PROHIBITED_ATTRIBUTES.includes(lowerKey)) {
      delete (sanitized as any)[key];
    } else if (typeof (sanitized as any)[key] === 'object' && (sanitized as any)[key] !== null) {
      (sanitized as any)[key] = sanitizeProtectedSignals((sanitized as any)[key]);
    }
  }

  return sanitized as T;
}

/**
 * Validates that candidate evidence items map to job-relevant requirements.
 * CTW-IP-079
 */
export function validateJobRelevance(claimText: string, contract: ProofContract): boolean {
  if (!claimText || !contract || !contract.requirements) return false;
  const lowerClaim = claimText.toLowerCase();

  return contract.requirements.some(req => {
    const words = req.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    return words.some(w => lowerClaim.includes(w));
  });
}
