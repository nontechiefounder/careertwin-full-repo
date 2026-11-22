import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockRequest } from './apiAuthorizationTestHarness';
import { POST as createScreeningSession } from '@/app/api/employer/screening-sessions/route';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe('Screening Session Server-Path Behavioral Proof (Step 4B5.3-B.1 & Step 4B5.4 Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Unauthenticated call to POST /api/employer/screening-sessions returns 401 Unauthorized', async () => {
    createSupabaseServerClient.mockImplementation(async (req, useServiceRole = false) => ({
      auth: {
        getUser: async () => ({ data: { user: null }, error: { message: 'No auth token' } }),
      },
    }));

    const req = createMockRequest({
      method: 'POST',
      body: { hiring_run_id: 'hr-1', candidate_id: 'cand-1' },
    });

    const res = await createScreeningSession(req);
    expect(res.status).toBe(401);
  });

  it('2. Candidate user call to POST /api/employer/screening-sessions returns 403 Forbidden', async () => {
    createSupabaseServerClient.mockImplementation(async (req, useServiceRole = false) => ({
      auth: {
        getUser: async () => ({ data: { user: { id: 'cand-1', email: 'cand@test.com' } }, error: null }),
      },
      from: (table) => {
        const makeBuilder = () => ({
          select: () => makeBuilder(),
          eq: () => makeBuilder(),
          maybeSingle: async () => {
            if (table === 'hiring_runs') return { data: { id: 'hr-1', org_id: 'org-alpha' }, error: null };
            if (table === 'organization_memberships') return { data: null, error: null }; // Not an org member!
            return { data: null, error: null };
          },
        });
        return makeBuilder();
      },
    }));

    const req = createMockRequest({
      method: 'POST',
      headers: { Authorization: 'Bearer mock-candidate-token' },
      body: { hiring_run_id: 'hr-1', candidate_id: 'cand-1' },
    });

    const res = await createScreeningSession(req);
    expect(res.status).toBe(403);
  });

  it('3. Employer user from different org returns 403 Forbidden', async () => {
    createSupabaseServerClient.mockImplementation(async (req, useServiceRole = false) => ({
      auth: {
        getUser: async () => ({ data: { user: { id: 'emp-beta', email: 'beta@test.com' } }, error: null }),
      },
      from: (table) => {
        const makeBuilder = () => ({
          select: () => makeBuilder(),
          eq: () => makeBuilder(),
          maybeSingle: async () => {
            if (table === 'hiring_runs') return { data: { id: 'hr-1', org_id: 'org-alpha' }, error: null };
            if (table === 'organization_memberships') return { data: null, error: null }; // Beta is not a member of Alpha
            return { data: null, error: null };
          },
        });
        return makeBuilder();
      },
    }));

    const req = createMockRequest({
      method: 'POST',
      headers: { Authorization: 'Bearer mock-employer-token' },
      body: { hiring_run_id: 'hr-1', candidate_id: 'cand-1' },
    });

    const res = await createScreeningSession(req);
    expect(res.status).toBe(403);
  });

  it('4. Authorized employer from matching org creates screening_session via service-role client', async () => {
    createSupabaseServerClient.mockImplementation(async (req, useServiceRole = false) => {
      if (useServiceRole) {
        return {
          from: (table) => ({
            insert: (rows) => ({
              select: () => ({
                single: async () => ({
                  data: {
                    id: 'session-created-123',
                    candidate_id: rows[0].candidate_id,
                    hiring_run_id: rows[0].hiring_run_id,
                    status: 'not_started',
                    questions: rows[0].questions,
                    created_at: rows[0].created_at,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      return {
        auth: {
          getUser: async () => ({ data: { user: { id: 'emp-alpha-owner', email: 'owner@alpha.com' } }, error: null }),
        },
        from: (table) => {
          const makeBuilder = () => ({
            select: () => makeBuilder(),
            eq: (col, val) => makeBuilder(),
            maybeSingle: async () => {
              if (table === 'hiring_runs') return { data: { id: 'hr-1', org_id: 'org-alpha' }, error: null };
              if (table === 'organization_memberships') return { data: { membership_role: 'owner', membership_status: 'active' }, error: null };
              if (table === 'candidates') return { data: { id: 'cand-rec-1', candidate_id: 'cand-1', hiring_run_id: 'hr-1' }, error: null };
              return { data: null, error: null };
            },
          });
          return makeBuilder();
        },
      };
    });

    const req = createMockRequest({
      method: 'POST',
      headers: { Authorization: 'Bearer mock-employer-token' },
      body: {
        hiring_run_id: 'hr-1',
        candidate_id: 'cand-1',
        questions: [{ question_text: 'Describe your architecture experience' }],
      },
    });

    const res = await createScreeningSession(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe('session-created-123');
    expect(json.session_id).toBe('session-created-123');
    expect(json.candidate_id).toBe('cand-1');
    expect(json.status).toBe('not_started');
    expect(createSupabaseServerClient).toHaveBeenCalledWith(req, true);
  });
});
