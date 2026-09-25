import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/employer/hiring-runs/route';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

// Mock Supabase Server Client
vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe('/api/employer/hiring-runs', () => {
  const mockSupabase = {
    auth: { getUser: vi.fn() },
    from: vi.fn(() => ({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
    })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    createSupabaseServerClient.mockReturnValue(mockSupabase);
  });

  it('POST creates a new hiring run', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'employer-123' } }, error: null });
    const insertMock = vi.fn().mockResolvedValue({
      data: { id: 'run-789' },
      error: null,
    });
    mockSupabase.from.mockReturnValue({
      insert: insertMock,
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'run-789' }, error: null }),
    });

    const req = new Request('http://localhost:3000/api/employer/hiring-runs', {
      method: 'POST',
      body: JSON.stringify({
        role_title: 'Senior Engineer',
        status: 'active'
      }),
    });

    const res = await POST(req);
    const data = await res.json();
    
    expect(res.status).toBe(200);
    expect(data.hiring_run_id).toBe('run-789');
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      role_title: 'Senior Engineer',
      employer_id: 'employer-123'
    }));
  });
});
