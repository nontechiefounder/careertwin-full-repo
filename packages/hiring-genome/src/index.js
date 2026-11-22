/**
 * workBYLiNE Hiring Genome Package (packages/hiring-genome) — Unified Pure JavaScript
 * CTW-IP-005, CTW-IP-076, CTW-IP-078, CTW-IP-079
 */

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
 * @param {Record<string, any>} hiringRun
 */
export function parseProofContract(hiringRun) {
  const existingContract =
    hiringRun?.proof_contract || (Array.isArray(hiringRun?.requirements) ? hiringRun : null);
  if (existingContract && Array.isArray(existingContract.requirements)) {
    const rawThresholds = existingContract.thresholds || hiringRun?.brief_json?.thresholds || {};
    return {
      role_id: existingContract.role_id || hiringRun?.id || 'unknown_role',
      role_title: existingContract.role_title || hiringRun?.role_title || 'Unspecified Role',
      company: existingContract.company || hiringRun?.company || undefined,
      version: existingContract.version || hiringRun?.brief_json?.contract_version || '1.0.0',
      requirements: existingContract.requirements.map((r, idx) => ({
        id: r.id || `req_${idx + 1}`,
        title: r.title || `Requirement ${idx + 1}`,
        category: (r.category || 'must_have').toLowerCase(),
        importance_weight:
          typeof r.importance_weight === 'number'
            ? r.importance_weight
            : r.category === 'nice_to_have'
              ? 0.5
              : 1.0,
        min_evidence_items: typeof r.min_evidence_items === 'number' ? r.min_evidence_items : 1,
      })),
      thresholds: {
        t_fit:
          typeof rawThresholds.t_fit === 'number'
            ? rawThresholds.t_fit
            : PROVISIONAL_DEFAULT_THRESHOLDS.t_fit,
        t_proof:
          typeof rawThresholds.t_proof === 'number'
            ? rawThresholds.t_proof
            : PROVISIONAL_DEFAULT_THRESHOLDS.t_proof,
        t_uncertainty:
          typeof rawThresholds.t_uncertainty === 'number'
            ? rawThresholds.t_uncertainty
            : PROVISIONAL_DEFAULT_THRESHOLDS.t_uncertainty,
      },
      created_at: existingContract.created_at || hiringRun?.created_at || new Date().toISOString(),
    };
  }

  const briefJson = hiringRun?.brief_json || {};
  const mustHaves = hiringRun?.must_haves || briefJson.must_haves || [];
  const niceToHaves = hiringRun?.nice_to_haves || briefJson.nice_to_haves || [];
  const disqualifiers = hiringRun?.disqualifiers || briefJson.disqualifiers || [];

  const requirements = [];

  mustHaves.forEach((req, idx) => {
    requirements.push({
      id: `mh_${idx + 1}`,
      title: typeof req === 'string' ? req : req?.title || `Must-Have ${idx + 1}`,
      category: 'must_have',
      importance_weight: 1.0,
    });
  });

  niceToHaves.forEach((req, idx) => {
    requirements.push({
      id: `nth_${idx + 1}`,
      title: typeof req === 'string' ? req : req?.title || `Nice-to-Have ${idx + 1}`,
      category: 'nice_to_have',
      importance_weight: 0.5,
    });
  });

  disqualifiers.forEach((req, idx) => {
    requirements.push({
      id: `disq_${idx + 1}`,
      title: typeof req === 'string' ? req : req?.title || `Disqualifier ${idx + 1}`,
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
      t_fit:
        typeof customThresholds.t_fit === 'number'
          ? customThresholds.t_fit
          : PROVISIONAL_DEFAULT_THRESHOLDS.t_fit,
      t_proof:
        typeof customThresholds.t_proof === 'number'
          ? customThresholds.t_proof
          : PROVISIONAL_DEFAULT_THRESHOLDS.t_proof,
      t_uncertainty:
        typeof customThresholds.t_uncertainty === 'number'
          ? customThresholds.t_uncertainty
          : PROVISIONAL_DEFAULT_THRESHOLDS.t_uncertainty,
    },
    created_at: hiringRun?.created_at || new Date().toISOString(),
  };
}

/**
 * Protected Demographic Attributes Blocklist (CTW-IP-076, CTW-IP-078)
 * Strictly deletes prohibited signals before candidate evaluation.
 */
const PROHIBITED_ATTRIBUTES = [
  'age',
  'date_of_birth',
  'dob',
  'gender',
  'sex',
  'sexual_orientation',
  'race',
  'ethnicity',
  'religion',
  'disability',
  'medical_condition',
  'pregnancy',
  'nationality',
  'citizenship',
  'address',
  'postal_code',
  'zip_code',
  'photo_url',
  'avatar',
  'graduation_year',
  'marital_status',
];

/**
 * Strips protected signals from untrusted candidate data objects.
 * CTW-IP-076
 * @param {any} data
 */
export function sanitizeProtectedSignals(data) {
  if (!data || typeof data !== 'object') return data;
  const sanitized = Array.isArray(data) ? [...data] : { ...data };

  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (PROHIBITED_ATTRIBUTES.includes(lowerKey)) {
      delete sanitized[key];
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeProtectedSignals(sanitized[key]);
    }
  }

  return sanitized;
}

/**
 * Validates that candidate evidence items map to job-relevant requirements.
 * CTW-IP-079
 * @param {string} claimText
 * @param {any} contract
 */
export function validateJobRelevance(claimText, contract) {
  if (!claimText || !contract || !contract.requirements) return false;
  const lowerClaim = claimText.toLowerCase();

  return contract.requirements.some((req) => {
    const words = String(req.title || '')
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    return words.some((w) => lowerClaim.includes(w));
  });
}
