import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/serverAuth', () => ({
  requireUser: vi.fn(),
  getVerifiedOrgMembership: vi.fn(),
}));

import { POST } from '@/app/api/employer/sourcing-sessions/route';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';

const VALID_RUN_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const ORG_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

describe('Sourcing Session Route Security — UX-V2-D4 (10 cases)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. 401 unauthenticated ────────────────────────────────────────────────
  it('1. returns 401 for unauthenticated POST', async () => {
    requireUser.mockResolvedValueOnce({
      errorResponse: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
      user: null,
      supabase: null,
    });
    const req = new Request('http://localhost/api/employer/sourcing-sessions', {
      method: 'POST',
      body: JSON.stringify({ hiring_run_id: VALID_RUN_ID }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  // ── 2. 400 invalid JSON ───────────────────────────────────────────────────
  it('2. returns 400 for invalid JSON body', async () => {
    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: {},
    });
    const req = new Request('http://localhost/api/employer/sourcing-sessions', {
      method: 'POST',
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid JSON payload');
  });

  // ── 3. 400 missing hiring_run_id ──────────────────────────────────────────
  it('3. returns 400 when hiring_run_id is missing', async () => {
    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: {},
    });
    const req = new Request('http://localhost/api/employer/sourcing-sessions', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('hiring_run_id');
  });

  // ── 4. 400 non-UUID hiring_run_id ─────────────────────────────────────────
  it('4. returns 400 for non-UUID hiring_run_id', async () => {
    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: {},
    });
    const req = new Request('http://localhost/api/employer/sourcing-sessions', {
      method: 'POST',
      body: JSON.stringify({ hiring_run_id: 'not-a-uuid' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  // ── 5. 404 unknown hiring_run_id ──────────────────────────────────────────
  it('5. returns 404 when hiring run does not exist', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
          }),
        }),
      }),
    };
    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: mockSupabase,
    });
    const req = new Request('http://localhost/api/employer/sourcing-sessions', {
      method: 'POST',
      body: JSON.stringify({ hiring_run_id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Hiring run not found');
  });

  // ── 6. 403 no org membership ──────────────────────────────────────────────
  it('6. returns 403 when user has no org membership', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: VALID_RUN_ID, org_id: ORG_ID, status: 'active' }, error: null }),
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

    const req = new Request('http://localhost/api/employer/sourcing-sessions', {
      method: 'POST',
      body: JSON.stringify({ hiring_run_id: VALID_RUN_ID }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('Forbidden');
  });

  // ── 7. 403 auditor role forbidden ─────────────────────────────────────────
  it('7. returns 403 for auditor-role membership (cannot create sessions)', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: VALID_RUN_ID, org_id: ORG_ID, status: 'active' }, error: null }),
          }),
        }),
      }),
    };
    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: mockSupabase,
    });
    getVerifiedOrgMembership.mockResolvedValueOnce({ membership_role: 'auditor' });

    const req = new Request('http://localhost/api/employer/sourcing-sessions', {
      method: 'POST',
      body: JSON.stringify({ hiring_run_id: VALID_RUN_ID }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  // ── 8. 200 success path — capability-limited response (no DB insert manufactured) ──
  it('8. returns capability-limited response describing founder-assisted handoff (no DB row manufactured)', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: VALID_RUN_ID, org_id: ORG_ID, status: 'active' }, error: null }),
          }),
        }),
      }),
    };
    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: mockSupabase,
    });
    getVerifiedOrgMembership.mockResolvedValueOnce({ membership_role: 'owner' });

    const req = new Request('http://localhost/api/employer/sourcing-sessions', {
      method: 'POST',
      body: JSON.stringify({ hiring_run_id: VALID_RUN_ID }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sourcing_status).toBe('founder_assisted_handoff');
    expect(data.capability_active).toBe(false);
    expect(data.operator_notice).toContain('not active');
  });

  // ── 9. response includes verified hiring_run_id and safe_next_action ──────
  it('9. response includes verified hiring_run_id and safe_next_action', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: VALID_RUN_ID, org_id: ORG_ID, status: 'active' }, error: null }),
          }),
        }),
      }),
    };
    requireUser.mockResolvedValueOnce({
      errorResponse: null,
      user: { id: 'u1' },
      supabase: mockSupabase,
    });
    getVerifiedOrgMembership.mockResolvedValueOnce({ membership_role: 'admin' });

    const req = new Request('http://localhost/api/employer/sourcing-sessions', {
      method: 'POST',
      body: JSON.stringify({ hiring_run_id: VALID_RUN_ID }),
    });
    const res = await POST(req);
    const data = await res.json();
    expect(data.hiring_run_id).toBe(VALID_RUN_ID);
    expect(data.safe_next_action).toBeTruthy();
  });

  // ── 10. 500 DB error returns typed safe_next_action ───────────────────────
  it('10. returns 500 with safe_next_action when internal exception occurs', async () => {
    requireUser.mockImplementationOnce(() => {
      throw new Error('Unexpected internal failure');
    });

    const req = new Request('http://localhost/api/employer/sourcing-sessions', {
      method: 'POST',
      body: JSON.stringify({ hiring_run_id: VALID_RUN_ID }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('SOURCING_SESSION_CREATION_FAILED');
    expect(data.safe_next_action).toBeTruthy();
  });
});

