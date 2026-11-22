/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  isValidCanonicalScore,
  parseCanonicalScore,
  assertCanonicalScore,
  formatCanonicalScoreDecimal,
  formatCanonicalScorePercent,
  normalizeLegacyFitScoreAtBoundary,
} from '@/lib/scoreUtils';
import { evaluateCandidateTrustPacket, buildClaimGraphAndLedger } from '@packages/proof-engine';
import { extractMultiSpanEvidenceAndClaims } from '@/lib/evidenceExtractor';

describe('Canonical [0, 1] fit_score scale & EvidenceRef deduplication', () => {
  it('enforces single [0, 1] scale without > 1 unit-guessing heuristics', () => {
    expect(isValidCanonicalScore(0)).toBe(true);
    expect(isValidCanonicalScore(0.85)).toBe(true);
    expect(isValidCanonicalScore(1)).toBe(true);
    expect(isValidCanonicalScore(85)).toBe(false);
    expect(isValidCanonicalScore(-0.1)).toBe(false);
    expect(isValidCanonicalScore(NaN)).toBe(false);

    expect(parseCanonicalScore(0.925)).toBe(0.925);
    expect(parseCanonicalScore(92.5)).toBeNull();
    expect(parseCanonicalScore(null)).toBeNull();
    expect(formatCanonicalScoreDecimal(null)).toBe('—');
    expect(formatCanonicalScorePercent(null)).toBe('—');
    expect(formatCanonicalScorePercent(0.85)).toBe('85%');

    expect(() => assertCanonicalScore(85)).toThrow(/canonical range \[0, 1\]/);
    expect(normalizeLegacyFitScoreAtBoundary(92.5, 'percent_100')).toBe(0.925);
    expect(normalizeLegacyFitScoreAtBoundary(0.925, 'canonical_0_1')).toBe(0.925);
    expect(() => normalizeLegacyFitScoreAtBoundary(92.5, 'unknown')).toThrow(/Explicit sourceScale/);
  });

  it('deduplicates identical EvidenceRefs while preserving multi-claim edges and rejecting conflicting duplicates', () => {
    const sharedEv = {
      id: 'ev_shared_1',
      document_id: 'doc_1',
      source_tier: 'document',
      excerpt: 'Built Kubernetes clusters in Go for 5 years.',
      source_offset: { start_offset: 0, end_offset: 45, excerpt_hash: 'h1' },
    };

    // Identical duplicate EvidenceRef entries preserve edges for both claims without overwriting
    const graph = buildClaimGraphAndLedger(
      [
        { id: 'c1', requirement_id: 'mh_1', claim_text: 'Kubernetes', evidence_refs: [sharedEv, sharedEv] },
        { id: 'c2', requirement_id: 'mh_2', claim_text: 'Go', evidence_refs: [sharedEv] },
      ],
      [sharedEv, { ...sharedEv }]
    );

    expect(graph.claims).toHaveLength(2);
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges.map((e) => `${e.claim_id}->${e.evidence_id}`)).toEqual([
      'c1->ev_shared_1',
      'c2->ev_shared_1',
    ]);

    const run = {
      id: 'run_dedup',
      role_title: 'Infra Engineer',
      rubric_version: '1.0.0',
      brief_json: {
        role_title: 'Infra Engineer',
        contract_approved: true,
        approved_rubric_version: '1.0.0',
        approved_by: 'u1',
        approved_at: '2026-08-20T00:00:00.000Z',
        must_haves: ['Kubernetes', 'Go'],
      },
    };

    const out = evaluateCandidateTrustPacket({
      hiringRun: run,
      rawCandidateData: { id: 'cand_1' },
      rawClaims: [
        { id: 'c1', requirement_id: 'mh_1', claim_text: 'Kubernetes', evidence_refs: [sharedEv, sharedEv] },
        { id: 'c2', requirement_id: 'mh_2', claim_text: 'Go', evidence_refs: [sharedEv] },
      ],
      allowedEvidenceRefs: [sharedEv, { ...sharedEv }],
      evaluatedAt: '2026-08-20T00:00:00.000Z',
    });

    expect(out.claim_edges).toHaveLength(2);

    // Conflicting EvidenceRef sharing an ID must fail closed instead of overwriting or silently dropping
    const conflictingEv = { ...sharedEv, excerpt: 'Different tampered span!' };
    expect(() =>
      buildClaimGraphAndLedger(
        [{ id: 'c1', requirement_id: 'mh_1', claim_text: 'Kubernetes', evidence_refs: [sharedEv] }],
        [sharedEv, conflictingEv]
      )
    ).toThrow(/EVIDENCE_REF_CONFLICT/);
  });

  it('extractMultiSpanEvidenceAndClaims produces unique EvidenceRefs with valid provenance', () => {
    const candDoc = {
      id: '00000000-0000-4000-d000-000000000001',
      candidate_id: '00000000-0000-4000-b000-000000000001',
      org_id: '00000000-0000-4000-c000-000000000001',
      filename: 'resume.pdf',
      mime_type: 'application/pdf',
      file_sha256: 'a'.repeat(64),
      normalized_text_sha256: 'b'.repeat(64),
      normalized_text: 'Production Kubernetes cluster management and PostgreSQL tuning experience.',
    };
    const run = {
      id: 'run_extract_test',
      brief_json: { must_haves: ['Kubernetes', 'PostgreSQL'] },
    };

    const res = extractMultiSpanEvidenceAndClaims(candDoc, run);
    expect(res.claims.length).toBeGreaterThanOrEqual(2);
    expect(res.evidenceRefs.length).toBe(1);
    const ids = res.evidenceRefs.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);

    // Passing shared-span extractor output into proof-engine preserves edges for all claims
    const evalOut = evaluateCandidateTrustPacket({
      hiringRun: {
        ...run,
        role_title: 'Infra Engineer',
        rubric_version: '1.0.0',
        brief_json: {
          role_title: 'Infra Engineer',
          contract_approved: true,
          approved_rubric_version: '1.0.0',
          approved_by: 'u1',
          approved_at: '2026-08-20T00:00:00.000Z',
          must_haves: ['Kubernetes', 'PostgreSQL'],
        },
      },
      rawCandidateData: { id: 'cand_1' },
      rawClaims: res.claims,
      allowedEvidenceRefs: res.evidenceRefs,
      evaluatedAt: '2026-08-20T00:00:00.000Z',
    });
    expect(evalOut.claim_edges.length).toBe(res.claims.length);
  });
});
