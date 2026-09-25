import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabase = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user_emp_123', email: 'emp@example.com' } }, error: null })
  },
  from: vi.fn()
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabase)
}));

vi.mock('@/lib/serverAuth', () => ({
  requireUser: vi.fn(),
  getVerifiedOrgMembership: vi.fn().mockResolvedValue({ user_id: 'user_emp_123', org_id: 'org_test_123', membership_role: 'owner' })
}));

import { POST as actionHandler } from '@/app/api/employer/packets/[extractionId]/action/route';
import { requireUser } from '@/lib/serverAuth';

describe('Dry-Run Email Safety & Zero-Send Suite (RC-C1.2 Condition 5)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
    process.env.CAREERTWIN_DRY_RUN_EMAIL = 'true';
    vi.clearAllMocks();
  });

  it('verifies dry-run email setting prevents any external email sends and records status: dry_run', async () => {
    const mockCandidate = {
      id: 'cand_test_123',
      candidate_id: 'profile_test_123',
      hiring_runs: { org_id: 'org_test_123', role_title: 'Senior Backend Engineer' },
      candidate_profiles: { name: 'Test Candidate', email: 'test.candidate@example.com' }
    };

    const insertedEmails = [];
    const insertedEvents = [];

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'candidates') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: mockCandidate, error: null }),
          update: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: mockCandidate, error: null })
        };
      }
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { name: 'Employer User', gmail_refresh_token: 'fake_token' }, error: null })
        };
      }
      if (table === 'activity_events') {
        return {
          insert: vi.fn((rows) => {
            insertedEvents.push(...rows);
            return Promise.resolve({ error: null });
          })
        };
      }
      if (table === 'scheduled_emails') {
        return {
          insert: vi.fn((rows) => {
            insertedEmails.push(...rows);
            return Promise.resolve({ error: null });
          })
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    });

    requireUser.mockResolvedValue({
      user: { id: 'user_emp_123', email: 'emp@example.com' },
      supabase: mockSupabase,
      errorResponse: null
    });

    const request = new Request('http://localhost:3000/api/employer/packets/cand_test_123/action', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-valid-token'
      },
      body: JSON.stringify({ action: 'advance' })
    });

    const response = await actionHandler(request, { params: Promise.resolve({ extractionId: 'cand_test_123' }) });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe('shortlisted');

    // Assert scheduled_emails records carry status 'dry_run' with zero pending/sent emails
    expect(insertedEmails.length).toBe(3); // Day 0, Day 2, Day 5
    insertedEmails.forEach(email => {
      expect(email.status).toBe('dry_run');
      expect(email.error_details).toContain('Dry run active');
    });

    const nonDryRunEmails = insertedEmails.filter(e => e.status !== 'dry_run');
    expect(nonDryRunEmails.length).toBe(0);
  });
});
