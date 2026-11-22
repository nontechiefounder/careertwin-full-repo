/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { parseDocument } from '@/lib/parser/documentParser';
import EvidenceDrawer from '@/components/packet/EvidenceDrawer';
import { execSync } from 'child_process';

const WORKTREE_ROOT = path.resolve(__dirname, '../../../..');

import { runDisposablePsql, getTestDbConfig } from '@/lib/testDbGuard';

function runPsql(sql) {
  return runDisposablePsql(sql);
}

describe('CTW-V2-DEMO-CORE-07 — Ingestion, Provenance Integrity & Release Hardening Suite', () => {
  const CAND_PROFILE_ID = '00000000-0000-4000-b000-000000000001';
  const HIRING_RUN_ID = '11111111-1111-4111-a111-111111111111';
  const ORG_ID = '00000000-0000-4000-c000-000000000001';
  const CANDIDATE_ID = '33333333-3333-4333-a333-333333333333';
  const VALID_DOC_ID = 'd0c00001-0000-4000-a000-000000000001';
  const VALID_NORM_HASH = 'fd6f04025df21211496bb205aaf05de21623fbc68f115f68b2f066498fb7f1f2';

  describe('1. Genuine Document Parsing & Parser Provenance', () => {
    it('1.1 parses single-page synthetic resume with exact text and genuine parser metadata', async () => {
      const filePath = path.join(WORKTREE_ROOT, 'fixtures/alex_chen_systems_resume.pdf');
      const buffer = fs.readFileSync(filePath);
      const parsed = await parseDocument({ buffer, filename: 'alex_chen_systems_resume.pdf' });

      expect(parsed.parser_name).toBe('pdf-parse@2.4.5');
      expect(parsed.parser_metadata.total_pages).toBe(1);
      expect(parsed.parser_metadata.char_count).toBeGreaterThan(100);
      expect(parsed.normalized_text).toContain('Candidate has no Kubernetes experience');
      expect(parsed.normalized_text).toContain('Experienced distributed systems engineer');

      const expectedFileSha = crypto.createHash('sha256').update(buffer).digest('hex');
      const expectedNormSha = crypto.createHash('sha256').update(parsed.normalized_text).digest('hex');
      expect(parsed.file_sha256).toBe(expectedFileSha);
      expect(parsed.normalized_text_sha256).toBe(expectedNormSha);
    });

    it('1.2 parses multi-page synthetic resume with distinct page spans', async () => {
      const filePath = path.join(WORKTREE_ROOT, 'fixtures/sarah_connor_lead_infra.pdf');
      const buffer = fs.readFileSync(filePath);
      const parsed = await parseDocument({ buffer, filename: 'sarah_connor_lead_infra.pdf' });

      expect(parsed.parser_name).toBe('pdf-parse@2.4.5');
      expect(parsed.parser_metadata.total_pages).toBe(2);
      expect(parsed.normalized_text).toContain('Sarah Connor');
      expect(parsed.normalized_text).toContain('Page 2');
      expect(parsed.normalized_text).toContain('Certified Kubernetes Administrator');
      expect(parsed.parser_metadata.page_spans.length).toBe(2);
      expect(parsed.parser_metadata.page_spans[0].page_number).toBe(1);
      expect(parsed.parser_metadata.page_spans[1].page_number).toBe(2);
    });

    it('1.3 explicitly rejects malformed or corrupt PDF syntax', async () => {
      const filePath = path.join(WORKTREE_ROOT, 'fixtures/malformed_corrupt.pdf');
      const buffer = fs.readFileSync(filePath);

      await expect(parseDocument({ buffer, filename: 'malformed_corrupt.pdf' }))
        .rejects
        .toThrow(/PARSER_MALFORMED_DOCUMENT/);
    });

    it('1.4 explicitly rejects image-only / scanned PDF with zero extractable characters', async () => {
      const filePath = path.join(WORKTREE_ROOT, 'fixtures/scanned_image_only.pdf');
      const buffer = fs.readFileSync(filePath);

      await expect(parseDocument({ buffer, filename: 'scanned_image_only.pdf' }))
        .rejects
        .toThrow(/IMAGE_ONLY_PDF_REQUIRES_OCR/);
    });
  });

  describe('2. RPC Exact Document Binding & Provenance Integrity', () => {
    it('2.1 rejects evaluation if candidate_document_id does not exist', () => {
      const fakeDocId = '00000000-0000-4000-b000-999999999999';
      const sql = `
        SELECT * FROM public.allocate_claim_ledger_revision_and_persist(
          '${CAND_PROFILE_ID}'::uuid,
          '${HIRING_RUN_ID}'::uuid,
          '${ORG_ID}'::uuid,
          '[]'::jsonb,
          '[]'::jsonb,
          '[]'::jsonb,
          jsonb_build_object(
            'candidate_document_id', '${fakeDocId}',
            'rubric_version', '1.0.0',
            'normalized_text_sha256', 'dummy'
          ),
          '${CANDIDATE_ID}'::uuid
        );
      `;
      const res = runPsql(sql);
      expect(res).toContain('RPC_VALIDATION_ERROR: Evaluated document ' + fakeDocId + ' does not exist');
    });

    it('2.2 rejects evaluation if document normalized text hash is tampered/mismatched', () => {
      const sql = `
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
            'normalized_text_sha256', 'forged_fake_hash_mismatch'
          ),
          '${CANDIDATE_ID}'::uuid
        );
      `;
      const res = runPsql(sql);
      expect(res).toContain('RPC_VALIDATION_ERROR: Normalized text hash mismatch');
    });

    it('2.3 rejects evaluation if an evidence reference points to a foreign document', () => {
      const foreignDocId = 'd0c22222-2222-4222-d2c0-000000000002';
      const sql = `
        SELECT * FROM public.allocate_claim_ledger_revision_and_persist(
          '${CAND_PROFILE_ID}'::uuid,
          '${HIRING_RUN_ID}'::uuid,
          '${ORG_ID}'::uuid,
          jsonb_build_array(jsonb_build_object('id', 'ev_1', 'document_id', '${foreignDocId}')),
          '[]'::jsonb,
          '[]'::jsonb,
          jsonb_build_object(
            'candidate_document_id', '${VALID_DOC_ID}',
            'rubric_version', '1.0.0',
            'normalized_text_sha256', '${VALID_NORM_HASH}'
          ),
          '${CANDIDATE_ID}'::uuid
        );
      `;
      const res = runPsql(sql);
      expect(res).toContain('RPC_VALIDATION_ERROR: Evidence reference ev_1 points to foreign document ' + foreignDocId);
    });
  });

  describe('3. Rubric Consistency & Stale Evaluation Rejection', () => {
    it('3.1 rejects evaluation if evaluated rubric version does not match currently approved version', () => {
      const sql = `
        SELECT * FROM public.allocate_claim_ledger_revision_and_persist(
          '${CAND_PROFILE_ID}'::uuid,
          '${HIRING_RUN_ID}'::uuid,
          '${ORG_ID}'::uuid,
          '[]'::jsonb,
          '[]'::jsonb,
          '[]'::jsonb,
          jsonb_build_object(
            'rubric_version', '9.9.9-stale-version'
          ),
          '${CANDIDATE_ID}'::uuid
        );
      `;
      const res = runPsql(sql);
      expect(res).toContain('RPC_VALIDATION_ERROR: Evaluated rubric version (9.9.9-stale-version) does not match currently approved rubric version (1.0.0)');
    });
  });

  describe('4. Human Decision History & Re-Review Required Marking', () => {
    it('4.1 preserves historical decision and flags requires_re_review when packet revision advances', () => {
      const tempProfileId = crypto.randomUUID();
      const tempCandidateId = crypto.randomUUID();
      const tempDocId = crypto.randomUUID();
      let createdLedgerId = '';

      try {
        runPsql(`
          INSERT INTO public.candidate_profiles (id, name, email)
          VALUES ('${tempProfileId}'::uuid, 'Core07 Audit Fixture', 'core07-audit-${tempProfileId}@example.invalid');

          INSERT INTO public.candidate_documents (id, candidate_id, hiring_run_id, org_id, filename, file_sha256, normalized_text, normalized_text_sha256, mime_type, byte_size, parser_name)
          VALUES (
            '${tempDocId}'::uuid,
            '${tempProfileId}'::uuid,
            '${HIRING_RUN_ID}'::uuid,
            '${ORG_ID}'::uuid,
            'core07_audit_fixture.pdf',
            '${VALID_NORM_HASH}',
            'Synthetic audit fixture text.',
            '${VALID_NORM_HASH}',
            'application/pdf',
            28,
            '1.0.0-docling'
          );

          INSERT INTO public.candidates (id, hiring_run_id, candidate_id, fit_score, status, decision_packet)
          VALUES (
            '${tempCandidateId}'::uuid,
            '${HIRING_RUN_ID}'::uuid,
            '${tempProfileId}'::uuid,
            NULL,
            'screened',
            jsonb_build_object(
              'human_decision', jsonb_build_object(
                'action', 'hold',
                'status', 'hold',
                'rationale', 'Initial hold for review',
                'actor_id', '00000000-0000-4000-a000-000000000001',
                'reviewed_ledger_revision', 1,
                'reviewed_rubric_version', '1.0.0',
                'reviewed_document_id', '${tempDocId}'
              )
            )
          );
        `);

        // Persist next revision
        const sql = `
          SELECT ledger_id::text,
                 (decision_packet->'human_decision'->>'requires_re_review') AS req_review,
                 (decision_packet->'human_decision'->>'rationale') AS rationale,
                 (decision_packet->'human_decision'->>'re_review_reason') AS reason
          FROM public.allocate_claim_ledger_revision_and_persist(
            '${tempProfileId}'::uuid,
            '${HIRING_RUN_ID}'::uuid,
            '${ORG_ID}'::uuid,
            '[]'::jsonb,
            '[]'::jsonb,
            '[]'::jsonb,
            jsonb_build_object(
              'candidate_document_id', '${tempDocId}',
              'rubric_version', '1.0.0',
              'file_sha256', '${VALID_NORM_HASH}',
              'normalized_text_sha256', '${VALID_NORM_HASH}'
            ),
            '${tempCandidateId}'::uuid
          );
        `;
        const res = runPsql(sql);
        const maybeLedgerId = res.split(/\r?\n/)[0]?.split('|')[0]?.trim() || '';
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(maybeLedgerId)) {
          createdLedgerId = maybeLedgerId;
        }
        expect(res).toContain('Initial hold for review');
        expect(res).toContain('true');
      } finally {
        if (createdLedgerId) {
          runPsql(`DELETE FROM public.claim_ledgers WHERE id = '${createdLedgerId}'::uuid;`);
        }
        runPsql(`
          DELETE FROM public.claim_ledgers WHERE candidate_id = '${tempProfileId}'::uuid;
          DELETE FROM public.candidate_documents WHERE id = '${tempDocId}'::uuid;
          DELETE FROM public.candidates WHERE id = '${tempCandidateId}'::uuid;
          DELETE FROM public.candidate_profiles WHERE id = '${tempProfileId}'::uuid;
        `);
      }
    });
  });

  describe('5. Evidence Citation Drawer Complete Provenance Display', () => {
    it('5.1 renders all 9 provenance fields without any "Not available" fallback', () => {
      const sampleRef = {
        id: 'ev_sample_123',
        document_id: 'doc_sarah_connor_infra_001',
        filename: 'sarah_connor_lead_infra.pdf',
        excerpt: 'Extensive hands-on experience orchestrating production Kubernetes clusters on AWS.',
        excerpt_hash: '3a7b9c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b',
        parser_name: 'pdf-parse@2.4.5',
        file_sha256: '90ebc8dfa402e2da6a47e2e5bdbc8d971fce06f76b5c3a359144ef948473844f',
        normalized_text_sha256: 'ed4a40345abfeb19d4b310d672e7bc2f55c06f702d79e5564eed92bcdd66aae5',
        page: 1,
        source_offset: {
          page: 1,
          start_offset: 145,
          end_offset: 227
        }
      };

      render(
        <EvidenceDrawer
          isOpen={true}
          onClose={() => {}}
          evidenceRef={sampleRef}
        />
      );

      // 1. Doc ID
      expect(screen.getByTestId('citation-doc-id').textContent).toContain('doc_sarah_connor_infra_001');
      // 2. Offsets labeled as characters (NOT bytes)
      const offsetsEl = screen.getByTestId('citation-offsets');
      expect(offsetsEl.textContent).toContain('[145 - 227]');
      expect(offsetsEl.textContent).toContain('82 characters');
      expect(offsetsEl.textContent).not.toContain('bytes');
      // 3. Excerpt hash
      expect(screen.getByTestId('citation-excerpt-hash').textContent).toContain('3a7b9c1d');
      // 4. Parser name
      expect(screen.getByTestId('citation-parser-name').textContent).toContain('pdf-parse@2.4.5');
      // 5. File hash
      expect(screen.getByTestId('citation-file-hash').textContent).toContain('90ebc8df');
      // 6. Normalized text hash
      expect(screen.getByTestId('citation-norm-text-hash').textContent).toContain('ed4a4034');
      // 7. Locator
      expect(screen.getByTestId('citation-locator').textContent).toContain('Page 1');

      // Zero "Not available" instances in metadata block
      expect(screen.getByTestId('citation-doc-id').textContent).not.toContain('Not available');
      expect(screen.getByTestId('citation-parser-name').textContent).not.toContain('Not available');
      expect(screen.getByTestId('citation-file-hash').textContent).not.toContain('Not available');
      expect(screen.getByTestId('citation-norm-text-hash').textContent).not.toContain('Not available');
    });
  });
});
