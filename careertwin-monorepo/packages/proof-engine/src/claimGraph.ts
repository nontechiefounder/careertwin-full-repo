/**
 * Claim-to-Proof Graph & Provenance Verification Engine
 * CTW-IP-009, CTW-IP-010, CTW-IP-015, CTW-IP-016, CTW-IP-017, CTW-IP-018, CTW-IP-074
 */

import { Claim, ClaimEdge, EvidenceRef, LedgerEntry, ClaimStatus } from '../../shared-contracts/src/index';

export interface ExtractedClaimInput {
  id: string;
  requirement_id?: string;
  claim_text: string;
  evidence_refs: EvidenceRef[];
  is_conflicting?: boolean;
  is_inferred?: boolean;
}

/**
 * CTW-IP-074: Evidence-Subset Validation Logic
 * Ensures every EvidenceRef referenced by a claim belongs strictly to the authorized set.
 */
export function validateEvidenceSubsets(
  claims: ExtractedClaimInput[],
  allowedEvidenceSet: EvidenceRef[]
): { valid: boolean; rejected_evidence_ids: string[] } {
  const allowedMap = new Set(allowedEvidenceSet.map(e => e.id));
  const rejected: string[] = [];

  for (const claim of claims) {
    for (const ref of claim.evidence_refs || []) {
      if (!allowedMap.has(ref.id)) {
        rejected.push(ref.id);
      }
    }
  }

  return {
    valid: rejected.length === 0,
    rejected_evidence_ids: Array.from(new Set(rejected)),
  };
}

/**
 * Processes extracted claims and builds the Claim Graph & Ledger Entries.
 * CTW-IP-010, CTW-IP-016, CTW-IP-017, CTW-IP-018
 */
export function buildClaimGraphAndLedger(
  rawClaims: ExtractedClaimInput[],
  allowedEvidence: EvidenceRef[],
  candidateId: string,
  roleId: string,
  actorId: string = 'system'
): {
  claims: Claim[];
  edges: ClaimEdge[];
  ledger: LedgerEntry[];
  verifiedCount: number;
  inferredCount: number;
  uncertainCount: number;
  conflictingCount: number;
} {
  const subsetCheck = validateEvidenceSubsets(rawClaims, allowedEvidence);
  if (!subsetCheck.valid) {
    console.warn(`[CTW-IP-074 REJECTION] Rejected unauthorized EvidenceRef IDs: ${subsetCheck.rejected_evidence_ids.join(', ')}`);
  }

  const claims: Claim[] = [];
  const edges: ClaimEdge[] = [];
  const ledger: LedgerEntry[] = [];

  let verifiedCount = 0;
  let inferredCount = 0;
  let uncertainCount = 0;
  let conflictingCount = 0;

  const allowedMap = new Map(allowedEvidence.map(e => [e.id, e]));

  rawClaims.forEach((input, idx) => {
    // Filter to only authorized evidence refs
    const validRefs = (input.evidence_refs || []).filter(e => allowedMap.has(e.id));
    let status: ClaimStatus = 'UNPROVEN';
    let confidence = 0.5;

    if (input.is_conflicting) {
      status = 'CONFLICTING';
      confidence = 0.2;
      conflictingCount++;
    } else if (validRefs.length > 0) {
      // Check if evidence carries verifiable source offset & excerpt hash, and is not self_claim (CTW-IP-015)
      const hasStrictProvenance = validRefs.some(
        e => e.source_tier !== 'self_claim' && e.source_offset && (e.source_offset.excerpt_hash || e.source_offset.start_offset !== undefined)
      );

      if (hasStrictProvenance || validRefs.some(e => e.source_tier === 'code' || e.source_tier === 'repo')) {
        status = 'VERIFIED';
        confidence = 0.95;
        verifiedCount++;
      } else {
        status = 'INFERRED';
        confidence = 0.40;
        inferredCount++;
      }
    } else {
      uncertainCount++;
    }

    const claimObj: Claim = {
      id: input.id,
      requirement_id: input.requirement_id,
      claim_text: input.claim_text,
      status,
      evidence_ids: validRefs.map(e => e.id),
      confidence,
    };
    claims.push(claimObj);

    // Build Claim Edges
    validRefs.forEach(ref => {
      const edgeId = `edge_${claimObj.id}_${ref.id}`;
      const provHash = `${claimObj.id}:${ref.id}:${status}`;
      edges.push({
        id: edgeId,
        claim_id: claimObj.id,
        evidence_id: ref.id,
        relationship: status === 'CONFLICTING' ? 'CONTRADICTS' : 'SUPPORTS',
        provenance_hash: provHash,
        created_at: new Date().toISOString(),
      });
    });

    // Build Immutable Audit Ledger Entry
    ledger.push({
      id: `ledg_${claimObj.id}_init`,
      candidate_id: candidateId,
      role_id: roleId,
      claim_id: claimObj.id,
      new_status: status,
      actor_id: actorId,
      actor_type: 'system',
      reason: `System initial extraction (status: ${status})`,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    });
  });

  return {
    claims,
    edges,
    ledger,
    verifiedCount,
    inferredCount,
    uncertainCount,
    conflictingCount,
  };
}
