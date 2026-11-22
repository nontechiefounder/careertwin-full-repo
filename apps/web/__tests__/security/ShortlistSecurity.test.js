import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/serverAuth', () => ({
  requireUser: vi.fn(),
  getVerifiedOrgMembership: vi.fn(),
}));

import { GET } from '@/app/api/employer/shortlist/[roleId]/route';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';

describe('Shortlist API Route Security & Role Isolation (UX-V2 Day 3 C4-R1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. 401 Unauthenticated GET
  it('1. returns 401 Unauthorized for unauthenticated GET request', async () => {
    requireUser.mockResolvedValueOnce({
      errorResponse: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
      user: null,
      supabase: null,
    });

    const req = new Request('http://localhost:3000/api/employer/shortlist/11111111-1111-4111-d2c1-111111111111', { method: 'GET' });
    const res = await GET(req, { params: Promise.resolve({ roleId: '11111111-1111-4111-d2c1-111111111111' }) });
    expect(res.status).toBe(401);
  });

  // 2. 400 Invalid roleId format
  it('2. returns 400 for malformed roleId UUID format', async () => {
    requireUser.mockResolvedValueOnce({
      user: { id: 'emp-1' },
      supabase: {},
    });

    const req = new Request('http://localhost:3000/api/employer/shortlist/invalid-uuid-string', { method: 'GET' });
    const res = await GET(req, { params: Promise.resolve({ roleId: 'invalid-uuid-string' }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid role ID format');
  });

  // 3. 404 Unknown role
  it('3. returns 404 Not Found when roleId does not exist', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Row not found' },
            }),
          }),
        }),
      }),
    };

    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: mockSupabase,
    });

    const req = new Request('http://localhost:3000/api/employer/shortlist/99999999-9999-4999-f999-999999999999', { method: 'GET' });
    const res = await GET(req, { params: Promise.resolve({ roleId: '99999999-9999-4999-f999-999999999999' }) });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Role not found');
  });

  // 4. 403 Foreign organization role access
  it('4. returns 403 Forbidden when requesting user is not a member of the run organization', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: '22222222-2222-4222-d2c2-222222222222',
                org_id: '00000000-0000-4000-d2c0-000000000002', // Beta Org
              },
              error: null,
            }),
          }),
        }),
      }),
    };

    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: mockSupabase,
    });
    getVerifiedOrgMembership.mockResolvedValueOnce(null);

    const req = new Request('http://localhost:3000/api/employer/shortlist/22222222-2222-4222-d2c2-222222222222', { method: 'GET' });
    const res = await GET(req, { params: Promise.resolve({ roleId: '22222222-2222-4222-d2c2-222222222222' }) });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('Forbidden');
  });

  // 5. Successful role-scoped candidate retrieval with truthful counts
  it('5. returns 200 OK with role-scoped candidates and truthful count breakdown', async () => {
    const mockHiringRun = {
      id: '11111111-1111-4111-d2c1-111111111111',
      org_id: '00000000-0000-4000-d2c0-000000000001',
      role_title: 'Alpha Lead Engineer',
    };

    const mockCandidates = [
      {
        id: 'c1',
        hiring_run_id: '11111111-1111-4111-d2c1-111111111111',
        decision_packet: {
          evaluation_metrics: { decision_readiness: 'EVIDENCE READY' },
        },
      },
      {
        id: 'c2',
        hiring_run_id: '11111111-1111-4111-d2c1-111111111111',
        decision_packet: {
          evaluation_metrics: { decision_readiness: 'HUMAN REVIEW REQUIRED' },
        },
      },
      {
        id: 'c3',
        hiring_run_id: '11111111-1111-4111-d2c1-111111111111',
        decision_packet: null, // Pending evaluation
      },
    ];

    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'hiring_runs') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: mockHiringRun,
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'candidates') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: mockCandidates,
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'candidate_documents') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  count: 48,
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      }),
    };

    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: mockSupabase,
    });
    getVerifiedOrgMembership.mockResolvedValueOnce({ membership_role: 'owner', membership_status: 'active' });

    const req = new Request('http://localhost:3000/api/employer/shortlist/11111111-1111-4111-d2c1-111111111111', { method: 'GET' });
    const res = await GET(req, { params: Promise.resolve({ roleId: '11111111-1111-4111-d2c1-111111111111' }) });
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.hiring_run.id).toBe('11111111-1111-4111-d2c1-111111111111');
    expect(data.extractions.length).toBe(3);
    expect(data.counts.cohort_candidates).toBe(3);
    expect(data.counts.documents_received).toBe(48);
    expect(data.counts.packets_compiled).toBe(2);
    expect(data.counts.evaluations_completed).toBe(2);
    expect(data.counts.evidence_ready).toBe(1);
    expect(data.counts.human_review_required).toBe(1);
    expect(data.counts.pending_evaluation).toBe(1);
    expect(data.total_scanned).toBe(2);
  });
});
