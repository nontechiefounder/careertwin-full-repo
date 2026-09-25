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
