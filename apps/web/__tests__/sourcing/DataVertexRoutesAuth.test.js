import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks for serverAuth and DataVertex client
vi.mock('@/lib/serverAuth', () => ({
  requireUser: vi.fn(),
  getVerifiedOrgMembership: vi.fn(),
}));

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: vi.fn(async () => ({})),
}));

vi.mock('@/lib/sourcing', () => ({
  searchCandidates: vi.fn().mockResolvedValue({ success: true, data: { profiles: [] } }),
  lookupCandidate: vi.fn().mockResolvedValue({ success: true, profile: {} }),
  getAccount: vi.fn().mockResolvedValue({ success: true, credits_remaining: 10 }),
}));

import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { POST as searchRoute } from '@/app/api/employer/sourcing/search/route';
import { POST as lookupRoute } from '@/app/api/employer/sourcing/lookup/route';
import { POST as shortlistRoute } from '@/app/api/employer/sourcing/shortlist/route';
import { GET as accountRoute } from '@/app/api/employer/sourcing/account/route';
import { GET as roleShortlistRoute } from '@/app/api/employer/shortlist/[roleId]/route';

describe('DataVertex API Route Authorization & Shortlist Semantics', () => {
  const dummyUser = { id: 'user_recruiter_123', email: 'recruiter@alpha.com' };
  const dummyRun = { id: 'run_123', org_id: 'org_alpha_123', role_title: 'Staff Architect' };

  let mockSupabase;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = {
      from: vi.fn((table) => {
        if (table === 'hiring_runs') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: dummyRun, error: null }),
            single: vi.fn().mockResolvedValue({ data: dummyRun, error: null }),
          };
        }
        if (table === 'organization_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { organization_id: 'org_alpha_123', membership_role: 'recruiter', membership_status: 'active' },
              error: null,
            }),
          };
        }
        if (table === 'candidates') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'cand_1',
                  candidate_id: 'prof_1',
                  status: 'sourced',
                  fit_score: null,
                  created_at: new Date().toISOString(),
                  candidate_profiles: { name: 'Sourced Candidate', location: 'San Francisco, CA' },
                  decision_packet: { provider: 'datavertex', verification_status: 'UNVERIFIED_PROVIDER_PROFILE' },
                },
                {
                  id: 'cand_2',
                  candidate_id: 'prof_2',
                  status: 'evaluated',
                  fit_score: 85,
                  created_at: new Date().toISOString(),
                  candidate_profiles: { name: 'Evaluated Candidate', location: 'New York, NY' },
                  decision_packet: { evaluation: { score: 85 } },
                },
              ],
              error: null,
            }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }),
      rpc: vi.fn().mockResolvedValue({
        data: [{ candidate_id: 'cand_new_1', candidate_profile_id: 'prof_new_1', replayed: false, status: 'sourced' }],
        error: null,
      }),
    };

    requireUser.mockResolvedValue({
      user: dummyUser,
      supabase: mockSupabase,
      errorResponse: null,
    });
  });

  it('rejects auditor accounts on DataVertex search with 403 AUDITOR_READ_ONLY', async () => {
    getVerifiedOrgMembership.mockResolvedValue({
      membership_role: 'auditor',
      membership_status: 'active',
    });

    const req = new Request('http://localhost/api/employer/datavertex/search', {
      method: 'POST',
      body: JSON.stringify({ hiring_run_id: 'run_123', free_text_search: 'Engineer' }),
    });

    const res = await searchRoute(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('AUDITOR_READ_ONLY');
  });

  it('rejects auditor accounts on DataVertex lookup with 403 AUDITOR_READ_ONLY', async () => {
    getVerifiedOrgMembership.mockResolvedValue({
      membership_role: 'auditor',
      membership_status: 'active',
    });

    const req = new Request('http://localhost/api/employer/datavertex/lookup', {
      method: 'POST',
      body: JSON.stringify({ hiring_run_id: 'run_123', linkedin_url: 'https://linkedin.com/in/test' }),
    });

    const res = await lookupRoute(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('AUDITOR_READ_ONLY');
  });

  it('rejects auditor accounts on shortlist route with 403 AUDITOR_READ_ONLY', async () => {
    getVerifiedOrgMembership.mockResolvedValue({
      membership_role: 'auditor',
      membership_status: 'active',
    });

    const req = new Request('http://localhost/api/employer/datavertex/shortlist', {
      method: 'POST',
      body: JSON.stringify({ hiring_run_id: 'run_123', candidate: { name: 'Test Cand' } }),
    });

    const res = await shortlistRoute(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('AUDITOR_READ_ONLY');
  });

  it('rejects inactive organization memberships with 403 FORBIDDEN', async () => {
    getVerifiedOrgMembership.mockResolvedValue({
      membership_role: 'recruiter',
      membership_status: 'suspended',
    });

    const req = new Request('http://localhost/api/employer/datavertex/search', {
      method: 'POST',
      body: JSON.stringify({ hiring_run_id: 'run_123', free_text_search: 'Engineer' }),
    });

    const res = await searchRoute(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
  });

  it('allows recruiters to shortlist candidates using transactional RPC', async () => {
    getVerifiedOrgMembership.mockResolvedValue({
      membership_role: 'recruiter',
      membership_status: 'active',
    });

    const candidatePayload = {
      id: 'dv_cand_123',
      source_provider: 'datavertex',
      name: 'Jane Doe',
      current_title: 'Staff Platform Engineer',
      candidate_location: 'San Francisco, CA',
      skills: ['Distributed Systems', 'Go'],
      linkedin_url: 'https://linkedin.com/in/janedoe',
    };

    const req = new Request('http://localhost/api/employer/datavertex/shortlist', {
      method: 'POST',
      body: JSON.stringify({ hiring_run_id: 'run_123', candidate: candidatePayload }),
    });

    const res = await shortlistRoute(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.candidate_id).toBe('cand_new_1');
    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'shortlist_candidate_from_provider_transactional',
      expect.objectContaining({
        p_actor_id: dummyUser.id,
        p_hiring_run_id: 'run_123',
        p_provider: 'datavertex',
        p_candidate_name: 'Jane Doe',
      })
    );
  });

  it('excludes sourced unverified candidates from evaluations_completed count', async () => {
    getVerifiedOrgMembership.mockResolvedValue({
      membership_role: 'recruiter',
      membership_status: 'active',
    });

    const roleUuid = '00000000-0000-4000-c000-000000000001';
    const req = new Request(`http://localhost/api/employer/shortlist/${roleUuid}`);
    const res = await roleShortlistRoute(req, { params: Promise.resolve({ roleId: roleUuid }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.counts.cohort_candidates).toBe(2);
    // Sourced candidate cand_1 must count towards pending_evaluation and NOT evaluations_completed
    expect(body.counts.evaluations_completed).toBe(1);
    expect(body.counts.pending_evaluation).toBe(1);
    expect(body.extractions[0].status).toBe('sourced');
    expect(body.extractions[0].is_unverified_provider_profile).toBe(true);
  });
});
