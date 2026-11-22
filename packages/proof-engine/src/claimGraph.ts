/**
 * Claim-to-Proof Graph & Provenance Verification Engine
 * CTW-IP-009, CTW-IP-010, CTW-IP-015, CTW-IP-016, CTW-IP-017, CTW-IP-018, CTW-IP-074
 */

import { Claim, ClaimEdge, EvidenceRef, LedgerEntry, ClaimStatus } from '../../shared-contracts/src/index';

export interface TrustedProvenanceRecord {
  evidence_id: string;
  document_id: string;
  sha256: string;
  authorship_verified: true;
  provenance_verified: true;
  verification_source: string;
}

interface TrustedProvenanceSeal {
  evidenceId: string;
  documentId: string;
  sha256: string;
  sourceTier: string;
  verificationSource: string;
  authorshipVerified: true;
  provenanceVerified: true;
}

const trustedProvenanceRegistry = new WeakMap<object, TrustedProvenanceSeal>();

/**
 * Issues a non-forgeable runtime attestation for a code/repo EvidenceRef whose
 * authorship and repository provenance were verified by a trusted server source.
 * Plain JSON payloads cannot forge WeakMap entries.
 * Enforces mandatory document_id and sha256 hash bindings.
 */
export function attestTrustedEvidenceProvenance<T extends EvidenceRef>(
  ref: T,
  proof: {
    verification_source: string;
    document_id: string;
    sha256: string;
    authorship_verified: true;
    provenance_verified: true;
  }
): T & { authorship_verified: true; provenance_verified: true; verification_source: string } {
  if (!ref || typeof ref !== 'object' || !ref.id) {
    throw new Error('Cannot attest provenance for EvidenceRef missing id');
  }
  if (typeof ref.document_id !== 'string' || ref.document_id.trim().length === 0) {
    throw new Error('Cannot attest provenance for EvidenceRef missing document_id');
  }
  if (typeof ref.sha256 !== 'string' || ref.sha256.trim().length === 0) {
    throw new Error('Cannot attest provenance for EvidenceRef missing sha256');
  }
  if (ref.source_tier !== 'code' && ref.source_tier !== 'repo') {
    throw new Error(`Cannot attest code/repo provenance for source_tier '${ref.source_tier}'`);
  }
  if (
    !proof ||
    proof.authorship_verified !== true ||
    proof.provenance_verified !== true ||
    typeof proof.verification_source !== 'string' ||
    proof.verification_source.trim().length === 0
  ) {
    throw new Error('Explicit authorship_verified=true, provenance_verified=true, and verification_source are required');
  }
  if (typeof proof.document_id !== 'string' || proof.document_id.trim().length === 0 || proof.document_id !== ref.document_id) {
    throw new Error(`Attestation document_id mismatch: expected '${ref.document_id}', got '${proof?.document_id}'`);
  }
  if (typeof proof.sha256 !== 'string' || proof.sha256.trim().length === 0 || proof.sha256 !== ref.sha256) {
    throw new Error(`Attestation sha256 mismatch: expected '${ref.sha256}', got '${proof?.sha256}'`);
  }

  const attested = {
    ...ref,
    authorship_verified: true as const,
    provenance_verified: true as const,
    verification_source: proof.verification_source.trim(),
  };

  trustedProvenanceRegistry.set(attested, {
    evidenceId: attested.id,
    documentId: attested.document_id,
    sha256: attested.sha256,
    sourceTier: attested.source_tier,
    verificationSource: attested.verification_source,
    authorshipVerified: true,
    provenanceVerified: true,
  });

  return attested;
}

function isTrustedCorroboratedCodeRef(
  ref: EvidenceRef,
  trustedProvenance?: Record<string, TrustedProvenanceRecord>
): boolean {
  if (ref.source_tier !== 'code' && ref.source_tier !== 'repo') {
    return false;
  }
  if (typeof ref.sha256 !== 'string' || ref.sha256.length === 0) {
    return false;
  }
  if (typeof ref.document_id !== 'string' || ref.document_id.length === 0) {
    return false;
  }
  if (
    !ref.source_offset ||
    typeof ref.source_offset.start_offset !== 'number' ||
    typeof ref.source_offset.end_offset !== 'number' ||
    ref.source_offset.start_offset > ref.source_offset.end_offset ||
    typeof ref.source_offset.excerpt_hash !== 'string' ||
    ref.source_offset.excerpt_hash.length === 0
  ) {
    return false;
  }

  // Explicit rejection flags always fail closed
  if ((ref as any).authorship_verified === false || (ref as any).provenance_verified === false) {
    return false;
  }

  // Check 1: Unforgeable WeakMap runtime seal bound to id + document_id + sha256 + source_tier
  const seal = trustedProvenanceRegistry.get(ref);
  if (
    seal &&
    seal.authorshipVerified === true &&
    seal.provenanceVerified === true &&
    seal.evidenceId === ref.id &&
    seal.documentId === ref.document_id &&
    seal.sha256 === ref.sha256 &&
    seal.sourceTier === ref.source_tier &&
    seal.verificationSource.length > 0 &&
    (ref as any).authorship_verified === true &&
    (ref as any).provenance_verified === true
  ) {
    return true;
  }

  // Check 2: Explicit server-supplied trustedProvenance registry entry with mandatory evidence_id, document_id, and sha256 bindings
  const record = trustedProvenance?.[ref.id];
  if (
    record &&
    record.authorship_verified === true &&
    record.provenance_verified === true &&
    typeof record.verification_source === 'string' &&
    record.verification_source.trim().length > 0 &&
    typeof record.evidence_id === 'string' &&
    record.evidence_id.trim().length > 0 &&
    record.evidence_id === ref.id &&
    typeof record.document_id === 'string' &&
    record.document_id.trim().length > 0 &&
    record.document_id === ref.document_id &&
    typeof record.sha256 === 'string' &&
    record.sha256.trim().length > 0 &&
    record.sha256 === ref.sha256
  ) {
    return true;
  }

  return false;
}

