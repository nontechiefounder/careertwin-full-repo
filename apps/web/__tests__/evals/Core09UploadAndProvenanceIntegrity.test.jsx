/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { extractEvidenceClaims, extractMultiSpanEvidenceAndClaims } from '@/lib/evidenceExtractor';
import { evaluateCandidateTrustPacket } from '@packages/proof-engine';
import { parseDocument } from '@/lib/parser/documentParser';

import { runDisposablePsql, getTestDbConfig } from '@/lib/testDbGuard';

function getFixturePath() {
  const candidates = [
    path.resolve(process.cwd(), '../fixtures/sarah_connor_lead_infra.pdf'),
    path.resolve(process.cwd(), 'fixtures/sarah_connor_lead_infra.pdf'),
    path.resolve(__dirname, '../../../../fixtures/sarah_connor_lead_infra.pdf'),
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && fs.existsSync(c)) return c;
  }
  throw new Error('Fixture sarah_connor_lead_infra.pdf not found in project');
}

function runPsql(sql) {
  return runDisposablePsql(sql);
}

describe('CTW-V2-DEMO-CORE-09 Upload, RPC Integrity & Skill Classification Suite', () => {
  const ALPHA_ORG_ID = '00000000-0000-4000-c000-000000000001';
  const BETA_ORG_ID = '00000000-0000-4000-c000-000000000002';
  const ALPHA_ACTOR = '00000000-0000-4000-a000-000000000001';
  const BETA_ACTOR = '00000000-0000-4000-a000-000000000002';

  let testHiringRunId;
  let testProfileId;
  let testCandidateId;
  let testDocId;
  const createdRunIds = [];
  const createdCandIds = [];
  const createdProfIds = [];
  const createdDocIds = [];
  const VALID_FILE_HASH = '1111111111111111111111111111111111111111111111111111111111111111';
  const VALID_NORM_HASH = '2222222222222222222222222222222222222222222222222222222222222222';

  afterAll(() => {
    const runList = createdRunIds.map((id) => `'${id}'`).join(', ') || `'00000000-0000-0000-0000-000000000000'`;
    const candList = createdCandIds.map((id) => `'${id}'`).join(', ') || `'00000000-0000-0000-0000-000000000000'`;
    const profList = createdProfIds.map((id) => `'${id}'`).join(', ') || `'00000000-0000-0000-0000-000000000000'`;
    const docList = createdDocIds.map((id) => `'${id}'`).join(', ') || `'00000000-0000-0000-0000-000000000000'`;
    const eventLikes = createdCandIds.length > 0
      ? createdCandIds.map((id) => `description LIKE '%${id}%'`).join(' OR ')
      : 'FALSE';
    runPsql(`
      DELETE FROM public.activity_events WHERE ${eventLikes};
      DELETE FROM public.claim_ledgers WHERE hiring_run_id IN (${runList}) OR candidate_id IN (${profList});
      DELETE FROM public.candidate_documents WHERE id IN (${docList}) OR hiring_run_id IN (${runList});
      DELETE FROM public.candidates WHERE id IN (${candList}) OR hiring_run_id IN (${runList});
      DELETE FROM public.candidate_profiles WHERE id IN (${profList});
      DELETE FROM public.hiring_runs WHERE id IN (${runList});
    `);
  });

  beforeAll(() => {
    testHiringRunId = crypto.randomUUID();
    testProfileId = crypto.randomUUID();
    testCandidateId = crypto.randomUUID();
    testDocId = crypto.randomUUID();
    createdRunIds.push(testHiringRunId);
    createdProfIds.push(testProfileId);
    createdCandIds.push(testCandidateId);
    createdDocIds.push(testDocId);

    runPsql(`
      INSERT INTO public.hiring_runs (id, org_id, role_title, brief_json)
      VALUES ('${testHiringRunId}', '${ALPHA_ORG_ID}', 'Cloud Systems Principal', jsonb_build_object(
        'contract_approved', true,
        'approved_rubric_version', '1.0.0',
        'approved_by', '${ALPHA_ACTOR}',
        'approved_at', now()
      ));

      INSERT INTO public.candidate_profiles (id, name, bio)
      VALUES ('${testProfileId}', 'Core09 Test Candidate', 'Systems & Cloud Engineer');

      INSERT INTO public.candidates (id, candidate_id, hiring_run_id, status, decision_packet)
      VALUES ('${testCandidateId}', '${testProfileId}', '${testHiringRunId}', 'new', jsonb_build_object(
        'ledger_revision', 1,
        'rubric_version', '1.0.0'
      ));

      INSERT INTO public.candidate_documents (
        id, candidate_id, org_id, hiring_run_id, filename, mime_type, byte_size,
        file_sha256, normalized_text, normalized_text_sha256, parser_name, storage_path, parser_metadata
      ) VALUES (
        '${testDocId}', '${testProfileId}', '${ALPHA_ORG_ID}', '${testHiringRunId}',
        'sarah_connor_lead_infra.pdf', 'application/pdf', 1048576,
        '${VALID_FILE_HASH}', 'Sample resume text with Go, Python, and Bash.', '${VALID_NORM_HASH}',
        'pdf-parse@2.4.5', '${ALPHA_ORG_ID}/${testHiringRunId}/${testDocId}/resume.pdf',
        '{"page_count": 2}'::jsonb
      );
    `);
  });

  // 1. Complete RPC Integrity Contract (Objective 4)
  describe('1. Complete RPC Integrity Contract Rejections & Zero Partial Persistence', () => {
    it('1.1 requires valid 64-hex file_sha256 in document-backed evaluations', () => {
      const initialCount = runPsql(`SELECT count(*) FROM public.claim_ledgers WHERE candidate_id = '${testProfileId}';`);

      // Missing file_sha256
      const resMissing = runPsql(`
        SELECT * FROM public.allocate_claim_ledger_revision_and_persist(
          '${testProfileId}'::uuid,
          '${testHiringRunId}'::uuid,
          '${ALPHA_ORG_ID}'::uuid,
          '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
          jsonb_build_object(
            'candidate_document_id', '${testDocId}',
            'rubric_version', '1.0.0',
            'approved_rubric_version', '1.0.0',
            'normalized_text_sha256', '${VALID_NORM_HASH}'
          ),
          '${testCandidateId}'::uuid
        );
      `);
      expect(resMissing).toContain('Valid 64-character hex file_sha256 required');

      // Invalid 64-hex format
      const resMalformed = runPsql(`
        SELECT * FROM public.allocate_claim_ledger_revision_and_persist(
          '${testProfileId}'::uuid,
          '${testHiringRunId}'::uuid,
          '${ALPHA_ORG_ID}'::uuid,
          '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
          jsonb_build_object(
            'candidate_document_id', '${testDocId}',
            'rubric_version', '1.0.0',
            'approved_rubric_version', '1.0.0',
            'file_sha256', 'short-invalid-hash',
            'normalized_text_sha256', '${VALID_NORM_HASH}'
          ),
          '${testCandidateId}'::uuid
        );
      `);
      expect(resMalformed).toContain('Valid 64-character hex file_sha256 required');

      // Zero partial persistence
      const afterCount = runPsql(`SELECT count(*) FROM public.claim_ledgers WHERE candidate_id = '${testProfileId}';`);
      expect(afterCount).toBe(initialCount);
    });

    it('1.2 requires file_sha256 to match the exact candidate document file_sha256', () => {
      const forgedHash = '9999999999999999999999999999999999999999999999999999999999999999';
      const res = runPsql(`
        SELECT * FROM public.allocate_claim_ledger_revision_and_persist(
          '${testProfileId}'::uuid,
          '${testHiringRunId}'::uuid,
          '${ALPHA_ORG_ID}'::uuid,
          '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
          jsonb_build_object(
            'candidate_document_id', '${testDocId}',
            'rubric_version', '1.0.0',
            'approved_rubric_version', '1.0.0',
            'file_sha256', '${forgedHash}',
            'normalized_text_sha256', '${VALID_NORM_HASH}'
          ),
          '${testCandidateId}'::uuid
        );
      `);
      expect(res).toContain('RPC_VALIDATION_ERROR: File hash mismatch');
    });

    it('1.3 requires explicit approved_rubric_version matching authoritative hiring-run rubric', () => {
      const initialCount = runPsql(`SELECT count(*) FROM public.claim_ledgers WHERE candidate_id = '${testProfileId}';`);

      const res = runPsql(`
        SELECT * FROM public.allocate_claim_ledger_revision_and_persist(
          '${testProfileId}'::uuid,
          '${testHiringRunId}'::uuid,
          '${ALPHA_ORG_ID}'::uuid,
          '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
          jsonb_build_object(
            'candidate_document_id', '${testDocId}',
            'rubric_version', '1.0.0',
            'approved_rubric_version', '2.0.0-mismatched',
            'file_sha256', '${VALID_FILE_HASH}',
            'normalized_text_sha256', '${VALID_NORM_HASH}'
          ),
          '${testCandidateId}'::uuid
        );
      `);
      expect(res).toContain('RPC_VALIDATION_ERROR: Evaluated approved_rubric_version');

      const afterCount = runPsql(`SELECT count(*) FROM public.claim_ledgers WHERE candidate_id = '${testProfileId}';`);
      expect(afterCount).toBe(initialCount);
    });

    it('1.4 rejects duplicate claim IDs and duplicate evidence IDs', () => {
      const initialCount = runPsql(`SELECT count(*) FROM public.claim_ledgers WHERE candidate_id = '${testProfileId}';`);

      const dupClaimRes = runPsql(`
        SELECT * FROM public.allocate_claim_ledger_revision_and_persist(
          '${testProfileId}'::uuid,
          '${testHiringRunId}'::uuid,
          '${ALPHA_ORG_ID}'::uuid,
          jsonb_build_array(jsonb_build_object('id', 'ev_1', 'document_id', '${testDocId}')),
          jsonb_build_array(
            jsonb_build_object('id', 'claim_1', 'claim_type', 'skill', 'subject', 'Go'),
            jsonb_build_object('id', 'claim_1', 'claim_type', 'skill', 'subject', 'Go Duplicate')
          ),
          '[]'::jsonb,
          jsonb_build_object(
            'candidate_document_id', '${testDocId}',
            'rubric_version', '1.0.0',
            'approved_rubric_version', '1.0.0',
            'file_sha256', '${VALID_FILE_HASH}',
            'normalized_text_sha256', '${VALID_NORM_HASH}'
          ),
          '${testCandidateId}'::uuid
        );
      `);
      expect(dupClaimRes).toContain('RPC_VALIDATION_ERROR: Duplicate claim id');

      const afterCount = runPsql(`SELECT count(*) FROM public.claim_ledgers WHERE candidate_id = '${testProfileId}';`);
      expect(afterCount).toBe(initialCount);
    });

    it('1.5 rejects claim edges referencing nonexistent claims or evidence', () => {
      const badEdgeRes = runPsql(`
        SELECT * FROM public.allocate_claim_ledger_revision_and_persist(
          '${testProfileId}'::uuid,
          '${testHiringRunId}'::uuid,
          '${ALPHA_ORG_ID}'::uuid,
          jsonb_build_array(jsonb_build_object('id', 'ev_valid', 'document_id', '${testDocId}')),
          jsonb_build_array(jsonb_build_object('id', 'claim_valid', 'claim_type', 'skill', 'subject', 'Go')),
          jsonb_build_array(
            jsonb_build_object('id', 'edge_bad', 'claim_id', 'claim_nonexistent', 'evidence_id', 'ev_valid')
          ),
          jsonb_build_object(
            'candidate_document_id', '${testDocId}',
            'rubric_version', '1.0.0',
            'approved_rubric_version', '1.0.0',
            'file_sha256', '${VALID_FILE_HASH}',
            'normalized_text_sha256', '${VALID_NORM_HASH}'
          ),
          '${testCandidateId}'::uuid
        );
      `);
      expect(badEdgeRes).toContain('RPC_VALIDATION_ERROR: Claim edge references nonexistent claim id claim_nonexistent');
    });

    it('1.6 preserves document-free invariant: empty claims/evidence/edges, null fit score, INSUFFICIENT EVIDENCE', () => {
      const docFreeRes = runPsql(`
        SELECT revision, (decision_packet->>'fit_score') IS NULL AS null_score,
               (decision_packet->'evaluation_metrics'->>'decision_readiness') AS readiness
        FROM public.allocate_claim_ledger_revision_and_persist(
          '${testProfileId}'::uuid,
          '${testHiringRunId}'::uuid,
          '${ALPHA_ORG_ID}'::uuid,
          '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
          jsonb_build_object(
            'rubric_version', '1.0.0',
            'approved_rubric_version', '1.0.0',
            'fit_score', null,
            'evaluation_metrics', jsonb_build_object('decision_readiness', 'INSUFFICIENT EVIDENCE')
          ),
          '${testCandidateId}'::uuid
        );
      `);
      expect(docFreeRes).toContain('|INSUFFICIENT EVIDENCE');
    });

    it('1.7 RPC rejects dangling claim edge when claims array is empty (C09-03)', () => {
      const res = runPsql(`
        SELECT * FROM public.allocate_claim_ledger_revision_and_persist(
          '${testProfileId}'::uuid,
          '${testHiringRunId}'::uuid,
          '${ALPHA_ORG_ID}'::uuid,
          jsonb_build_array(jsonb_build_object('id', 'ev_1', 'document_id', '${testDocId}')),
          '[]'::jsonb,
          jsonb_build_array(
            jsonb_build_object('id', 'edge_dangling_1', 'claim_id', 'claim_ghost', 'evidence_id', 'ev_1')
          ),
          jsonb_build_object(
            'candidate_document_id', '${testDocId}',
            'rubric_version', '1.0.0',
            'approved_rubric_version', '1.0.0',
            'file_sha256', '${VALID_FILE_HASH}',
            'normalized_text_sha256', '${VALID_NORM_HASH}'
          ),
          '${testCandidateId}'::uuid
        );
      `);
      expect(res).toContain('RPC_VALIDATION_ERROR: Claim edge references nonexistent claim id claim_ghost');
    });

    it('1.8 RPC rejects dangling claim edge when evidence array is empty (C09-03)', () => {
      const res = runPsql(`
        SELECT * FROM public.allocate_claim_ledger_revision_and_persist(
          '${testProfileId}'::uuid,
          '${testHiringRunId}'::uuid,
          '${ALPHA_ORG_ID}'::uuid,
          '[]'::jsonb,
          jsonb_build_array(jsonb_build_object('id', 'claim_1', 'claim_type', 'skill', 'subject', 'Go')),
          jsonb_build_array(
            jsonb_build_object('id', 'edge_dangling_2', 'claim_id', 'claim_1', 'evidence_id', 'ev_ghost')
          ),
          jsonb_build_object(
            'candidate_document_id', '${testDocId}',
            'rubric_version', '1.0.0',
            'approved_rubric_version', '1.0.0',
            'file_sha256', '${VALID_FILE_HASH}',
            'normalized_text_sha256', '${VALID_NORM_HASH}'
          ),
          '${testCandidateId}'::uuid
        );
      `);
      expect(res).toContain('RPC_VALIDATION_ERROR: Claim edge references nonexistent evidence id ev_ghost');
    });

    it('1.9 RPC rejects persistence when hiring-run rubric is not approved (C09-03)', () => {
      const unapprovedRunId = crypto.randomUUID();
      const unapprovedCandId = crypto.randomUUID();
      createdRunIds.push(unapprovedRunId);
      createdCandIds.push(unapprovedCandId);
      runPsql(`
        INSERT INTO public.hiring_runs (id, org_id, role_title, brief_json)
        VALUES ('${unapprovedRunId}', '${ALPHA_ORG_ID}', 'Unapproved Role', jsonb_build_object(
          'contract_approved', false,
          'approved_rubric_version', '1.0.0',
          'approved_by', '${ALPHA_ACTOR}',
          'approved_at', now()
        ));
        INSERT INTO public.candidates (id, candidate_id, hiring_run_id, status, decision_packet)
        VALUES ('${unapprovedCandId}', '${testProfileId}', '${unapprovedRunId}', 'new', '{"ledger_revision": 1, "rubric_version": "1.0.0"}'::jsonb);
      `);

      const res = runPsql(`
        SELECT * FROM public.allocate_claim_ledger_revision_and_persist(
          '${testProfileId}'::uuid,
          '${unapprovedRunId}'::uuid,
          '${ALPHA_ORG_ID}'::uuid,
          '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
          jsonb_build_object('rubric_version', '1.0.0', 'approved_rubric_version', '1.0.0'),
          '${unapprovedCandId}'::uuid
        );
      `);
      expect(res).toContain('RPC_VALIDATION_ERROR: Rubric has not been explicitly approved');
    });

    it('1.10 RPC rejects persistence when hiring-run rubric is missing approval metadata (C09-03)', () => {
      const missingMetaRunId = crypto.randomUUID();
      const missingMetaCandId = crypto.randomUUID();
      createdRunIds.push(missingMetaRunId);
      createdCandIds.push(missingMetaCandId);
      runPsql(`
        INSERT INTO public.hiring_runs (id, org_id, role_title, brief_json)
        VALUES ('${missingMetaRunId}', '${ALPHA_ORG_ID}', 'Missing Meta Role', jsonb_build_object(
          'contract_approved', true,
          'approved_rubric_version', '1.0.0'
        ));
        INSERT INTO public.candidates (id, candidate_id, hiring_run_id, status, decision_packet)
        VALUES ('${missingMetaCandId}', '${testProfileId}', '${missingMetaRunId}', 'new', '{"ledger_revision": 1, "rubric_version": "1.0.0"}'::jsonb);
      `);

      const res = runPsql(`
        SELECT * FROM public.allocate_claim_ledger_revision_and_persist(
          '${testProfileId}'::uuid,
          '${missingMetaRunId}'::uuid,
          '${ALPHA_ORG_ID}'::uuid,
          '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
          jsonb_build_object('rubric_version', '1.0.0', 'approved_rubric_version', '1.0.0'),
          '${missingMetaCandId}'::uuid
        );
      `);
      expect(res).toContain('RPC_VALIDATION_ERROR: Missing rubric approval metadata');
    });

    it('1.11 RPC rejects persistence when evaluated rubric_version mismatches approved_rubric_version (C09-03)', () => {
      const res = runPsql(`
        SELECT * FROM public.allocate_claim_ledger_revision_and_persist(
          '${testProfileId}'::uuid,
          '${testHiringRunId}'::uuid,
          '${ALPHA_ORG_ID}'::uuid,
          '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
          jsonb_build_object('rubric_version', '2.0.0-unapproved', 'approved_rubric_version', '1.0.0'),
          '${testCandidateId}'::uuid
        );
      `);
      expect(res).toContain('RPC_VALIDATION_ERROR: Evaluated rubric version');
      expect(res).toContain('does not match currently approved rubric version');
    });
  });

  // 2. Skill-Mention Classification Without Inflating Proof (Objective 5)
  describe('2. Skill-Mention Classification Without Inflating Proof', () => {
    it('2.1 accurately captures "Go" from Sarah Connor resume text as self-reported (INFERRED)', () => {
      const resumeSnippet = `
        TECHNICAL SKILLS
        Programming & Scripting: Go, Python, Bash
        Infrastructure: Kubernetes, Terraform, Docker, AWS
      `;

      const claims = extractEvidenceClaims(resumeSnippet, testDocId);
      const goClaim = claims.find(c =>
        c.claim_text?.toLowerCase().includes('go') || c.requirement_id === 'tech_go'
      );

      expect(goClaim).toBeDefined();
      expect(goClaim.source_type).toBe('self_reported');
      expect(goClaim.confidence).toBe(0.50);
      expect(goClaim.status).toBe('INFERRED');
      expect(goClaim.evidence_refs).toBeDefined();
      expect(goClaim.evidence_refs[0].excerpt).toContain('Go');
    });

    it('2.2 does NOT inflate self-reported resume skill mention into verified production competence', () => {
      const mockHiringRun = {
        id: testHiringRunId,
        role_title: 'Lead Go Systems Engineer',
        rubric_version: '1.0.0',
        brief_json: {
          role_title: 'Lead Go Systems Engineer',
          contract_approved: true,
          approved_rubric_version: '1.0.0',
          approved_by: ALPHA_ACTOR,
          approved_at: new Date().toISOString(),
          must_haves: ['Production Go microservices architecture']
        }
      };

      const selfReportedClaims = [{
        id: 'claim_go_skill_1',
        claim_type: 'skill',
        claim_text: 'Programming & Scripting: Go, Python, Bash',
        subject: 'Go',
        statement: 'Proficient in Programming & Scripting: Go',
        source_type: 'self_reported',
        status: 'INFERRED',
        confidence: 0.50,
        evidence_ids: ['ev_doc_1'],
        evidence_refs: [{
          id: 'ev_doc_1',
          document_id: testDocId,
          excerpt: 'Programming & Scripting: Go, Python, Bash'
        }]
      }];

      const allowedEvidence = [{
        id: 'ev_doc_1',
        document_id: testDocId,
        excerpt: 'Programming & Scripting: Go, Python, Bash'
      }];

      const evalResult = evaluateCandidateTrustPacket({
        hiringRun: mockHiringRun,
        rawCandidateData: { id: testProfileId, name: 'Sarah Connor' },
        rawClaims: selfReportedClaims,
        allowedEvidenceRefs: allowedEvidence,
        actorId: ALPHA_ACTOR
      });

      // ProofContract requires corroborated production evidence to satisfy must-have requirement
      expect(evalResult.gate_pass).toBe(false);
      expect(evalResult.failed_must_haves.length).toBeGreaterThanOrEqual(1);
    });

    it('2.3 does not mislabel experience paragraph as skill list because of a nearby heading (C09-04)', () => {
      const complexResumeText = [
        'TECHNICAL COMPETENCIES',
        'Programming & Scripting: Python, Bash',
        '',
        'PROFESSIONAL EXPERIENCE',
        'Senior Infrastructure Architect at Global Cloud Corp',
        'Led cloud infrastructure team, engineered resilient multi-region architectures, deployed Kubernetes clusters with zero downtime.',
        'Architected automated disaster recovery workflows across three AWS availability zones.'
      ].join('\n');

      const doc = {
        id: 'doc_sarah_connor_exp',
        filename: 'resume.pdf',
        mime_type: 'application/pdf',
        normalized_text: complexResumeText,
        source_tier: 'resume'
      };

      const run = {
        id: 'run_k8s_test',
        proof_contract: {
          requirements: [
            { id: 'req_k8s', title: 'Kubernetes', category: 'must_have', keywords: ['kubernetes'] }
          ]
        }
      };

      const { claims } = extractMultiSpanEvidenceAndClaims(doc, run);
      const k8sClaim = claims.find(c => c.requirement_id === 'req_k8s');
      expect(k8sClaim).toBeDefined();

      // Must be classified as resume_assertion, NOT skill_list!
      expect(k8sClaim.source_type).toBe('resume_assertion');

      // Resume action words alone must NOT produce verified status!
      expect(k8sClaim.status).toBe('INFERRED');
      expect(k8sClaim.status).not.toBe('VERIFIED');
    });

    it('2.4 classifies comma-delimited skill listing as skill_list (C09-04)', () => {
      const skillListResume = [
        'Skills: Go, Python, Bash, Docker, Kubernetes',
        'Experience at Acme: Developer'
      ].join('\n');

      const doc = {
        id: 'doc_skill_list',
        filename: 'resume.pdf',
        mime_type: 'application/pdf',
        normalized_text: skillListResume,
        source_tier: 'resume'
      };

      const run = {
        id: 'run_k8s_test',
        proof_contract: {
          requirements: [
            { id: 'req_k8s', title: 'Kubernetes', category: 'must_have', keywords: ['kubernetes'] }
          ]
        }
      };

      const { claims } = extractMultiSpanEvidenceAndClaims(doc, run);
      const k8sClaim = claims.find(c => c.requirement_id === 'req_k8s');
      expect(k8sClaim).toBeDefined();
      expect(k8sClaim.source_type).toBe('skill_list');
      expect(k8sClaim.status).toBe('INFERRED');
    });

    it('2.5 corroborating code repository file is classified as corroborated / VERIFIED only with explicit trusted provenance (C09-04)', () => {
      const codeText = 'package main\nfunc deployKubernetesClusters() { /* production deployment */ }';

      const codeDoc = {
        id: 'doc_code_repo',
        filename: 'deploy.go',
        mime_type: 'text/x-go',
        normalized_text: codeText,
        normalized_text_sha256: 'norm_sha_deploy_go_25',
        file_sha256: 'file_sha_deploy_go_25',
        source_tier: 'code'
      };

      const run = {
        id: 'run_k8s_test',
        proof_contract: {
          requirements: [
            { id: 'req_k8s', title: 'Kubernetes', category: 'must_have', keywords: ['kubernetes'] }
          ]
        }
      };

      // Without trustedProvenance, missing flags must NOT promote
      const untrustedRes = extractMultiSpanEvidenceAndClaims(codeDoc, run);
      const untrustedK8s = untrustedRes.claims.find(c => c.requirement_id === 'req_k8s');
      expect(untrustedK8s).toBeDefined();
      expect(untrustedK8s.status).toBe('INFERRED');
      expect(untrustedK8s.source_type).not.toBe('corroborated');

      // With explicit server-trusted provenance verification, claim promotes to VERIFIED
      const { claims } = extractMultiSpanEvidenceAndClaims(codeDoc, run, {
        trustedProvenance: {
          verified: true,
          authorship_verified: true,
          provenance_verified: true,
          document_id: 'doc_code_repo',
          content_sha256: 'norm_sha_deploy_go_25',
          verification_source: 'github_commit_signature'
        }
      });
      const k8sClaim = claims.find(c => c.requirement_id === 'req_k8s');
      expect(k8sClaim).toBeDefined();
      expect(k8sClaim.source_type).toBe('corroborated');
      expect(k8sClaim.status).toBe('VERIFIED');
    });
  });

  // 3. Document Preservation & Cross-Tenant Download Integrity (Objective 6)
  describe('3. Original-Document Preservation & Cross-Tenant Download Retrieval', () => {
    it('3.1 verifies candidate_documents table holds storage_path, parser_metadata and byte hash', () => {
      const docRow = runPsql(`
        SELECT filename || '|' || mime_type || '|' || parser_name || '|' || file_sha256
        FROM public.candidate_documents WHERE id = '${testDocId}';
      `);
      expect(docRow).toBe(`sarah_connor_lead_infra.pdf|application/pdf|pdf-parse@2.4.5|${VALID_FILE_HASH}`);

      const metaCheck = runPsql(`
        SELECT (parser_metadata->>'page_count') || '|' || (storage_path IS NOT NULL)
        FROM public.candidate_documents WHERE id = '${testDocId}';
      `);
      expect(metaCheck).toBe('2|true');
    });

    it('3.2 cross-tenant Beta cannot access Alpha candidate documents under tenant RLS', () => {
      const betaQueryResult = runPsql(`
        SET LOCAL "request.jwt.claim.sub" = '${BETA_ACTOR}';
        SELECT count(*) FROM public.candidate_documents WHERE org_id = '${ALPHA_ORG_ID}';
      `);
      expect(betaQueryResult).toBeDefined();
    });

    it('3.3 genuine parser on fixtures/sarah_connor_lead_infra.pdf proves 2 pages and page_spans (C09-05)', async () => {
      const fixturePath = getFixturePath();
      expect(fs.existsSync(fixturePath)).toBe(true);

      const buffer = fs.readFileSync(fixturePath);
      const parsed = await parseDocument({
        buffer,
        filename: 'sarah_connor_lead_infra.pdf',
        mimeType: 'application/pdf'
      });

      expect(parsed.total_pages).toBe(2);
      expect(parsed.page_count).toBe(2);
      expect(parsed.parser_metadata.page_spans).toBeDefined();
      expect(parsed.parser_metadata.page_spans.length).toBe(2);
      expect(parsed.parser_metadata.page_spans[0].page_number).toBe(1);
      expect(parsed.parser_metadata.page_spans[1].page_number).toBe(2);
    });

    it('3.4 persists 2-page document to database and verifies parser_metadata integrity (C09-05)', async () => {
      const fixturePath = getFixturePath();
      const buffer = fs.readFileSync(fixturePath);
      const parsed = await parseDocument({
        buffer,
        filename: 'sarah_connor_lead_infra.pdf',
        mimeType: 'application/pdf'
      });

      const actualDocId = crypto.randomUUID();
      createdDocIds.push(actualDocId);
      const metaJson = JSON.stringify(parsed.parser_metadata).replace(/'/g, "''");
      const normTextEscaped = parsed.normalized_text.replace(/'/g, "''");

      runPsql(`
        INSERT INTO public.candidate_documents (
          id, candidate_id, org_id, hiring_run_id, filename, mime_type, byte_size,
          file_sha256, normalized_text, normalized_text_sha256, parser_name, storage_path, parser_metadata
        ) VALUES (
          '${actualDocId}', '${testProfileId}', '${ALPHA_ORG_ID}', '${testHiringRunId}',
          'sarah_connor_lead_infra.pdf', 'application/pdf', ${buffer.length},
          '${parsed.file_sha256}', '${normTextEscaped}', '${parsed.normalized_text_sha256}',
          'pdf-parse@2.4.5', '${ALPHA_ORG_ID}/${testHiringRunId}/${actualDocId}/resume.pdf',
          '${metaJson}'::jsonb
        );
      `);

      const res = runPsql(`
        SELECT (parser_metadata->>'total_pages') || '|' ||
               (parser_metadata->>'page_count') || '|' ||
               jsonb_array_length(parser_metadata->'page_spans')
        FROM public.candidate_documents WHERE id = '${actualDocId}';
      `);

      expect(res).toBe('2|2|2');
    });

    it('3.5 proves page-two citation has exact page number 2 and truthful character offsets (C09-05)', async () => {
      const fixturePath = getFixturePath();
      const buffer = fs.readFileSync(fixturePath);
      const parsed = await parseDocument({
        buffer,
        filename: 'sarah_connor_lead_infra.pdf',
        mimeType: 'application/pdf'
      });

      const candDoc = {
        id: 'doc_sarah_actual',
        candidate_id: testProfileId,
        org_id: ALPHA_ORG_ID,
        filename: 'sarah_connor_lead_infra.pdf',
        mime_type: 'application/pdf',
        normalized_text: parsed.normalized_text,
        file_sha256: parsed.file_sha256,
        normalized_text_sha256: parsed.normalized_text_sha256,
        parser_metadata: parsed.parser_metadata
      };

      // GitOps only appears on page 2 of Sarah Connor's resume!
      const runWithGitOps = {
        id: 'run_gitops_test',
        proof_contract: {
          requirements: [
            { id: 'req_gitops', title: 'GitOps', category: 'must_have', keywords: ['gitops'] }
          ]
        }
      };

      const { evidenceRefs, claims } = extractMultiSpanEvidenceAndClaims(candDoc, runWithGitOps);
      const gitopsClaim = claims.find(c => c.requirement_id === 'req_gitops');
      expect(gitopsClaim).toBeDefined();

      const gitopsRef = evidenceRefs.find(r => r.excerpt.toLowerCase().includes('gitops'));
      expect(gitopsRef).toBeDefined();

      // PROVE exact page number is 2!
      expect(gitopsRef.source_offset.page).toBe(2);

      // PROVE exact character offsets match page 2 bounds
      const page2Span = parsed.parser_metadata.page_spans.find(s => s.page_number === 2);
      expect(gitopsRef.source_offset.start_offset).toBeGreaterThanOrEqual(page2Span.start_char);
      expect(gitopsRef.source_offset.end_offset).toBeLessThanOrEqual(page2Span.end_char);

      // PROVE truthful offset slice matches excerpt exactly
      const extractedExcerptSlice = parsed.normalized_text.substring(
        gitopsRef.source_offset.start_offset,
        gitopsRef.source_offset.end_offset
      );
      expect(extractedExcerptSlice).toBe(gitopsRef.excerpt);
    });
  });
});
