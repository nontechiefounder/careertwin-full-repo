import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { extractMultiSpanEvidenceAndClaims } from '@/lib/evidenceExtractor';
import { evaluateCandidateTrustPacket } from '@packages/proof-engine';
import { contextScope, ContextError } from '@/lib/contextClient';
import { resolveEngineContext } from '@/lib/engineConfig';

describe('Track 1 Integrity Repairs — Unit & Fail-Closed Contract Verification', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('B1: Fail-Closed Service-Role Client & SQL Migration Artifact', () => {
    it('throws fail-closed error when service-role client requested without SUPABASE_SERVICE_ROLE_KEY', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54399';
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-only';
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      const req = new Request('http://localhost:3000/api/employer/packets/ext-1/generate', { method: 'POST' });
      await expect(createSupabaseServerClient(req, true)).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
    });

    it('migration 20260820000001 enforces least-privilege SELECT grants, unique index, and atomic RPC', async () => {
      const fs = await import('fs');
      const migrationPath = path.resolve(process.cwd(), '../../supabase/migrations/20260820000001_track1_integrity_repairs.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      expect(sql).toContain('REVOKE ALL ON TABLE public.claim_ledgers FROM PUBLIC, anon, authenticated');
      expect(sql).toContain('GRANT SELECT ON TABLE public.claim_ledgers TO authenticated');
      expect(sql).toContain('GRANT ALL ON TABLE public.claim_ledgers TO service_role');
      expect(sql).toContain('REVOKE ALL ON TABLE public.candidate_documents FROM PUBLIC, anon, authenticated');
      expect(sql).toContain('GRANT SELECT ON TABLE public.candidate_documents TO authenticated');
      expect(sql).toContain('GRANT ALL ON TABLE public.candidate_documents TO service_role');
      expect(sql).toContain("EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon;', v_tbl)");
      expect(sql).toContain('uq_claim_ledgers_cand_run_rev');
      expect(sql).toContain('pg_advisory_xact_lock');
      expect(sql).toContain('record_pre_evaluation_decision_transactional');
      expect(sql).toContain('pre_evaluation_revision INTEGER NOT NULL DEFAULT 0');
      expect(sql).toContain('REVOKE ALL ON FUNCTION public.allocate_claim_ledger_revision_and_persist(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, UUID) FROM PUBLIC, anon, authenticated');
      expect(sql).toContain('REVOKE ALL ON FUNCTION public.record_pre_evaluation_decision_transactional(UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated');
    });
  });

  describe('B2/B3: Explicit Trusted Evidence Provenance & Authorship Gating', () => {
    it('refuses corroborated/VERIFIED classification when authorship_verified is false, missing, or caller-forged', () => {
      const docUnverifiedAuthor = {
        id: 'doc-unauth-1',
        candidate_id: 'cand-1',
        hiring_run_id: 'run-1',
        org_id: 'org-1',
        filename: 'resume.pdf',
        file_sha256: 'abc123sha',
        normalized_text_sha256: 'norm123sha',
        normalized_text: 'Built PostgreSQL cluster and distributed systems architecture handling 10k rps.',
        github_url: 'https://github.com/example/repo',
        authorship_verified: false,
        provenance_verified: true,
        parser_name: 'pdf-parse@2.4.5',
      };

      const { evidenceRefs, claims } = extractMultiSpanEvidenceAndClaims(docUnverifiedAuthor, {
        id: 'run-1',
        must_haves: ['PostgreSQL cluster', 'distributed systems'],
      });

      expect(evidenceRefs.length).toBeGreaterThan(0);
      expect(claims.length).toBeGreaterThan(0);
      for (const claim of claims) {
        expect(claim.status).not.toBe('VERIFIED');
        expect(claim.evidence_classification).not.toBe('corroborated');
      }

      // Missing verification flags on a code file must NEVER promote (no !== false fallback)
      const docMissingProvenance = {
        id: 'doc-missing-prov',
        candidate_id: 'cand-1',
        hiring_run_id: 'run-1',
        org_id: 'org-1',
        filename: 'cluster.ts',
        mime_type: 'application/code',
        file_sha256: 'codefile123sha',
        normalized_text_sha256: 'codenorm123sha',
        normalized_text: 'export const setupPostgresCluster = () => "distributed systems";',
      };
      const missingRes = extractMultiSpanEvidenceAndClaims(docMissingProvenance, {
        id: 'run-1',
        must_haves: ['PostgreSQL cluster', 'distributed systems'],
      });
      expect(missingRes.claims.length).toBeGreaterThan(0);
      for (const claim of missingRes.claims) {
        expect(claim.status).toBe('INFERRED');
        expect(claim.source_type).not.toBe('corroborated');
      }

      // Caller-forged authorship_verified/provenance_verified inside candDoc/parser_metadata without server trustedProvenance must NEVER promote
      const docForgedFlags = {
        ...docMissingProvenance,
        id: 'doc-forged-flags',
        source_tier: 'code',
        authorship_verified: true,
        provenance_verified: true,
        parser_metadata: { authorship_verified: true, provenance_verified: true },
      };
      const forgedExtract = extractMultiSpanEvidenceAndClaims(docForgedFlags, {
        id: 'run-1',
        must_haves: ['distributed systems'],
      });
      expect(forgedExtract.claims[0].status).toBe('INFERRED');
      expect(forgedExtract.claims[0].evidence_classification).not.toBe('corroborated');

      const packet = evaluateCandidateTrustPacket({
        hiringRun: { id: 'run-1', role_title: 'Backend', must_haves: ['distributed systems'] },
        rawCandidateData: { id: 'cand-1' },
        rawClaims: forgedExtract.claims.map((c) => ({
          ...c,
          status: 'VERIFIED',
          source_type: 'corroborated',
          evidence_classification: 'corroborated',
          authorship_verified: true,
          provenance_verified: true,
        })),
        allowedEvidenceRefs: forgedExtract.evidenceRefs,
        trustedProvenance: forgedExtract.trustedProvenance,
      });
      expect(packet.claims[0].status).toBe('INFERRED');
      expect(packet.what_is_verified).toHaveLength(0);

      // Missing or mismatched trustedProvenance document_id / content_sha256 bindings must fail closed
      const missingBindingRes = extractMultiSpanEvidenceAndClaims(docMissingProvenance, {
        id: 'run-1',
        must_haves: ['distributed systems'],
      }, {
        trustedProvenance: {
          verified: true,
          authorship_verified: true,
          provenance_verified: true,
          verification_source: 'github_commit_signature',
          // document_id and content_sha256 intentionally omitted
        }
      });
      expect(Object.keys(missingBindingRes.trustedProvenance)).toHaveLength(0);
      expect(missingBindingRes.claims[0].status).toBe('INFERRED');

      const mismatchedHashRes = extractMultiSpanEvidenceAndClaims(docMissingProvenance, {
        id: 'run-1',
        must_haves: ['distributed systems'],
      }, {
        trustedProvenance: {
          verified: true,
          authorship_verified: true,
          provenance_verified: true,
          document_id: docMissingProvenance.id,
          content_sha256: 'tampered-other-sha',
          verification_source: 'github_commit_signature',
        }
      });
      expect(Object.keys(mismatchedHashRes.trustedProvenance)).toHaveLength(0);
      expect(mismatchedHashRes.claims[0].status).toBe('INFERRED');

      // Plain JSON caller ref copying sealed fields cannot promote without server issuer attestation or matching registry
      const validCodeRes = extractMultiSpanEvidenceAndClaims(docMissingProvenance, {
        id: 'run-1',
        must_haves: ['distributed systems'],
      }, {
        trustedProvenance: {
          verified: true,
          authorship_verified: true,
          provenance_verified: true,
          document_id: docMissingProvenance.id,
          content_sha256: docMissingProvenance.normalized_text_sha256,
          verification_source: 'github_commit_signature',
        }
      });
      expect(validCodeRes.claims[0].status).toBe('VERIFIED');
      expect(validCodeRes.trustedProvenance[validCodeRes.evidenceRefs[0].id]).toMatchObject({
        evidence_id: validCodeRes.evidenceRefs[0].id,
        document_id: docMissingProvenance.id,
        sha256: docMissingProvenance.normalized_text_sha256,
      });

      const clonedPlainJsonRef = JSON.parse(JSON.stringify(validCodeRes.evidenceRefs[0]));
      const plainJsonPacket = evaluateCandidateTrustPacket({
        hiringRun: { id: 'run-1', role_title: 'Backend', must_haves: ['distributed systems'] },
        rawCandidateData: { id: 'cand-1' },
        rawClaims: [{ ...validCodeRes.claims[0], evidence_refs: [clonedPlainJsonRef] }],
        allowedEvidenceRefs: [clonedPlainJsonRef],
      });
      expect(plainJsonPacket.claims[0].status).toBe('INFERRED');
      expect(plainJsonPacket.what_is_verified).toHaveLength(0);
    });
  });

  describe('B4/B5: Decommissioned Bypass Routes & Fail-Closed Config Boundaries', () => {
    it('resolveEngineContext rejects unmapped workspaces without hardcoded fallback registries', () => {
      delete process.env.WORKBYLINE_ENGINE_MAPPINGS;
      const result = resolveEngineContext(
        '00000000-0000-4000-c000-000000000001',
        '1bea003e-9466-4e4e-a185-6cc7cdd06ff1'
      );
      expect(result.ok).toBe(false);
      expect(result.status).toBe(403);
      expect(result.code).toBe('UNMAPPED_WORKSPACE');
    });

    it('resolveEngineContext rejects unmapped hiring runs inside mapped orgs without cross-run fallback', () => {
      process.env.WORKBYLINE_ENGINE_MAPPINGS = JSON.stringify({
        'org-1': {
          companyName: 'Test Org',
          runs: {
            'run-1': { workspaceId: 'ws-1', roleId: 'role-1', status: 'active' }
          }
        }
      });
      const result = resolveEngineContext('org-1', 'run-unmapped-999');
      expect(result.ok).toBe(false);
      expect(result.status).toBe(403);
      expect(result.code).toBe('UNMAPPED_WORKSPACE');
    });

    it('contextScope throws ENGINE_CONFIG_MISSING instead of using hardcoded acceptance secrets', async () => {
      delete process.env.WORKBYLINE_CONTEXT_SERVICE_URL;
      delete process.env.WORKBYLINE_ENGINE_URL;
      delete process.env.WORKBYLINE_CONTEXT_DELEGATION_SECRET;
      delete process.env.WORKBYLINE_INTERNAL_SERVICE_KEY;
      delete process.env.WORKBYLINE_ENGINE_MAPPINGS;

      const req = new Request('http://localhost:3000/api/employer/context-sources');
      await expect(contextScope(req, '')).rejects.toThrow(ContextError);
    });
  });
});

