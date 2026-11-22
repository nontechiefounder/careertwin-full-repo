import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as approveHandler } from '@/app/api/employer/brief/[id]/approve/route';
import { POST as generatePacketHandler } from '@/app/api/employer/packets/[extractionId]/generate/route';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/serverAuth', () => ({
  requireUser: vi.fn(),
  getVerifiedOrgMembership: vi.fn(),
}));

describe('Rubric Version Approval Integrity Suite (RC-C1.2 Condition 1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/employer/brief/[id]/approve', () => {
    it('rejects unauthenticated requests with HTTP 401', async () => {
      requireUser.mockResolvedValueOnce({
        user: null,
        supabase: null,
        errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      });

      const req = new Request('http://localhost:3000/api/employer/brief/run-123/approve', { method: 'POST' });
      const res = await approveHandler(req, { params: Promise.resolve({ id: 'run-123' }) });
      expect(res.status).toBe(401);
    });

    it('rejects non-member user with HTTP 403', async () => {
      const mockSupabase = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'run-123', org_id: 'org-alpha', rubric_version: '1.0.0' },
            error: null
          })
        })
      };

      requireUser.mockResolvedValueOnce({
        user: { id: 'user-intruder' },
        supabase: mockSupabase,
        errorResponse: null
      });
      getVerifiedOrgMembership.mockResolvedValueOnce(null);

      const req = new Request('http://localhost:3000/api/employer/brief/run-123/approve', { method: 'POST' });
      const res = await approveHandler(req, { params: Promise.resolve({ id: 'run-123' }) });
      expect(res.status).toBe(403);
    });

    it('records explicit approver, timestamp, and version in brief_json and updates contract_status', async () => {
      let updatedPayload = null;
      const mockRun = {
        id: 'run-123',
        org_id: 'org-alpha',
        rubric_version: '1.2.0',
        brief_json: { must_haves: ['Kubernetes', 'Go'] }
      };

      const mockSupabase = {
        from: vi.fn((table) => {
          if (table === 'hiring_runs') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: mockRun, error: null }),
              update: vi.fn((payload) => {
                updatedPayload = payload;
                return { eq: vi.fn().mockResolvedValue({ error: null }) };
              })
            };
          }
          return { select: vi.fn().mockReturnThis() };
        })
      };

      requireUser.mockResolvedValueOnce({
        user: { id: 'user-recruiter-99' },
        supabase: mockSupabase,
        errorResponse: null
      });
      getVerifiedOrgMembership.mockResolvedValueOnce({ membership_role: 'recruiter', org_id: 'org-alpha' });

      const req = new Request('http://localhost:3000/api/employer/brief/run-123/approve', { method: 'POST' });
      const res = await approveHandler(req, { params: Promise.resolve({ id: 'run-123' }) });
       expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.contract_approved).toBe(true);
      expect(body.approved_by).toBe('user-recruiter-99');
      expect(body.approved_rubric_version).toBe('1.2.0');
      expect(body.approved_at).toBeDefined();

      expect(updatedPayload).toBeDefined();
      expect(updatedPayload.brief_json.contract_status).toBe('approved');
      expect(updatedPayload.brief_json.contract_approved).toBe(true);
      expect(updatedPayload.brief_json.approved_by).toBe('user-recruiter-99');
      expect(updatedPayload.brief_json.approved_rubric_version).toBe('1.2.0');
    });
  });

  describe('Strict Rubric Version Validation in Packet Generation', () => {
    const baseCandidate = {
      id: 'cand-1',
      candidate_id: 'prof-1',
      hiring_run_id: 'run-123',
      candidate_profiles: { id: 'prof-1', name: 'Test Candidate' },
      hiring_runs: {
        id: 'run-123',
        org_id: 'org-alpha',
        role_title: 'Senior SRE',
        rubric_version: '2.0.0',
        status: 'active', // active status alone must NOT grant inferred approval
        must_haves: ['Kubernetes', 'Prometheus'],
        brief_json: {}
      }
    };

    function setupGenerateSupabase(briefJson, rubricVersion = '2.0.0') {
      const candidateRecord = {
        ...baseCandidate,
        hiring_runs: {
          ...baseCandidate.hiring_runs,
          rubric_version: rubricVersion,
          brief_json: briefJson
        }
      };

      const mockClient = {
        auth: {
          getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'emp-user-1' } }, error: null })
        },
        from: vi.fn((table) => {
          if (table === 'candidates') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: candidateRecord, error: null }),
              update: vi.fn().mockReturnThis(),
            };
          }
          if (table === 'organization_memberships') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [{ organization_id: 'org-alpha', membership_role: 'owner', membership_status: 'active' }],
                error: null
              }),
              maybeSingle: vi.fn().mockResolvedValue({
                data: { organization_id: 'org-alpha', membership_role: 'owner', membership_status: 'active' },
                error: null
              })
            };
          }
          if (table === 'candidate_documents') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'doc-1',
                  candidate_id: 'prof-1',
                  org_id: 'org-alpha',
                  normalized_text: 'Built scalable Kubernetes clusters and Prometheus alerting.',
                  normalized_text_sha256: '2ae958ecbc89bcd4dbf15acd9b11d9612875c6a6f7e135cd5aab06007d255938',
                  mime_type: 'application/pdf',
                  created_at: new Date().toISOString()
                },
                error: null
              })
            };
          }
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
          };
        }),
        rpc: vi.fn(async (fnName, params) => {
          if (fnName === 'allocate_claim_ledger_revision_and_persist') {
            return {
              data: [{ decision_packet: { ...(params.p_evaluation_output || {}), ledger_revision: 1 } }],
              error: null,
            };
          }
          return { data: null, error: null };
        })
      };
      requireUser.mockResolvedValue({
        user: { id: 'emp-user-1' },
        supabase: mockClient,
        errorResponse: null
      });
      getVerifiedOrgMembership.mockResolvedValue({
        membership_role: 'owner',
        org_id: 'org-alpha'
      });
      return mockClient;
    }

    it('rejects packet generation with HTTP 422 when approval is missing (inferred approval from active status rejected)', async () => {
      // brief_json without contract_approved
      const mockSupabase = setupGenerateSupabase({
        contract_version: '2.0.0',
        must_haves: ['Kubernetes']
      });
      createSupabaseServerClient.mockResolvedValue(mockSupabase);

      const req = new Request('http://localhost:3000/api/employer/packets/cand-1/generate', { method: 'POST' });
      const res = await generatePacketHandler(req, { params: Promise.resolve({ extractionId: 'cand-1' }) });

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe('UNAPPROVED_PROOF_CONTRACT');
      // Verified details string
      expect(typeof body.details).toBe("string");
    });

    it('rejects packet generation with HTTP 422 when contract_approved is explicitly false', async () => {
      const mockSupabase = setupGenerateSupabase({
        contract_approved: false,
        contract_version: '2.0.0',
        must_haves: ['Kubernetes']
      });
      createSupabaseServerClient.mockResolvedValue(mockSupabase);

      const req = new Request('http://localhost:3000/api/employer/packets/cand-1/generate', { method: 'POST' });
      const res = await generatePacketHandler(req, { params: Promise.resolve({ extractionId: 'cand-1' }) });

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe('UNAPPROVED_PROOF_CONTRACT');
    });

    it('rejects packet generation with HTTP 422 when approver or timestamp is missing', async () => {
      const mockSupabase = setupGenerateSupabase({
        contract_approved: true,
        // Missing approved_by and approved_at
        approved_rubric_version: '2.0.0'
      });
      createSupabaseServerClient.mockResolvedValue(mockSupabase);

      const req = new Request('http://localhost:3000/api/employer/packets/cand-1/generate', { method: 'POST' });
      const res = await generatePacketHandler(req, { params: Promise.resolve({ extractionId: 'cand-1' }) });

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe('UNAPPROVED_PROOF_CONTRACT');
    });

    it('rejects packet generation with HTTP 422 when rubric version is stale', async () => {
      // Role has rubric_version 2.0.0, but brief was approved for 1.0.0
      const mockSupabase = setupGenerateSupabase({
        contract_approved: true,
        approved_by: 'user-old-approver',
        approved_at: '2026-09-01T00:00:00Z',
        approved_rubric_version: '1.0.0'
      }, '2.0.0');
      createSupabaseServerClient.mockResolvedValue(mockSupabase);

      const req = new Request('http://localhost:3000/api/employer/packets/cand-1/generate', { method: 'POST' });
      const res = await generatePacketHandler(req, { params: Promise.resolve({ extractionId: 'cand-1' }) });

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe('STALE_RUBRIC_APPROVAL');
      expect(body.details.approved_rubric_version).toBe('1.0.0');
      expect(body.details.current_rubric_version).toBe('2.0.0');
    });

    it('allows packet generation when valid persisted approval of the exact rubric version exists', async () => {
      const mockSupabase = setupGenerateSupabase({
        contract_approved: true,
        approved_by: 'user-lead-recruiter',
        approved_at: '2026-10-02T12:00:00Z',
        approved_rubric_version: '2.0.0',
        contract_version: '2.0.0',
        requirements: [{ id: 'req_k8s', name: 'Kubernetes', weight: 1.0, required: true }]
      }, '2.0.0');
      createSupabaseServerClient.mockResolvedValue(mockSupabase);

      const req = new Request('http://localhost:3000/api/employer/packets/cand-1/generate', { method: 'POST' });
      const res = await generatePacketHandler(req, { params: Promise.resolve({ extractionId: 'cand-1' }) });

       expect(res.status).toBe(200);
      const packet = await res.json();
      expect(packet.spec_version).toBe('1.0.0-kernel');
      expect(packet.evaluation_metrics).toBeDefined();
    });
  });
});