export interface ExtractedClaimInput {
  id: string;
  requirement_id?: string;
  claim_text: string;
  evidence_refs: EvidenceRef[];
  is_conflicting?: boolean;
  is_inferred?: boolean;
  is_negated?: boolean;
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
  actorId: string = 'system',
  evaluatedAt?: string,
  trustedProvenance?: Record<string, TrustedProvenanceRecord>
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

  const stableSerializeRef = (val: unknown): string => {
    if (val === null || typeof val !== 'object') return JSON.stringify(val);
    if (Array.isArray(val)) return `[${val.map((v) => stableSerializeRef(v)).join(',')}]`;
    const obj = val as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableSerializeRef(obj[k])}`).join(',')}}`;
  };

  const allowedMap = new Map<string, EvidenceRef>();
  const allowedSigMap = new Map<string, string>();
  for (const ev of allowedEvidence) {
    if (!ev?.id) continue;
    const sig = stableSerializeRef(ev);
    const existingSig = allowedSigMap.get(ev.id);
    if (existingSig !== undefined) {
      if (existingSig !== sig) {
        throw new Error(`EVIDENCE_REF_CONFLICT: Conflicting EvidenceRef content shares id "${ev.id}"`);
      }
      continue;
    }
    allowedMap.set(ev.id, ev);
    allowedSigMap.set(ev.id, sig);
  }

  rawClaims.forEach((input, idx) => {
    // Filter and resolve strictly against canonical allowedEvidence objects;
    // never consume caller-supplied nested evidence_refs payloads or promotion flags.
    const seenForClaim = new Set<string>();
    const validRefs = (input.evidence_refs || [])
      .map(e => allowedMap.get(e.id))
      .filter((e): e is EvidenceRef => {
        if (!e || seenForClaim.has(e.id)) return false;
        seenForClaim.add(e.id);
        return true;
      });
    let status: ClaimStatus = 'UNPROVEN';
    let confidence = 0.5;

    const isNegated = Boolean(
      input.is_negated ||
      /\b(no|not|never|lacks?|without|denies|zero)\b.*\b(experience|knowledge|skills?|background|proficiency)\b/i.test(input.claim_text) ||
      /\bno\s+([A-Za-z0-9_.-]+)\s+experience\b/i.test(input.claim_text)
    );

    if (input.is_conflicting || isNegated) {
      status = 'CONFLICTING';
      confidence = 0.1;
      conflictingCount++;
    } else if (validRefs.length > 0) {
      // Check if evidence is explicitly self-reported, skill-list, or resume assertion (C09-04)
      const isSelfReported = (input as any).evidence_classification === 'self_reported' ||
                             (input as any).evidence_classification === 'skill_list_mention' ||
                             (input as any).evidence_classification === 'resume_assertion' ||
                             (input as any).source_type === 'self_reported' ||
                             (input as any).source_type === 'skill_list' ||
                             (input as any).source_type === 'resume_assertion' ||
                             input.is_inferred === true ||
                             validRefs.every(e => e.source_tier === 'self_claim');

      if (isSelfReported) {
        status = 'INFERRED';
        confidence = Math.min(0.60, typeof (input as any).confidence === 'number' ? (input as any).confidence : 0.50);
        inferredCount++;
      } else {
        // Require explicit, trusted code/repo provenance verification (WeakMap seal or
        // server-supplied trustedProvenance registry); missing or caller-forged flags never promote.
        const isCorroboratedCode =
          (input as any).authorship_verified !== false &&
          (input as any).provenance_verified !== false &&
          validRefs.some(e => isTrustedCorroboratedCodeRef(e, trustedProvenance));

        if (isCorroboratedCode) {
          status = 'VERIFIED';
          confidence = 0.95;
          verifiedCount++;
        } else {
          status = 'INFERRED';
          confidence = Math.min(0.60, typeof (input as any).confidence === 'number' ? (input as any).confidence : 0.50);
          inferredCount++;
        }
      }
    } else {
      uncertainCount++;
    }

    const rawSourceType = (input as any).source_type;
    const rawClassification = (input as any).evidence_classification;
    const safeNonVerifiedSourceType =
      rawSourceType && rawSourceType !== 'corroborated' ? rawSourceType : 'self_reported';
    const safeNonVerifiedClassification =
      rawClassification && rawClassification !== 'corroborated' ? rawClassification : 'self_reported';

    const claimObj: Claim & { source_type?: string; evidence_classification?: string } = {
      id: input.id,
      requirement_id: input.requirement_id,
      claim_text: input.claim_text,
      status,
      evidence_ids: validRefs.map(e => e.id),
      confidence,
      source_type: status === 'VERIFIED' ? 'corroborated' : safeNonVerifiedSourceType,
      evidence_classification: status === 'VERIFIED' ? 'corroborated' : safeNonVerifiedClassification,
    };
    claims.push(claimObj);

    const edgeTimestamp = evaluatedAt || new Date().toISOString();

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
        created_at: edgeTimestamp,
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
      timestamp: edgeTimestamp,
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
