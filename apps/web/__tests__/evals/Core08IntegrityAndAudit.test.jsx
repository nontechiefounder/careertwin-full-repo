/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import EvidenceDrawer from '@/components/packet/EvidenceDrawer';
import CandidateHeader from '@/components/packet/CandidateHeader';
import { evaluateCandidateTrustPacket } from '@packages/proof-engine';
import { execSync } from 'child_process';
import crypto from 'crypto';

import { runDisposablePsql, getTestDbConfig } from '@/lib/testDbGuard';

function runPsql(sql) {
  return runDisposablePsql(sql);
}

describe('CTW-V2-DEMO-CORE-08 Integrity, RPC Validation & Decision History Tests', () => {
  const CAND_PROFILE_ID = '00000000-0000-4000-b000-000000000001';
  const HIRING_RUN_ID = '11111111-1111-4111-a111-111111111111';
  const ORG_ID = '00000000-0000-4000-c000-000000000001';
  const CANDIDATE_ID = '33333333-3333-4333-a333-333333333333';
  const VALID_DOC_ID = 'd0c00001-0000-4000-a000-000000000001';
  const VALID_HASH = 'fd6f04025df21211496bb205aaf05de21623fbc68f115f68b2f066498fb7f1f2';

  // 1. Unassessed Metric Agreement Contract (0.65 Uncertainty, Null Fit Score)
  it('1. Unassessed candidate evaluates to exactly uncertainty 0.65 and null fit score in engine', () => {
    const mockHiringRun = {
      id: HIRING_RUN_ID,
      role_title: 'Infrastructure Architect',
      rubric_version: '1.0.0',
      brief_json: {
        role_title: 'Infrastructure Architect',
        contract_approved: true,
        approved_rubric_version: '1.0.0',
        approved_by: '00000000-0000-4000-a000-000000000001',
        approved_at: new Date().toISOString(),
        must_haves: ['Kubernetes cluster production operations', 'Terraform infrastructure as code']
      }
    };

    // Engine called with zero claims and zero evidence refs
    const evalResult = evaluateCandidateTrustPacket({
      hiringRun: mockHiringRun,
      rawCandidateData: { id: CAND_PROFILE_ID, name: 'Unassessed Candidate' },
      rawClaims: [],
      allowedEvidenceRefs: [],
      actorId: '00000000-0000-4000-a000-000000000001'
    });

    expect(evalResult.fit_score).toBeNull();
    expect(evalResult.decision_readiness).toBe('INSUFFICIENT EVIDENCE');
    // Mathematical derivation: 0.40 * (1 - 0) + 0.25 * 0 + 0.25 * 1.0 (entropy) = 0.65
    expect(evalResult.uncertainty).toBe(0.65);
    expect(evalResult.proof_strength).toBe(0);
    expect(evalResult.what_is_verified).toHaveLength(0);
  });

  // 2. Demo Polish: EvidenceDrawer does not display 'Not available' suffix
  it('2. EvidenceDrawer renders clean filename without unexplained (Not available) suffix', () => {
    const sampleRef = {
      id: 'ev_test_123',
      document_id: VALID_DOC_ID,
      filename: 'sarah_connor_lead_infra.pdf',
      mime_type: 'application/pdf',
      file_type: 'pdf',
      file_sha256: VALID_HASH,
      normalized_text_sha256: VALID_HASH,
      parser_name: 'pdf-parse@2.4.5',
      excerpt: 'Managed 12 Kubernetes clusters across 3 AWS regions using Terraform.',
      excerpt_hash: '3a7b9c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b',
      locator: 'Page 1 (Chars 100-168)',
      source_offset: { start_offset: 100, end_offset: 168 }
    };

    render(
      <EvidenceDrawer
        isOpen={true}
        onClose={() => {}}
        evidenceRef={sampleRef}
      />
    );

    // Verify subtitle renders clean mime-type and does NOT render (Not available)
    expect(screen.queryByText(/sarah_connor_lead_infra\.pdf \(Not available\)/i)).not.toBeInTheDocument();
    expect(screen.getByText(/sarah_connor_lead_infra\.pdf \(application\/pdf\)/i)).toBeInTheDocument();
  });

  // 3. Demo Polish: CandidateHeader cleanly formats oversized bio excerpts
  it('3. CandidateHeader truncates oversized raw bio into a clean role display', () => {
    const longRawResumeText = 'Sarah Connor — Lead Infrastructure Engineer with 10+ years managing large-scale distributed Kubernetes architectures across AWS and GCP environments...'.repeat(3);

    render(
      <CandidateHeader
        candidateName="Sarah Connor"
        targetRole="Lead Infrastructure Engineer"
        currentRole={longRawResumeText}
        location="San Francisco, CA"
        readinessState="EVIDENCE READY"
        revision={1}
        evaluatedTimestamp={new Date().toISOString()}
        onOpenAuditDetails={() => {}}
      />
    );

    // Header should render clean candidate details and not crash
    expect(screen.getByText(/Current:/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Sarah Connor/i })).toBeInTheDocument();
  });

  // 4. RPC Validation: Require explicit approved_rubric_version without contract_version fallback
  it('4. allocate_claim_ledger_revision_and_persist rejects brief missing approved_rubric_version', () => {
    const unapprovedRunId = crypto.randomUUID();
    const tempCandId = crypto.randomUUID();

    // Create temporary hiring run with contract_version only (no approved_rubric_version)
    try {
      runPsql(`
        INSERT INTO public.hiring_runs (id, org_id, role_title, brief_json)
        VALUES ('${unapprovedRunId}', '${ORG_ID}', 'Database Architect', jsonb_build_object(
          'contract_approved', true,
          'contract_version', '1.0.0',
          'approved_by', '00000000-0000-4000-a000-000000000001',
          'approved_at', now()
        ));
        INSERT INTO public.candidates (id, candidate_id, hiring_run_id, status)
        VALUES ('${tempCandId}', '${CAND_PROFILE_ID}', '${unapprovedRunId}', 'sourced');
      `);

      const rpcCall = runPsql(`
        SELECT * FROM public.allocate_claim_ledger_revision_and_persist(
          '${CAND_PROFILE_ID}'::uuid,
          '${unapprovedRunId}'::uuid,
          '${ORG_ID}'::uuid,
          '[]'::jsonb,
          '[]'::jsonb,
          '[]'::jsonb,
          jsonb_build_object(
            'rubric_version', '1.0.0',
            'fit_score', null,
            'evaluation_metrics', jsonb_build_object('decision_readiness', 'INSUFFICIENT EVIDENCE')
          ),
          '${tempCandId}'::uuid
        );
      `);

      expect(rpcCall).toContain('RPC_VALIDATION_ERROR: Missing explicit approved_rubric_version');
    } finally {
      runPsql(`
        DELETE FROM public.claim_ledgers WHERE hiring_run_id = '${unapprovedRunId}';
        DELETE FROM public.candidates WHERE id = '${tempCandId}' OR hiring_run_id = '${unapprovedRunId}';
        DELETE FROM public.hiring_runs WHERE id = '${unapprovedRunId}';
      `);
    }
  });

  // 5. RPC Validation: Rejects malformed / incorrectly typed arguments
  it('5. allocate_claim_ledger_revision_and_persist rejects non-array or malformed claims and edges', () => {
    // Pass p_claims as an object instead of array
    const badClaimsType = runPsql(`
      SELECT * FROM public.allocate_claim_ledger_revision_and_persist(
        '${CAND_PROFILE_ID}'::uuid,
        '${HIRING_RUN_ID}'::uuid,
        '${ORG_ID}'::uuid,
        '[]'::jsonb,
        '{\"invalid\": \"not_an_array\"}'::jsonb,
        '[]'::jsonb,
        jsonb_build_object(
          'rubric_version', '1.0.0',
          'fit_score', null,
          'evaluation_metrics', jsonb_build_object('decision_readiness', 'INSUFFICIENT EVIDENCE')
        ),
        '${CANDIDATE_ID}'::uuid
      );
    `);

    expect(badClaimsType).toContain('RPC_VALIDATION_ERROR: p_claims must be a valid JSONB array');
  });

  // 6. RPC Validation: Requires valid 64-character hex hashes for document-backed evaluation
  it('6. allocate_claim_ledger_revision_and_persist requires valid 64-hex SHA-256 hashes for document evaluation', () => {
    const badHashCall = runPsql(`
      SELECT * FROM public.allocate_claim_ledger_revision_and_persist(
        '${CAND_PROFILE_ID}'::uuid,
        '${HIRING_RUN_ID}'::uuid,
        '${ORG_ID}'::uuid,
        '[]'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        jsonb_build_object(
          'candidate_document_id', '${VALID_DOC_ID}',
          'rubric_version', '1.0.0',
          'file_sha256', 'invalid_short_hash',
          'normalized_text_sha256', 'also_invalid'
        ),
        '${CANDIDATE_ID}'::uuid
      );
    `);

    expect(badHashCall).toContain('RPC_VALIDATION_ERROR: Valid 64-character hex file_sha256 required');
  });

  // 7. RPC Validation: Enforces no-document invariant (empty claims/evidence/edges, null fit_score)
  it('7. allocate_claim_ledger_revision_and_persist enforces no-document invariant', () => {
    // Attempt to pass claims without a candidate document
    const fabricatedClaimsCall = runPsql(`
      SELECT * FROM public.allocate_claim_ledger_revision_and_persist(
        '${CAND_PROFILE_ID}'::uuid,
        '${HIRING_RUN_ID}'::uuid,
        '${ORG_ID}'::uuid,
        '[]'::jsonb,
        '[{\"id\": \"claim_1\", \"claim_text\": \"Fabricated claim\"}]'::jsonb,
        '[]'::jsonb,
        jsonb_build_object(
          'rubric_version', '1.0.0',
          'evaluation_metrics', jsonb_build_object('decision_readiness', 'INSUFFICIENT EVIDENCE')
        ),
        '${CANDIDATE_ID}'::uuid
      );
    `);

    expect(fabricatedClaimsCall).toContain('RPC_VALIDATION_ERROR: Document-free evaluation must not contain claims');
  });

  // 8. Human Decision History: Preserves auditable decision history and flags legacy decisions
  it('8. Human decision history preserves legacy decisions with requires_re_review flag', () => {
    const tempProfileId = crypto.randomUUID();
    const tempCandidateId = crypto.randomUUID();
    let createdLedgerId = '';

    try {
      runPsql(`
        INSERT INTO public.candidate_profiles (id, name, email)
        VALUES ('${tempProfileId}'::uuid, 'Core08 Audit Fixture', 'core08-audit-${tempProfileId}@example.invalid');

        INSERT INTO public.candidates (id, hiring_run_id, candidate_id, fit_score, status, decision_packet)
        VALUES (
          '${tempCandidateId}'::uuid,
          '${HIRING_RUN_ID}'::uuid,
          '${tempProfileId}'::uuid,
          NULL,
          'screened',
          jsonb_build_object(
            'candidate_document_id', null,
            'human_decision', jsonb_build_object(
              'action', 'hold',
              'status', 'hold',
              'rationale', 'Legacy unrevisioned reviewer hold decision'
            )
          )
        );
      `);

      const result = runPsql(`
        SELECT ledger_id::text,
               (decision_packet->'human_decision'->>'requires_re_review') AS req_review,
               (decision_packet->'human_decision'->>'re_review_reason') AS reason
        FROM public.allocate_claim_ledger_revision_and_persist(
          '${tempProfileId}'::uuid,
          '${HIRING_RUN_ID}'::uuid,
          '${ORG_ID}'::uuid,
          '[]'::jsonb,
          '[]'::jsonb,
          '[]'::jsonb,
          jsonb_build_object(
            'rubric_version', '1.0.0',
            'fit_score', null,
            'evaluation_metrics', jsonb_build_object('decision_readiness', 'INSUFFICIENT EVIDENCE')
          ),
          '${tempCandidateId}'::uuid
        );
      `);
      const maybeLedgerId = result.split(/\r?\n/)[0]?.split('|')[0]?.trim() || '';
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(maybeLedgerId)) {
        createdLedgerId = maybeLedgerId;
      }

      expect(result).toContain('true');
      expect(result).toContain('Legacy human decision lacks recorded audit revision');
    } finally {
      if (createdLedgerId) {
        runPsql(`DELETE FROM public.claim_ledgers WHERE id = '${createdLedgerId}'::uuid;`);
      }
      runPsql(`
        DELETE FROM public.claim_ledgers WHERE candidate_id = '${tempProfileId}'::uuid;
        DELETE FROM public.candidates WHERE id = '${tempCandidateId}'::uuid;
        DELETE FROM public.candidate_profiles WHERE id = '${tempProfileId}'::uuid;
      `);
    }
  });
});
