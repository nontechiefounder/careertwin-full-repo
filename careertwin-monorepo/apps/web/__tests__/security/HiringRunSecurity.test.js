import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing route
vi.mock('@/lib/serverAuth', () => ({
  requireUser: vi.fn(),
  getVerifiedOrgMembership: vi.fn(),
}));

import { GET, POST } from '@/app/api/employer/hiring-runs/route';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';

describe('Hiring Runs API Route Security & Single Tenant Contract (UX-V2 Day 3 C4-R1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper to construct fluent Supabase organization_memberships mock
  function createMembershipsMock(data, error = null) {
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data, error }),
          }),
        }),
      }),
    };
  }

  // 1. 401 unauthenticated POST
  it('1. returns 401 Unauthorized for unauthenticated POST', async () => {
    requireUser.mockResolvedValueOnce({
      errorResponse: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
      user: null,
      supabase: null,
    });

    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      body: JSON.stringify({ role_title: 'Backend Engineer' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  // 2. Invalid JSON payload
  it('2. returns 400 for invalid JSON payload', async () => {
    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: {},
    });

    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      body: 'invalid-json-content',
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid JSON payload');
  });

  // 3. Array payload rejected
  it('3. returns 400 when body payload is an array', async () => {
    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: {},
    });

    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      body: JSON.stringify([{ role_title: 'Engineer' }]),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Request body must be a valid object');
  });

  // 4. Non-object primitive payload rejected
  it('4. returns 400 when body payload is a non-object primitive', async () => {
    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: {},
    });

    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      body: JSON.stringify('string-primitive'),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // 5. Missing role title
  it('5. returns 400 when role_title is missing or empty', async () => {
    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: {},
    });

    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      body: JSON.stringify({ role_title: '' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Role title is required');
  });

  // 6. Whitespace-only role title
  it('6. returns 400 when role_title is whitespace only', async () => {
    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: {},
    });

    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      body: JSON.stringify({ role_title: '   ' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Role title is required');
  });

  // 7. Oversized role title > 200 chars
  it('7. returns 400 when role_title exceeds 200 characters', async () => {
    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: {},
    });

    const oversizedTitle = 'A'.repeat(201);
    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      body: JSON.stringify({ role_title: oversizedTitle }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('exceeds maximum length of 200 characters');
  });

  // 8. Invalid org_id format
  it('8. returns 400 for malformed org_id UUID format', async () => {
    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: {},
    });

    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      body: JSON.stringify({ role_title: 'Staff Engineer', org_id: 'invalid-uuid-string' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid org_id format');
  });

  // 9. Explicit foreign organization returns 403
  it('9. returns 403 Forbidden when user is not an active member of supplied org_id', async () => {
    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: {},
    });
    getVerifiedOrgMembership.mockResolvedValueOnce(null);

    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      body: JSON.stringify({
        role_title: 'Staff Engineer',
        org_id: '11111111-1111-4111-a111-111111111111',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('Forbidden');
  });

  // 10. Explicit authorized organization succeeds
  it('10. returns 200 when explicit org_id is verified', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: {
        id: '99999999-9999-4999-f999-999999999999',
        role_title: 'Staff Engineer',
        org_id: '11111111-1111-4111-a111-111111111111',
      },
      error: null,
    });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });

    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'hiring_runs') return { insert: mockInsert };
        return {};
      }),
    };

    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: mockSupabase,
    });
    getVerifiedOrgMembership.mockResolvedValueOnce({ membership_role: 'owner', membership_status: 'active' });

    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      body: JSON.stringify({
        role_title: 'Staff Engineer',
        org_id: '11111111-1111-4111-a111-111111111111',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.hiring_run_id).toBe('99999999-9999-4999-f999-999999999999');
  });

  // 11. Zero active memberships fail closed
  it('11. returns 400 when no org_id is provided and user has 0 active memberships', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'organization_memberships') return createMembershipsMock([]);
        return {};
      }),
    };

    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: mockSupabase,
    });

    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      body: JSON.stringify({ role_title: 'Staff Engineer' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('No unambiguous active organization context');
  });

  // 12. Multiple active memberships fail closed
  it('12. returns 400 when no org_id is provided and user has multiple active memberships', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'organization_memberships') {
          return createMembershipsMock([
            { organization_id: '11111111-1111-4111-a111-111111111111', membership_role: 'owner' },
            { organization_id: '22222222-2222-4222-a222-222222222222', membership_role: 'admin' },
          ]);
        }
        return {};
      }),
    };

    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: mockSupabase,
    });

    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      body: JSON.stringify({ role_title: 'Staff Engineer' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('No unambiguous active organization context');
  });

  // 13. Membership query error returns 503
  it('13. returns 503 when organization_memberships database query fails', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'organization_memberships') {
          return createMembershipsMock(null, { message: 'DB connection failure' });
        }
        return {};
      }),
    };

    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: mockSupabase,
    });

    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      body: JSON.stringify({ role_title: 'Staff Engineer' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe('Database service unavailable');
  });

  // 14. Implicit single authorized membership succeeds
  it('14. returns 200 for implicit single active organization membership', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: {
        id: '99999999-9999-4999-f999-999999999999',
        role_title: 'Staff Engineer',
        org_id: '11111111-1111-4111-a111-111111111111',
      },
      error: null,
    });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });

    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'organization_memberships') {
          return createMembershipsMock([
            { organization_id: '11111111-1111-4111-a111-111111111111', membership_role: 'owner' },
          ]);
        }
        if (table === 'hiring_runs') {
          return { insert: mockInsert };
        }
        return {};
      }),
    };

    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: mockSupabase,
    });

    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      body: JSON.stringify({ role_title: 'Staff Engineer' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  // 15. Insert error returns safe typed 500 response
  it('15. returns 500 safe error response when hiring_runs insert operation fails', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Insert constraint error' },
    });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });

    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'organization_memberships') {
          return createMembershipsMock([
            { organization_id: '11111111-1111-4111-a111-111111111111', membership_role: 'owner' },
          ]);
        }
        if (table === 'hiring_runs') return { insert: mockInsert };
        return {};
      }),
    };

    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: mockSupabase,
    });

    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      body: JSON.stringify({ role_title: 'Staff Engineer' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('HIRING_RUN_CREATION_FAILED');
  });

  // 16. Insert payload contains exact verified org_id
  it('16. verifies insert payload contains exact verified org_id', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'run-1', role_title: 'Engineer', org_id: '11111111-1111-4111-a111-111111111111' },
      error: null,
    });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });

    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'organization_memberships') {
          return createMembershipsMock([
            { organization_id: '11111111-1111-4111-a111-111111111111', membership_role: 'owner' },
          ]);
        }
        if (table === 'hiring_runs') return { insert: mockInsert };
        return {};
      }),
    };

    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: mockSupabase,
    });

    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      body: JSON.stringify({ role_title: 'Engineer' }),
    });

    await POST(req);
    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        org_id: '11111111-1111-4111-a111-111111111111',
        employer_id: 'u1',
      }),
    ]);
  });

  // 17. Missing company remains absent (null) and is never "Company"
  it('17. verifies missing company remains null and is never defaulted to "Company"', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'run-1', role_title: 'Engineer', company: null },
      error: null,
    });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });

    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'organization_memberships') {
          return createMembershipsMock([
            { organization_id: '11111111-1111-4111-a111-111111111111', membership_role: 'owner' },
          ]);
        }
        if (table === 'hiring_runs') return { insert: mockInsert };
        return {};
      }),
    };

    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1', user_metadata: { company: 'Metadata Corp' } },
      supabase: mockSupabase,
    });

    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      body: JSON.stringify({ role_title: 'Engineer' }),
    });

    await POST(req);
    const insertPayload = mockInsert.mock.calls[0][0][0];
    expect(insertPayload.company).toBeNull();
    expect(insertPayload.company).not.toBe('Company');
    expect(insertPayload.company).not.toBe('Metadata Corp');
  });

  // 18. Missing company_stage remains absent (null) and is never "seed"
  it('18. verifies missing company_stage remains null and is never defaulted to "seed"', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: { id: 'run-1', role_title: 'Engineer', company_stage: null },
      error: null,
    });
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect });

    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'organization_memberships') {
          return createMembershipsMock([
            { organization_id: '11111111-1111-4111-a111-111111111111', membership_role: 'owner' },
          ]);
        }
        if (table === 'hiring_runs') return { insert: mockInsert };
        return {};
      }),
    };

    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: mockSupabase,
    });

    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      body: JSON.stringify({ role_title: 'Engineer' }),
    });

    await POST(req);
    const insertPayload = mockInsert.mock.calls[0][0][0];
    expect(insertPayload.company_stage).toBeNull();
    expect(insertPayload.company_stage).not.toBe('seed');
  });

  // 19. GET unauthenticated returns 401
  it('19. returns 401 Unauthorized for unauthenticated GET', async () => {
    requireUser.mockResolvedValueOnce({
      errorResponse: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
      user: null,
      supabase: null,
    });

    const req = new Request('http://localhost:3000/api/employer/hiring-runs', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  // 20. GET returns only authorized organization runs
  it('20. returns only authorized organization runs on GET', async () => {
    const mockOrder = vi.fn().mockResolvedValue({
      data: [{ id: 'run-1', role_title: 'Engineer', org_id: '11111111-1111-4111-a111-111111111111' }],
      error: null,
    });
    const mockIn = vi.fn().mockReturnValue({ order: mockOrder });
    const mockSelectRuns = vi.fn().mockReturnValue({ in: mockIn });

    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'organization_memberships') {
          return createMembershipsMock([
            { organization_id: '11111111-1111-4111-a111-111111111111', membership_role: 'owner' },
          ]);
        }
        if (table === 'hiring_runs') {
          return { select: mockSelectRuns };
        }
        return {};
      }),
    };

    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: mockSupabase,
    });

    const req = new Request('http://localhost:3000/api/employer/hiring-runs', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.length).toBe(1);
    expect(mockIn).toHaveBeenCalledWith('org_id', ['11111111-1111-4111-a111-111111111111']);
  });

  // 21. GET cannot return another organization's run (explicit foreign ?org_id -> 403)
  it('21. returns 403 Forbidden on GET when requesting a foreign org_id query param', async () => {
    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: {},
    });
    getVerifiedOrgMembership.mockResolvedValueOnce(null);

    const req = new Request('http://localhost:3000/api/employer/hiring-runs?org_id=22222222-2222-4222-a222-222222222222', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('Forbidden');
  });

  // 22. GET database failure returns typed 5xx
  it('22. returns 503 when organization_memberships query fails on GET', async () => {
    const mockSupabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'organization_memberships') {
          return createMembershipsMock(null, { message: 'Database connection failed' });
        }
        return {};
      }),
    };

    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: mockSupabase,
    });

    const req = new Request('http://localhost:3000/api/employer/hiring-runs', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBe('Database service unavailable');
  });

  // 23. Creation with status='paused' rejected with HTTP 400 (Part 7)
  it('23. rejects creation with status=paused returning HTTP 400', async () => {
    requireUser.mockResolvedValueOnce({ errorResponse: null, user: { id: 'u1' }, supabase: {} });
    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      body: JSON.stringify({ role_title: 'Engineer', status: 'paused' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('INVALID_HIRING_RUN_CREATION_STATUS');
  });

  // 24. Creation with status='completed' rejected with HTTP 400 (Part 7)
  it('24. rejects creation with status=completed returning HTTP 400', async () => {
    requireUser.mockResolvedValueOnce({ errorResponse: null, user: { id: 'u1' }, supabase: {} });
    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      body: JSON.stringify({ role_title: 'Engineer', status: 'completed' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('INVALID_HIRING_RUN_CREATION_STATUS');
  });

  // 25. Creation with status='archived' rejected with HTTP 400 (Part 7)
  it('25. rejects creation with status=archived returning HTTP 400', async () => {
    requireUser.mockResolvedValueOnce({ errorResponse: null, user: { id: 'u1' }, supabase: {} });
    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      body: JSON.stringify({ role_title: 'Engineer', status: 'archived' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('INVALID_HIRING_RUN_CREATION_STATUS');
  });
});
