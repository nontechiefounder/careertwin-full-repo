import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequireUser = vi.fn();
const mockGetVerifiedOrgMembership = vi.fn();
const mockCreateSupabaseServerClient = vi.fn();
const mockGenerateChat = vi.fn();

vi.mock('@/lib/serverAuth', () => ({
  requireUser: (...args) => mockRequireUser(...args),
  getVerifiedOrgMembership: (...args) => mockGetVerifiedOrgMembership(...args),
}));

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: (...args) => mockCreateSupabaseServerClient(...args),
}));

vi.mock('@/lib/ai', () => ({
  generateChat: (...args) => mockGenerateChat(...args),
}));

import { POST } from '@/app/api/candidate/screening-sessions/[sessionId]/complete/route';

describe('Screening Session Transactional Completion & Auth (F01 / F07 / B4)', () => {
  const sessionId = '22222222-2222-4222-a222-222222222222';
  const orgId = '00000000-0000-4000-c000-000000000001';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeAdminClient(sessionRow, summaryRow = null, rpcImpl = null) {
    return {
      from: (table) => {
        if (table === 'screening_sessions') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: sessionRow, error: null }),
              }),
            }),
          };
        }
        if (table === 'screening_summaries') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: summaryRow, error: null }),
              }),
            }),
          };
        }
        if (table === 'screening_answers') {
          return {
            select: () => ({
              eq: () => Promise.resolve({
                data: [{ question_index: 0, answer_text: 'Built PostgreSQL HA clusters.' }],
                error: null,
              }),
            }),
          };
        }
        throw new Error(`Unexpected direct table write/read on ${table}`);
      },
      rpc: rpcImpl || vi.fn(),
    };
  }

  it('F01: blocks auditor and viewer roles with 403 before any AI calls or RPC writes', async () => {
    for (const role of ['auditor', 'viewer']) {
      vi.clearAllMocks();
      const rpcSpy = vi.fn();
      mockRequireUser.mockResolvedValue({
        user: { id: 'auditor-1', email: 'auditor@acme.com' },
        supabase: {},
      });
      mockCreateSupabaseServerClient.mockResolvedValue(
        makeAdminClient(
          {
            id: sessionId,
            candidate_id: 'cand-1',
            status: 'in_progress',
            candidate_profiles: { email: 'cand@acme.com' },
            hiring_runs: { org_id: orgId, role_title: 'Infra Lead' },
          },
          null,
          rpcSpy
        )
      );
      mockGetVerifiedOrgMembership.mockResolvedValue({
        membership_status: 'active',
        membership_role: role,
      });

      const res = await POST(new Request(`http://localhost:3010/api/candidate/screening-sessions/${sessionId}/complete`, { method: 'POST' }), {
        params: Promise.resolve({ sessionId }),
      });

      expect(res.status).toBe(403);
      expect(mockGenerateChat).not.toHaveBeenCalled();
      expect(rpcSpy).not.toHaveBeenCalled();
    }
  });

  it('F07 / B4: rejects out-of-range AI scores (502) and persists via transactional RPC with identical initial & replay structured fields', async () => {
    const rpcSpy = vi.fn().mockResolvedValue({
      data: {
        replayed: false,
        summary: {
          overall_score: 0.85,
          summary_text: 'Strong distributed systems background.',
          technical_score: 0.85,
          communication_score: 0.9,
          strengths: ['PostgreSQL replication', 'Incident response'],
          concerns: ['Limited Rust'],
          recommended_next_step: 'Advance to system design round',
        },
      },
      error: null,
    });

    mockRequireUser.mockResolvedValue({
      user: { id: 'cand-1', email: 'cand@acme.com' },
      supabase: {},
    });

    // 1. Out-of-range score -> 502 with zero RPC call
    mockCreateSupabaseServerClient.mockResolvedValue(
      makeAdminClient(
        {
          id: sessionId,
          candidate_id: 'cand-1',
          status: 'in_progress',
          candidate_profiles: { email: 'cand@acme.com' },
          hiring_runs: { org_id: orgId, role_title: 'Infra Lead' },
        },
        null,
        rpcSpy
      )
    );
    mockGenerateChat.mockResolvedValueOnce({
      technical_score: 1.5,
      communication_score: 0.8,
      summary_text: 'Invalid score.',
    });
    const badRes = await POST(new Request(`http://localhost:3010/api/candidate/screening-sessions/${sessionId}/complete`, { method: 'POST' }), {
      params: Promise.resolve({ sessionId }),
    });
    expect(badRes.status).toBe(502);
    expect(rpcSpy).not.toHaveBeenCalled();

    // 2. Valid completion -> calls transactional RPC, returns structured fields
    mockGenerateChat.mockResolvedValueOnce({
      technical_score: 0.85,
      communication_score: 0.9,
      summary_text: 'Strong distributed systems background.',
      strengths: ['PostgreSQL replication', 'Incident response'],
      concerns: ['Limited Rust'],
      recommended_next_step: 'Advance to system design round',
    });
    const okRes = await POST(new Request(`http://localhost:3010/api/candidate/screening-sessions/${sessionId}/complete`, { method: 'POST' }), {
      params: Promise.resolve({ sessionId }),
    });
    const okJson = await okRes.json();
    expect(okRes.status).toBe(200);
    expect(okJson.replayed).toBe(false);
    expect(rpcSpy).toHaveBeenCalledWith(
      'complete_screening_session_transactional',
      expect.objectContaining({
        p_session_id: sessionId,
        p_technical_score: 0.85,
        p_communication_score: 0.9,
        p_strengths: ['PostgreSQL replication', 'Incident response'],
        p_concerns: ['Limited Rust'],
        p_recommended_next_step: 'Advance to system design round',
      })
    );
    expect(okJson.summary.strengths).toEqual(['PostgreSQL replication', 'Incident response']);
    expect(okJson.summary.concerns).toEqual(['Limited Rust']);
    expect(okJson.summary.recommended_next_step).toBe('Advance to system design round');

    // 3. Replay on completed session -> returns identical structured fields
    mockCreateSupabaseServerClient.mockResolvedValue(
      makeAdminClient(
        {
          id: sessionId,
          candidate_id: 'cand-1',
          status: 'completed',
          candidate_profiles: { email: 'cand@acme.com' },
          hiring_runs: { org_id: orgId, role_title: 'Infra Lead' },
        },
        okJson.summary,
        rpcSpy
      )
    );
    const replayRes = await POST(new Request(`http://localhost:3010/api/candidate/screening-sessions/${sessionId}/complete`, { method: 'POST' }), {
      params: Promise.resolve({ sessionId }),
    });
    const replayJson = await replayRes.json();
    expect(replayRes.status).toBe(200);
    expect(replayJson.replayed).toBe(true);
    expect(replayJson.summary).toEqual(okJson.summary);
  });

  it('R2: fails closed (503) with zero generation and zero persistence on answer-read error, malformed rows (422), or empty answers (422)', async () => {
    const makeAnswersClient = (answersResult, rpcSpy) => ({
      from: (table) => {
        if (table === 'screening_sessions') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({
                  data: {
                    id: sessionId,
                    candidate_id: 'cand-1',
                    status: 'in_progress',
                    candidate_profiles: { email: 'cand@acme.com' },
                    hiring_runs: { org_id: orgId, role_title: 'Infra Lead' },
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'screening_answers') {
          return { select: () => ({ eq: () => Promise.resolve(answersResult) }) };
        }
        throw new Error(`Unexpected table ${table}`);
      },
      rpc: rpcSpy,
    });

    mockRequireUser.mockResolvedValue({ user: { id: 'cand-1', email: 'cand@acme.com' }, supabase: {} });

    // 1. DB error on screening_answers
    const rpcSpy1 = vi.fn();
    mockCreateSupabaseServerClient.mockResolvedValueOnce(
      makeAnswersClient({ data: null, error: { message: 'DB read timeout' } }, rpcSpy1)
    );
    const errRes = await POST(new Request(`http://localhost:3010/api/candidate/screening-sessions/${sessionId}/complete`, { method: 'POST' }), {
      params: Promise.resolve({ sessionId }),
    });
    expect(errRes.status).toBe(503);
    expect((await errRes.json()).error).toBe('SCREENING_ANSWERS_UNAVAILABLE');
    expect(mockGenerateChat).not.toHaveBeenCalled();
    expect(rpcSpy1).not.toHaveBeenCalled();

    // 2. Null non-array payload
    mockCreateSupabaseServerClient.mockResolvedValueOnce(makeAnswersClient({ data: null, error: null }, rpcSpy1));
    const nullRes = await POST(new Request(`http://localhost:3010/api/candidate/screening-sessions/${sessionId}/complete`, { method: 'POST' }), {
      params: Promise.resolve({ sessionId }),
    });
    expect(nullRes.status).toBe(503);

    // 3. Malformed answer rows (blank answer_text)
    mockCreateSupabaseServerClient.mockResolvedValueOnce(
      makeAnswersClient({ data: [{ question_index: 0, answer_text: '   ' }], error: null }, rpcSpy1)
    );
    const malformedRes = await POST(new Request(`http://localhost:3010/api/candidate/screening-sessions/${sessionId}/complete`, { method: 'POST' }), {
      params: Promise.resolve({ sessionId }),
    });
    expect(malformedRes.status).toBe(422);
    expect((await malformedRes.json()).error).toBe('SCREENING_ANSWERS_INVALID');

    // 4. Legitimate empty answers
    mockCreateSupabaseServerClient.mockResolvedValueOnce(makeAnswersClient({ data: [], error: null }, rpcSpy1));
    const emptyRes = await POST(new Request(`http://localhost:3010/api/candidate/screening-sessions/${sessionId}/complete`, { method: 'POST' }), {
      params: Promise.resolve({ sessionId }),
    });
    expect(emptyRes.status).toBe(422);
    expect((await emptyRes.json()).error).toBe('INSUFFICIENT_SCREENING_ANSWERS');
    expect(mockGenerateChat).not.toHaveBeenCalled();
    expect(rpcSpy1).not.toHaveBeenCalled();

    // 5. V6-C1: Mixed valid answer + blank row filters blank row and evaluates the valid answer
    const rpcSpy2 = vi.fn().mockResolvedValue({
      data: {
        replayed: false,
        summary: { overall_score: 0.8, technical_score: 0.8, communication_score: 0.8, summary_text: 'Mixed ok.', strengths: [], concerns: [], recommended_next_step: 'Review' },
      },
      error: null,
    });
    mockCreateSupabaseServerClient.mockResolvedValueOnce(
      makeAnswersClient({ data: [{ question_index: 0, answer_text: 'Valid answer' }, { question_index: 1, answer_text: '   ' }], error: null }, rpcSpy2)
    );
    mockGenerateChat.mockResolvedValueOnce({
      technical_score: 0.8,
      communication_score: 0.8,
      summary_text: 'Mixed ok.',
      strengths: [],
      concerns: [],
      recommended_next_step: 'Review',
    });
    const mixedRes = await POST(new Request(`http://localhost:3010/api/candidate/screening-sessions/${sessionId}/complete`, { method: 'POST' }), {
      params: Promise.resolve({ sessionId }),
    });
    expect(mixedRes.status).toBe(200);
    expect(mockGenerateChat).toHaveBeenCalledTimes(1);
    expect(rpcSpy2).toHaveBeenCalledTimes(1);
  });
});
