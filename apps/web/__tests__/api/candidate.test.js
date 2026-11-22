import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/candidate/profile/route';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

// Mock Supabase Server Client
vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe('/api/candidate/profile', () => {
  const mockSupabase = {
    auth: { getUser: vi.fn() },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
    })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    createSupabaseServerClient.mockReturnValue(mockSupabase);
  });

  it('GET returns 401 if not logged in', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('Unauthorized') });
    const res = await GET(new Request('http://localhost:3000/api/candidate/profile'));
    expect(res.status).toBe(401);
  });

  it('GET returns profile if logged in', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'test-password-not-secret' } }, error: null });
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'test-password-not-secret', name: 'Test' }, error: null }),
    });

    const res = await GET(new Request('http://localhost:3000/api/candidate/profile'));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.name).toBe('Test');
  });

  it('POST upserts profile data', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'test-password-not-secret' } }, error: null });
    const singleMock = vi.fn().mockResolvedValue({ data: { id: 'test-password-not-secret', name: 'Updated Name' }, error: null });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const upsertMock = vi.fn().mockReturnValue({ select: selectMock });
    mockSupabase.from.mockReturnValue({
      upsert: upsertMock,
    });

    const req = new Request('http://localhost:3000/api/candidate/profile', {
      method: 'POST',
      body: JSON.stringify({ name: 'Updated Name' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(upsertMock).toHaveBeenCalled();
  });
});
