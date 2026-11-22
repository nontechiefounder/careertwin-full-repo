import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpcResponse = {
  data: [{
    status: 'shortlisted',
    decision_packet: {
      ledger_revision: 1,
      rubric_version: '1.0.0',
      human_decision: { action: 'advance', rationale: 'Approved via atomic RPC' }
    }
  }],
  error: null
};

const mockSupabase = {
  auth: {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user_emp_123', email: 'emp@example.com' } }, error: null })
  },
  from: vi.fn(),
  rpc: vi.fn().mockResolvedValue(mockRpcResponse)
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
    mockSupabase.rpc.mockResolvedValue(mockRpcResponse);
  });

  it('verifies dry-run email setting prevents any external email sends and records status: dry_run', async () => {
    const mockCandidate = {
      id: 'cand_test_123',
      candidate_id: 'profile_test_123',
      hiring_runs: { org_id: 'org_test_123', role_title: 'Senior Backend Engineer' },
      candidate_profiles: { name: 'Test Candidate', email: 'test.candidate@example.com' },
      decision_packet: { ledger_revision: 1, rubric_version: '1.0.0' }
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
      body: JSON.stringify({ action: 'advance', rationale: 'Candidate verified against all Must-Have requirements.', expected_ledger_revision: 1, expected_rubric_version: '1.0.0' })
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

  it('rejects invalid actions with HTTP 400 and preserves candidate status', async () => {
    let updateCalled = false;
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'candidates') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'c1', hiring_runs: { org_id: 'org_test_123' }, decision_packet: { ledger_revision: 1, rubric_version: '1.0.0' } }, error: null }),
          update: vi.fn(() => {
            updateCalled = true;
            return { single: vi.fn().mockResolvedValue({ data: {}, error: null }) };
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

    const request = new Request('http://localhost:3000/api/employer/packets/c1/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'archive_invalid', expected_ledger_revision: 1, expected_rubric_version: '1.0.0' })
    });

    const response = await actionHandler(request, { params: Promise.resolve({ extractionId: 'c1' }) });
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toBe('INVALID_ACTION');
    expect(updateCalled).toBe(false);
  });

  it('rejects unauthenticated caller with HTTP 401', async () => {
    const { NextResponse } = await import('next/server');
    requireUser.mockResolvedValue({
      user: null,
      supabase: null,
      errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    });

    const request = new Request('http://localhost:3000/api/employer/packets/c1/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'advance', rationale: 'Candidate verified against all Must-Have requirements.', expected_ledger_revision: 1, expected_rubric_version: '1.0.0' })
    });

    const response = await actionHandler(request, { params: Promise.resolve({ extractionId: 'c1' }) });
    expect(response.status).toBe(401);
  });

  it('rejects cross-organization access with HTTP 403', async () => {
    const { getVerifiedOrgMembership } = await import('@/lib/serverAuth');
    getVerifiedOrgMembership.mockResolvedValueOnce(null); // Not a member of this candidate org

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'candidates') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'c_foreign', hiring_runs: { org_id: 'org_other_999' }, decision_packet: { ledger_revision: 1, rubric_version: '1.0.0' } }, error: null })
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    });

    requireUser.mockResolvedValue({
      user: { id: 'user_emp_123', email: 'emp@example.com' },
      supabase: mockSupabase,
      errorResponse: null
    });

    const request = new Request('http://localhost:3000/api/employer/packets/c_foreign/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'advance', rationale: 'Candidate verified against all Must-Have requirements.', expected_ledger_revision: 1, expected_rubric_version: '1.0.0' })
    });

    const response = await actionHandler(request, { params: Promise.resolve({ extractionId: 'c_foreign' }) });
    expect(response.status).toBe(403);
  });

  it('suppresses duplicate scheduled email sequences on repeated requests', async () => {
    const mockCandidate = {
      id: 'cand_dup_123',
      candidate_id: 'profile_dup_123',
      hiring_runs: { org_id: 'org_test_123', role_title: 'Tech Lead' },
      candidate_profiles: { name: 'Dup Candidate', email: 'dup@example.com' },
      decision_packet: { ledger_revision: 1, rubric_version: '1.0.0' }
    };

    let insertedEmailsCount = 0;

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
          single: vi.fn().mockResolvedValue({ data: { name: 'Employer' }, error: null })
        };
      }
      if (table === 'activity_events') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null })
        };
      }
      if (table === 'scheduled_emails') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          // Return existing Day 0 email already initiated
          then: (resolve) => resolve({ data: [{ id: 'existing_email_0' }], error: null }),
          insert: vi.fn((rows) => {
            insertedEmailsCount += rows.length;
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

    const request = new Request('http://localhost:3000/api/employer/packets/cand_dup_123/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'advance', rationale: 'Candidate verified against all Must-Have requirements.', expected_ledger_revision: 1, expected_rubric_version: '1.0.0' })
    });

    const response = await actionHandler(request, { params: Promise.resolve({ extractionId: 'cand_dup_123' }) });
    expect(response.status).toBe(200);

    // Assert zero emails inserted because duplicate sequence was suppressed
    expect(insertedEmailsCount).toBe(0);
  });

  it('rejects action request with missing or empty rationale with HTTP 400 and preserves candidate status', async () => {
    let updateCalled = false;
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'candidates') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'c1', hiring_runs: { org_id: 'org_test_123' }, decision_packet: { ledger_revision: 1, rubric_version: '1.0.0' } }, error: null }),
          update: vi.fn(() => {
            updateCalled = true;
            return { single: vi.fn().mockResolvedValue({ data: {}, error: null }) };
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

    // Case A: Missing rationale field
    const reqNoRationale = new Request('http://localhost:3000/api/employer/packets/c1/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'advance', expected_ledger_revision: 1, expected_rubric_version: '1.0.0' })
    });

    const resNoRationale = await actionHandler(reqNoRationale, { params: Promise.resolve({ extractionId: 'c1' }) });
    expect(resNoRationale.status).toBe(400);
    const bodyA = await resNoRationale.json();
    expect(bodyA.error).toBe('RATIONALE_REQUIRED');
    expect(updateCalled).toBe(false);

    // Case B: Whitespace-only rationale
    const reqWhitespace = new Request('http://localhost:3000/api/employer/packets/c1/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'advance', rationale: '    ', expected_ledger_revision: 1, expected_rubric_version: '1.0.0' })
    });

    const resWhitespace = await actionHandler(reqWhitespace, { params: Promise.resolve({ extractionId: 'c1' }) });
    expect(resWhitespace.status).toBe(400);
    const bodyB = await resWhitespace.json();
    expect(bodyB.error).toBe('RATIONALE_REQUIRED');
    expect(updateCalled).toBe(false);
  });

  it('direct sendSMTPEmail and sendGmailEmail invocations are strictly suppressed in dry-run mode', async () => {
    const { sendSMTPEmail } = await import('@/lib/smtp');
    const { sendGmailEmail } = await import('@/lib/gmail');

    // In default or explicit dry-run mode
    process.env.CAREERTWIN_DRY_RUN_EMAIL = 'true';

    const smtpRes = await sendSMTPEmail({
      to: 'candidate@example.com',
      subject: 'Interview Invite',
      body: '<p>Hello</p>'
    });
    expect(smtpRes.dryRun).toBe(true);
    expect(smtpRes.messageId).toBe('dry-run-suppressed');

    const gmailRes = await sendGmailEmail('fake_refresh_token', {
      to: 'candidate@example.com',
      subject: 'Interview Invite',
      body: '<p>Hello</p>'
    });
    expect(gmailRes.dryRun).toBe(true);
    expect(gmailRes.id).toBe('dry-run-suppressed');
  });

  it('atomically suppresses duplicate email sequence when concurrent request hits database unique constraint (23505)', async () => {
    const mockCandidate = {
      id: 'cand_concurrent_1',
      candidate_id: 'profile_concurrent_1',
      hiring_runs: { org_id: 'org_test_123', role_title: 'Backend Lead' },
      candidate_profiles: { name: 'Concurrent Candidate', email: 'concurrent@example.com' },
      decision_packet: { ledger_revision: 1, rubric_version: '1.0.0' }
    };

    let downstreamInsertAttempted = false;

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
          single: vi.fn().mockResolvedValue({ data: { name: 'Employer User' }, error: null })
        };
      }
      if (table === 'activity_events') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === 'scheduled_emails') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          // Pretend select check didn't see it (classic race condition window)
          then: (resolve) => resolve({ data: [], error: null }),
          insert: vi.fn((rows) => {
            if (rows.length === 1 && rows[0].sequence_day === 0) {
              // Simulate PostgreSQL unique constraint violation (code 23505)
              return Promise.resolve({
                error: {
                  code: '23505',
                  message: 'duplicate key value violates unique constraint "idx_scheduled_emails_tenant_seq"'
                }
              });
            }
            downstreamInsertAttempted = true;
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

    const request = new Request('http://localhost:3000/api/employer/packets/cand_concurrent_1/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'advance', rationale: 'Verified candidate credentials.', expected_ledger_revision: 1, expected_rubric_version: '1.0.0' })
    });

    const response = await actionHandler(request, { params: Promise.resolve({ extractionId: 'cand_concurrent_1' }) });
    expect(response.status).toBe(200);
    // Downstream sequence days must NOT be attempted because Day 0 was rejected by database uniqueness
    expect(downstreamInsertAttempted).toBe(false);
  });

  it('handles concurrent requests from separate application instances safely without duplicate sequence creation', async () => {
    const mockCandidate = {
      id: 'cand_multi_inst',
      candidate_id: 'profile_multi_inst',
      hiring_runs: { org_id: 'org_test_123', role_title: 'Full Stack Engineer' },
      candidate_profiles: { name: 'Multi Instance Candidate', email: 'multi@example.com' },
      decision_packet: { ledger_revision: 1, rubric_version: '1.0.0' }
    };

    // Shared mock database state simulating Postgres
    const dbScheduledEmails = new Set();
    let instance1Day0Count = 0;
    let instance2Day0Count = 0;

    const createInstanceMock = (instanceId) => {
      return {
        rpc: vi.fn().mockResolvedValue(mockRpcResponse),
        from: vi.fn((table) => {
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
              single: vi.fn().mockResolvedValue({ data: { name: 'Employer' }, error: null })
            };
          }
          if (table === 'activity_events') {
            return { insert: vi.fn().mockResolvedValue({ error: null }) };
          }
          if (table === 'scheduled_emails') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              // Both instances query before either commits
              then: (resolve) => resolve({ data: [], error: null }),
              insert: vi.fn(async (rows) => {
                for (const row of rows) {
                  const key = `${row.employer_id}_${row.candidate_id}_${row.sequence_day}`;
                  if (dbScheduledEmails.has(key)) {
                    return { error: { code: '23505', message: 'duplicate key violates idx_scheduled_emails_tenant_seq' } };
                  }
                  dbScheduledEmails.add(key);
                  if (row.sequence_day === 0) {
                    if (instanceId === 1) instance1Day0Count++;
                    if (instanceId === 2) instance2Day0Count++;
                  }
                }
                return { error: null };
              })
            };
          }
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
        })
      };
    };

    const inst1Client = createInstanceMock(1);
    const inst2Client = createInstanceMock(2);

    // Run instance 1 action
    mockSupabase.from = inst1Client.from;
    mockSupabase.rpc = inst1Client.rpc;
    const req1 = new Request('http://localhost:3000/api/employer/packets/cand_multi_inst/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'advance', rationale: 'Instance 1 decision rationale.', expected_ledger_revision: 1, expected_rubric_version: '1.0.0' })
    });
    const res1 = await actionHandler(req1, { params: Promise.resolve({ extractionId: 'cand_multi_inst' }) });

    // Run instance 2 action concurrently
    mockSupabase.from = inst2Client.from;
    mockSupabase.rpc = inst2Client.rpc;
    const req2 = new Request('http://localhost:3000/api/employer/packets/cand_multi_inst/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'advance', rationale: 'Instance 2 decision rationale.', expected_ledger_revision: 1, expected_rubric_version: '1.0.0' })
    });
    const res2 = await actionHandler(req2, { params: Promise.resolve({ extractionId: 'cand_multi_inst' }) });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Exactly ONE instance must have successfully inserted Day 0
    expect(instance1Day0Count + instance2Day0Count).toBe(1);
  });

  it('recovers missing sequence days after partial sequence creation (recovery resilience)', async () => {
    const mockCandidate = {
      id: 'cand_recovery_1',
      candidate_id: 'profile_recovery_1',
      hiring_runs: { org_id: 'org_test_123', role_title: 'Infrastructure Architect' },
      candidate_profiles: { name: 'Recovery Candidate', email: 'recovery@example.com' },
      decision_packet: { ledger_revision: 1, rubric_version: '1.0.0' }
    };

    let insertedDays = [];

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
          single: vi.fn().mockResolvedValue({ data: { name: 'Employer User' }, error: null })
        };
      }
      if (table === 'activity_events') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === 'scheduled_emails') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          // Simulate partial sequence: Day 0 exists, but Day 2 and Day 5 were never created!
          then: (resolve) => resolve({ data: [{ id: 'e0_existing', sequence_day: 0 }], error: null }),
          insert: vi.fn((rows) => {
            rows.forEach(r => insertedDays.push(r.sequence_day));
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

    const request = new Request('http://localhost:3000/api/employer/packets/cand_recovery_1/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'advance', rationale: 'Recovering sequence after previous interruption.', expected_ledger_revision: 1, expected_rubric_version: '1.0.0' })
    });

    const response = await actionHandler(request, { params: Promise.resolve({ extractionId: 'cand_recovery_1' }) });
    expect(response.status).toBe(200);

    // Day 0 must NOT be re-inserted, but missing Day 2 and Day 5 must be recovered!
    expect(insertedDays).not.toContain(0);
    expect(insertedDays).toContain(2);
    expect(insertedDays).toContain(5);
  });

  it('enforces that deduplication keys cannot be null and passes tenant org_id to scheduled_emails', async () => {
    const mockCandidate = {
      id: 'cand_null_test',
      candidate_id: 'profile_null_test',
      hiring_runs: { org_id: 'org_tenant_abc', role_title: 'Platform Engineer' },
      candidate_profiles: { name: 'Tenant Scoped Candidate', email: 'tenant@example.com' },
      decision_packet: { ledger_revision: 1, rubric_version: '1.0.0' }
    };

    let insertedPayloads = [];

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
          single: vi.fn().mockResolvedValue({ data: { name: 'Employer' }, error: null })
        };
      }
      if (table === 'activity_events') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) };
      }
      if (table === 'scheduled_emails') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          then: (resolve) => resolve({ data: [], error: null }),
          insert: vi.fn((rows) => {
            insertedPayloads.push(...rows);
            return Promise.resolve({ error: null });
          })
        };
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    });

    requireUser.mockResolvedValue({
      user: { id: 'user_emp_999', email: 'emp@example.com' },
      supabase: mockSupabase,
      errorResponse: null
    });

    const request = new Request('http://localhost:3000/api/employer/packets/cand_null_test/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'advance', rationale: 'Valid rationale with complete tenant coupling.', expected_ledger_revision: 1, expected_rubric_version: '1.0.0' })
    });

    const response = await actionHandler(request, { params: Promise.resolve({ extractionId: 'cand_null_test' }) });
    expect(response.status).toBe(200);

    // Verify all inserted rows carry non-null deduplication keys and org_id
    expect(insertedPayloads.length).toBeGreaterThanOrEqual(1);
    for (const payload of insertedPayloads) {
      expect(payload.employer_id).toBe('user_emp_999');
      expect(payload.employer_id).not.toBeNull();
      expect(payload.candidate_id).toBe('profile_null_test');
      expect(payload.candidate_id).not.toBeNull();
      expect(payload.sequence_day).toBeTypeOf('number');
      expect(payload.sequence_day).not.toBeNull();
      expect(payload.org_id).toBe('org_tenant_abc');
    }
  });
});