describe('Track 1 Mocked HTTP Handler Contracts — Generate, Transactional Pre-Eval RPC, & Brief Regeneration', () => {
  it('generate route enforces atomic RPC persistence without direct-table fallback and handles concurrent invocations', async () => {
    vi.resetModules();

    let allocatedRev = 0;
    const insertedRevs = [];
    const mockServiceRpc = vi.fn(async (_fn, args) => {
      // Simulate microtask interleaving of concurrent HTTP requests
      await new Promise((r) => setTimeout(r, 10));
      allocatedRev += 1;
      const rev = allocatedRev;
      insertedRevs.push(rev);
      return {
        data: [{
          decision_packet: {
            ...args.p_evaluation_output,
            ledger_revision: rev,
            claim_edges: args.p_claim_edges,
          }
        }],
        error: null,
      };
    });

    const mockRun = {
      id: 'run-conc-1',
      org_id: 'org-conc-1',
      role_title: 'Backend Engineer',
      must_haves: ['PostgreSQL'],
      brief_json: {
        contract_approved: true,
        approved_rubric_version: '1.0.0',
        approved_by: 'emp-1',
        approved_at: '2026-08-20T00:00:00.000Z',
      },
    };

    const mockExtraction = {
      id: '11111111-1111-4111-8111-111111111111',
      hiring_run_id: 'run-conc-1',
      candidate_id: 'prof-conc-1',
      decision_packet: null,
      hiring_runs: mockRun,
      candidate_profiles: { id: 'prof-conc-1', name: 'Test Engineer' },
    };

    const makeBuilder = (table) => {
      const dataMap = {
        candidates: mockExtraction,
        hiring_runs: mockRun,
        candidate_profiles: { id: 'prof-conc-1', name: 'Test Engineer' },
        organization_memberships: { organization_id: 'org-conc-1', user_id: 'emp-1', membership_role: 'owner', membership_status: 'active' },
      };
      const row = dataMap[table] || null;
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
        single: vi.fn().mockResolvedValue({ data: row, error: null }),
        update: vi.fn(() => {
          throw new Error('DIRECT_TABLE_UPDATE_FALLBACK_MUST_NOT_BE_CALLED');
        }),
      };
    };

    const mockUserClient = {
      from: vi.fn(makeBuilder),
    };
    const mockAdminClient = {
      from: vi.fn(makeBuilder),
      rpc: mockServiceRpc,
    };

    vi.doMock('@/lib/serverAuth', () => ({
      requireUser: vi.fn().mockResolvedValue({
        user: { id: 'emp-1', email: 'emp@example.com' },
        supabase: mockUserClient,
        errorResponse: null,
      }),
      getVerifiedOrgMembership: vi.fn().mockResolvedValue({
        organization_id: 'org-conc-1',
        user_id: 'emp-1',
        membership_role: 'owner',
        membership_status: 'active',
      }),
    }));

    vi.doMock('@/lib/supabaseServer', () => ({
      createSupabaseServerClient: vi.fn(async (_req, useServiceRole) => (useServiceRole ? mockAdminClient : mockUserClient)),
    }));

    const { POST: generatePost } = await import('@/app/api/employer/packets/[extractionId]/generate/route');

    const mkReq = () => new Request('http://localhost:3000/api/employer/packets/11111111-1111-4111-8111-111111111111/generate', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token' },
    });

    const [resA, resB] = await Promise.all([
      generatePost(mkReq(), { params: Promise.resolve({ extractionId: '11111111-1111-4111-8111-111111111111' }) }),
      generatePost(mkReq(), { params: Promise.resolve({ extractionId: '11111111-1111-4111-8111-111111111111' }) }),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    const bodyA = await resA.json();
    const bodyB = await resB.json();
    expect(new Set([bodyA.ledger_revision, bodyB.ledger_revision]).size).toBe(2);
    expect(mockServiceRpc).toHaveBeenCalledTimes(2);
    expect(bodyA.calculation_digest).toBe(bodyB.calculation_digest);
    expect(bodyA.calculation_digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('action route enforces explicit pre-eval stale-decision contract (400 missing contract, 409 stale status/revision or packet race)', async () => {
    vi.resetModules();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54399';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'unit-test-service-role-key';

    let currentStatus = 'new';
    let currentPreEvalRev = 0;
    let hasPacket = false;
    const mockAdminRpc = vi.fn(async (fnName, args) => {
      expect(fnName).toBe('record_pre_evaluation_decision_transactional');
      if (
        typeof args.p_expected_status !== 'string' ||
        args.p_expected_status.trim().length === 0 ||
        !Number.isInteger(args.p_expected_pre_eval_revision) ||
        args.p_expected_pre_eval_revision < 0
      ) {
        return { data: null, error: { message: 'RPC_VALIDATION_ERROR: Explicit pre-evaluation stale-decision contract required.' } };
      }
      if (hasPacket) {
        return { data: null, error: { message: 'REVIEW_REVISION_CONFLICT: Candidate already has an evaluated packet or ledger revision.' } };
      }
      if (args.p_expected_status !== currentStatus || args.p_expected_pre_eval_revision !== currentPreEvalRev) {
        return {
          data: null,
          error: {
            message: `REVIEW_REVISION_CONFLICT: Pre-evaluation state changed concurrently (expected status=${args.p_expected_status} revision=${args.p_expected_pre_eval_revision}, found status=${currentStatus} revision=${currentPreEvalRev}).`
          }
        };
      }
      currentStatus = args.p_action === 'advance' ? 'shortlisted' : args.p_action === 'hold' ? 'hold' : 'rejected';
      currentPreEvalRev += 1;
      return {
        data: [{
          candidate_id: args.p_candidate_id,
          status: currentStatus,
          pre_evaluation_revision: currentPreEvalRev,
          decision_packet: null,
          activity_event_id: 'evt-1'
        }],
        error: null,
      };
    });

    const mockAdminClient = {
      rpc: mockAdminRpc,
      from: vi.fn((table) => {
        if (table === 'candidates') {
          return {
            update: vi.fn(() => {
              throw new Error('DIRECT_PRE_EVAL_TABLE_UPDATE_MUST_NOT_BE_CALLED');
            }),
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    };

    const mockUserClient = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({
          data: {
            id: 'cand-cas-1',
            candidate_id: 'prof-cas-1',
            hiring_run_id: 'run-conc-1',
            status: currentStatus,
            pre_evaluation_revision: currentPreEvalRev,
            hiring_runs: { id: 'run-conc-1', org_id: 'org-conc-1', role_title: 'Backend Engineer' },
            candidate_profiles: { name: 'CAS Candidate', email: 'cas@example.com' },
            decision_packet: null,
          },
          error: null,
        })),
      })),
    };

    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn(() => mockAdminClient),
    }));

    vi.doMock('@/lib/serverAuth', () => ({
      requireUser: vi.fn().mockResolvedValue({
        user: { id: 'emp-1', email: 'emp@example.com' },
        supabase: mockUserClient,
        errorResponse: null,
      }),
      getVerifiedOrgMembership: vi.fn().mockResolvedValue({
        organization_id: 'org-conc-1',
        user_id: 'emp-1',
        membership_role: 'owner',
        membership_status: 'active',
      }),
    }));

    const { POST: actionPost } = await import('@/app/api/employer/packets/[extractionId]/action/route');

    // 1. Missing/incomplete stale-decision contract fails closed with 400 (never falls back to extraction.status)
    for (const invalidPayload of [
      { action: 'hold', rationale: 'Missing expected fields', pre_evaluation_disposition: true },
      { action: 'hold', rationale: 'Missing phase', pre_evaluation_disposition: true, expected_status: 'new', expected_pre_eval_revision: 0 },
      { action: 'hold', rationale: 'Missing revision', pre_evaluation_disposition: true, expected_evaluation_phase: 'pre_evaluation', expected_status: 'new' },
      { action: 'hold', rationale: 'Missing status', pre_evaluation_disposition: true, expected_evaluation_phase: 'pre_evaluation', expected_pre_eval_revision: 0 },
    ]) {
      const invalidReq = new Request('http://localhost:3000/api/employer/packets/cand-cas-1/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
        body: JSON.stringify(invalidPayload),
      });
      const invalidRes = await actionPost(invalidReq, { params: Promise.resolve({ extractionId: 'cand-cas-1' }) });
      expect(invalidRes.status).toBe(400);
      const invalidJson = await invalidRes.json();
      expect(invalidJson.error).toBe('INVALID_PRE_EVAL_CONTRACT');
    }
    expect(mockAdminRpc).not.toHaveBeenCalled();

    const mkActionReq = (expStatus = 'new', expRev = 0) => new Request('http://localhost:3000/api/employer/packets/cand-cas-1/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
      body: JSON.stringify({
        action: 'hold',
        rationale: 'Awaiting independent code evidence.',
        pre_evaluation_disposition: true,
        expected_evaluation_phase: 'pre_evaluation',
        expected_status: expStatus,
        expected_pre_eval_revision: expRev,
      }),
    });

    // 2. Concurrent competing pre-evaluation writers serialize with 200 vs 409
    const [res1, res2] = await Promise.all([
      actionPost(mkActionReq('new', 0), { params: Promise.resolve({ extractionId: 'cand-cas-1' }) }),
      actionPost(mkActionReq('new', 0), { params: Promise.resolve({ extractionId: 'cand-cas-1' }) }),
    ]);

    const statuses = [res1.status, res2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    // 3. Same-status stale pre_evaluation_revision=0 against current status='hold', rev=1 rejects with 409
    const staleRevRes = await actionPost(mkActionReq('hold', 0), { params: Promise.resolve({ extractionId: 'cand-cas-1' }) });
    expect(staleRevRes.status).toBe(409);
    const staleRevJson = await staleRevRes.json();
    expect(staleRevJson.error).toBe('REVIEW_REVISION_CONFLICT');

    // 4. Simulate concurrent packet generation completing before a stale pre-eval request reaches the RPC
    hasPacket = true;
    const raceRes = await actionPost(mkActionReq('hold', 1), { params: Promise.resolve({ extractionId: 'cand-cas-1' }) });
    expect(raceRes.status).toBe(409);
    const raceBody = await raceRes.json();
    expect(raceBody.error).toBe('REVIEW_REVISION_CONFLICT');
  });

  it('brief ?force regeneration invalidates prior approval, preserves version_history, and blocks packet generation until re-approved', async () => {
    vi.resetModules();

    let storedRun = {
      id: 'run-regen-1',
      org_id: 'org-regen-1',
      role_title: 'Staff Backend Engineer',
      company: 'TestCo',
      job_description: 'Build reliable distributed services in Go and Postgres.',
      must_haves: ['Go', 'PostgreSQL'],
      nice_to_haves: ['Kubernetes'],
      brief_json: {
        contract_version: '1.0.0',
        contract_approved: true,
        contract_status: 'approved',
        approved_by: 'owner-1',
        approved_at: '2026-08-19T10:00:00.000Z',
        approved_rubric_version: '1.0.0',
        role_summary: 'Approved v1.0.0 role summary for backend engineering.',
        explicit_requirements: ['Go', 'PostgreSQL'],
        inferred_requirements: ['Kubernetes'],
      },
    };

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'owner-1', email: 'owner@test.local' } }, error: null }),
      },
      from: vi.fn((table) => {
        if (table === 'hiring_runs') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn(async () => ({ data: storedRun, error: null })),
            maybeSingle: vi.fn(async () => ({ data: storedRun, error: null })),
            update: vi.fn((patch) => ({
              eq: vi.fn(async () => {
                storedRun = { ...storedRun, ...patch };
                return { error: null };
              }),
            })),
          };
        }
        if (table === 'candidates') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(async () => ({
              data: {
                id: 'cand-regen-1',
                candidate_id: 'prof-regen-1',
                hiring_run_id: storedRun.id,
                candidate_profiles: { id: 'prof-regen-1', name: 'Candidate One' },
                hiring_runs: storedRun,
              },
              error: null,
            })),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
    };

    vi.doMock('@/lib/supabaseServer', () => ({
      createSupabaseServerClient: vi.fn(async () => mockSupabase),
    }));
    vi.doMock('@/lib/serverAuth', () => ({
      requireUser: vi.fn(async () => ({ user: { id: 'owner-1', email: 'owner@test.local' }, supabase: mockSupabase, errorResponse: null })),
      getVerifiedOrgMembership: vi.fn(async () => ({ organization_id: 'org-regen-1', user_id: 'owner-1', membership_role: 'owner', membership_status: 'active' })),
    }));
    vi.doMock('@/lib/ai', () => ({
      generateChat: vi.fn(async () => ({
        role_summary: 'Regenerated v1.1.0 criteria emphasizing Rust and PostgreSQL.',
        explicit_requirements: ['Rust', 'PostgreSQL'],
        inferred_requirements: ['Distributed Tracing'],
        screening_dimensions: ['Systems Depth'],
        verification_focus: ['Production services'],
        missing_info: [],
      })),
    }));

    const { GET: briefGet } = await import('@/app/api/employer/brief/[id]/route');
    const { POST: generatePost } = await import('@/app/api/employer/packets/[extractionId]/generate/route');
    const { POST: approvePost } = await import('@/app/api/employer/brief/[id]/approve/route');

    const regenReq = { nextUrl: new URL('http://localhost:3000/api/employer/brief/run-regen-1?force=1') };
    const regenRes = await briefGet(regenReq, { params: Promise.resolve({ id: 'run-regen-1' }) });
    expect(regenRes.status).toBe(200);
    const regenBody = await regenRes.json();

    expect(regenBody.brief.contract_approved).toBe(false);
    expect(regenBody.brief.contract_status).toBe('pending_reapproval');
    expect(regenBody.brief.approved_by).toBeNull();
    expect(regenBody.brief.approved_at).toBeNull();
    expect(regenBody.brief.approved_rubric_version).toBeNull();
    expect(regenBody.brief.contract_version).toBe('1.1.0');
    expect(regenBody.brief.version_history).toHaveLength(1);
    expect(regenBody.brief.version_history[0].version).toBe('1.0.0');
    expect(regenBody.brief.version_history[0].contract_approved).toBe(true);
    expect(regenBody.brief.version_history[0].approved_rubric_version).toBe('1.0.0');
    expect(regenBody.brief.version_history[0].explicit_requirements).toEqual(['Go', 'PostgreSQL']);

    // Packet generation MUST fail closed while regenerated criteria await approval
    const genBlockedRes = await generatePost(
      new Request('http://localhost:3000/api/employer/packets/cand-regen-1/generate', { method: 'POST' }),
      { params: Promise.resolve({ extractionId: 'cand-regen-1' }) }
    );
    expect(genBlockedRes.status).toBe(422);
    const genBlockedBody = await genBlockedRes.json();
    expect(genBlockedBody.error).toBe('UNAPPROVED_PROOF_CONTRACT');

    // Re-approving approves the bumped 1.1.0 version and retains version_history
    const approveRes = await approvePost(
      new Request('http://localhost:3000/api/employer/brief/run-regen-1/approve', { method: 'POST' }),
      { params: Promise.resolve({ id: 'run-regen-1' }) }
    );
    expect(approveRes.status).toBe(200);
    const approveBody = await approveRes.json();
    expect(approveBody.approved_rubric_version).toBe('1.1.0');
    expect(storedRun.brief_json.version_history).toHaveLength(1);
  });
});
