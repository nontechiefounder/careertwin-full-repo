import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/employer/hiring-runs/route';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

// Mock Supabase Server Client
vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe('/api/employer/hiring-runs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('POST creates a new hiring run', async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: { id: 'run-789', role_title: 'Senior Engineer' }, error: null });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const insertMock = vi.fn().mockReturnValue({ select: selectMock });

    const mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'employer-test-password-not-secret' } }, error: null }),
      },
      from: vi.fn((table) => {
        if (table === 'organization_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: [{ organization_id: '00000000-0000-4000-a000-000000000001', membership_role: 'owner' }],
              error: null,
            }),
          };
        }
        return {
          insert: insertMock,
        };
      }),
    };

    createSupabaseServerClient.mockResolvedValue(mockSupabase);

    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role_title: 'Senior Engineer',
        job_description: 'Full stack TypeScript and PostgreSQL development.',
        must_haves: ['TypeScript', 'PostgreSQL'],
        status: 'active',
      }),
    });

    const res = await POST(req);
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.hiring_run_id).toBe('run-789');
    expect(insertMock).toHaveBeenCalledWith([expect.objectContaining({
      role_title: 'Senior Engineer',
      employer_id: 'employer-test-password-not-secret'
    })]);
  });
});


import { POST as generatePacketHandler } from '@/app/api/employer/packets/[extractionId]/generate/route';
import { GET as getPacketHandler } from '@/app/api/employer/packets/[extractionId]/route';

describe('/api/employer/packets/[extractionId] - Real Packet Generation & Retrieval Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CAREERTWIN_DRY_RUN_EMAIL = 'true';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
  });

  it('rejects unapproved ProofContract with HTTP 422', async () => {
    const unapprovedRun = {
      id: 'run_unapproved',
      org_id: '00000000-0000-4000-a000-000000000001',
      role_title: 'Unapproved Role',
      status: 'draft',
      brief_json: { contract_approved: false }
    };

    const mockSupabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'emp_1' } }, error: null }) },
      from: vi.fn((table) => {
        if (table === 'candidates') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: 'cand_1', candidate_id: 'p_1', hiring_runs: unapprovedRun },
              error: null
            })
          };
        }
        if (table === 'organization_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { organization_id: '00000000-0000-4000-a000-000000000001', membership_role: 'owner', membership_status: 'active' },
              error: null
            }),
            in: vi.fn().mockResolvedValue({
              data: [{ organization_id: '00000000-0000-4000-a000-000000000001', membership_role: 'owner', membership_status: 'active' }],
              error: null
            })
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
      })
    };

    createSupabaseServerClient.mockResolvedValue(mockSupabase);

    const req = new Request('http://localhost:3000/api/employer/packets/cand_1/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const res = await generatePacketHandler(req, { params: Promise.resolve({ extractionId: 'cand_1' }) });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('UNAPPROVED_PROOF_CONTRACT');
  });

  it('executes full pipeline: approved role + evidence -> engine eval -> database write -> GET packet', async () => {
    const approvedRun = {
      id: 'run_approved',
      org_id: '00000000-0000-4000-a000-000000000001',
      role_title: 'Backend Engineer',
      status: 'active',
      brief_json: {
        contract_approved: true,
        contract_version: '1.0.0',
        approved_by: 'emp_1',
        approved_at: '2026-10-02T12:00:00Z',
        approved_rubric_version: '1.0.0'
      },
      proof_contract: {
        role_id: 'role_backend_1',
        requirements: [
          { id: 'req_node', title: 'Node.js Microservices', category: 'must_have', keywords: ['node.js', 'microservices'] }
        ]
      }
    };

    let persistedPacket = null;
    let persistedFitScore = null;

    const mockSupabase = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'emp_1' } }, error: null }) },
      rpc: vi.fn(async (fnName, params) => {
        if (fnName === 'allocate_claim_ledger_revision_and_persist') {
          persistedPacket = {
            ...(params.p_evaluation_output || {}),
            ledger_revision: 1,
          };
          persistedFitScore = persistedPacket.fit_score ?? null;
          return { data: [{ decision_packet: persistedPacket }], error: null };
        }
        return { data: null, error: null };
      }),
      from: vi.fn((table) => {
        if (table === 'candidates') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockImplementation(() => {
              return Promise.resolve({
                data: {
                  id: '11111111-1111-4111-a111-111111111111',
                  candidate_id: 'p_eval_1',
                  status: 'pending',
                  decision_packet: persistedPacket,
                  fit_score: persistedFitScore,
                  hiring_runs: approvedRun,
                  candidate_profiles: { id: 'p_eval_1', name: 'Alice Engineer', bio: 'Backend Developer' }
                },
                error: null
              });
            }),
            update: vi.fn((payload) => {
              persistedPacket = payload.decision_packet;
              persistedFitScore = payload.fit_score;
              return {
                eq: vi.fn().mockResolvedValue({ error: null })
              };
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
                id: 'doc_backend_1',
                candidate_id: 'p_eval_1',
                org_id: '00000000-0000-4000-a000-000000000001',
                filename: 'backend_resume.pdf',
                normalized_text: 'Experienced in Node.js microservices and distributed event queues.',
                normalized_text_sha256: '639ba702c898abe30bd3431cf3415ba1e6f8f5fb9c6ba7865870712ed2ffb5a3',
                mime_type: 'application/pdf',
                created_at: new Date().toISOString()
              },
              error: null
            })
          };
        }
        if (table === 'organization_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { organization_id: '00000000-0000-4000-a000-000000000001', membership_role: 'owner', membership_status: 'active' },
              error: null
            }),
            in: vi.fn().mockResolvedValue({
              data: [{ organization_id: '00000000-0000-4000-a000-000000000001', membership_role: 'owner', membership_status: 'active' }],
              error: null
            })
          };
        }
        if (table === 'scheduled_emails') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: [], error: null })
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
        };
      })
    };

    createSupabaseServerClient.mockResolvedValue(mockSupabase);

    // 1. Generate packet POST
    const genReq = new Request('http://localhost:3000/api/employer/packets/11111111-1111-4111-a111-111111111111/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const genRes = await generatePacketHandler(genReq, { params: Promise.resolve({ extractionId: '11111111-1111-4111-a111-111111111111' }) });
    expect(genRes.status).toBe(200);

    const generatedBody = await genRes.json();
    expect(generatedBody.spec_version).toBe('1.0.0-kernel');
    expect(generatedBody.role_id || generatedBody.role_version).toBeDefined();
    expect(persistedPacket).toBeDefined();

    // 2. Fetch packet GET
    const getReq = new Request('http://localhost:3000/api/employer/packets/11111111-1111-4111-a111-111111111111', {
      method: 'GET'
    });

    const getRes = await getPacketHandler(getReq, { params: Promise.resolve({ extractionId: '11111111-1111-4111-a111-111111111111' }) });
    expect(getRes.status).toBe(200);

    const getBody = await getRes.json();
    expect(getBody.packet).toBeDefined();
    expect(getBody.packet.spec_version).toBe('1.0.0-kernel');
    expect(getBody.extraction.candidate_name).toBe('Alice Engineer');
  });
});

describe('/api/health route contract', () => {
  it('returns status ok, dry_run_email true, and parsed supabase_host', async () => {
    const { GET: healthHandler } = await import('@/app/api/health/route');
    const res = await healthHandler();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.status).toBe('ok');
    expect(data.dry_run_email).toBe(true);
    expect(data.supabase_host).toBeDefined();
  });
});
