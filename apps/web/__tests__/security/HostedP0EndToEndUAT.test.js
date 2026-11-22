import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockRequest } from './apiAuthorizationTestHarness';

// Import P0 handlers
import { GET as getPacket } from '@/app/api/employer/packets/[extractionId]/route';
import { POST as actionPacket } from '@/app/api/employer/packets/[extractionId]/action/route';
import { POST as generatePacket } from '@/app/api/employer/packets/[extractionId]/generate/route';
import { POST as createScreeningSession } from '@/app/api/employer/screening-sessions/route';

import { GET as getCandidateStatus } from '@/app/api/candidate/status/[candidateId]/route';
import { GET as getProofProfile } from '@/app/api/candidate/proof-profile/[candidateId]/route';
import { POST as generateProofProfile } from '@/app/api/candidate/proof-profile/[candidateId]/generate/route';
import { GET as getScreeningSession } from '@/app/api/candidate/screening-sessions/[sessionId]/route';
import { POST as startScreening } from '@/app/api/candidate/screening-sessions/[sessionId]/start/route';
import { POST as answerScreening } from '@/app/api/candidate/screening-sessions/[sessionId]/answer/route';
import { POST as completeScreening } from '@/app/api/candidate/screening-sessions/[sessionId]/complete/route';

import { createSupabaseServerClient } from '@/lib/supabaseServer';

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock('@/lib/ai', () => ({
  generateChat: vi.fn().mockResolvedValue({
    technical_score: 0.85,
    communication_score: 0.9,
    summary_text: 'Candidate demonstrated strong architecture and distributed systems depth.',
    strengths: ['Architecture', 'System Design'],
    concerns: [],
    recommended_next_step: 'Proceed to technical deep dive review',
  })
}));

describe('Step 4B5.4 — Hosted P0 End-to-End Workflow & Authorization Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('EMPLOYER ALPHA & BETA WORKFLOWS', () => {
    it('1. Employer Alpha authenticates and fetches candidate Trust Packet', async () => {
      createSupabaseServerClient.mockImplementation(async (req) => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'emp-alpha', email: 'alpha@org.com' } }, error: null }),
        },
        from: (table) => {
          const makeBuilder = () => ({
            select: () => makeBuilder(),
            eq: () => makeBuilder(),
            order: () => makeBuilder(),
            limit: () => makeBuilder(),
            single: async () => ({ data: { id: 'hr-1', org_id: 'org-alpha' }, error: null }),
            maybeSingle: async () => {
              if (table === 'candidates') {
                return {
                  data: {
                    id: '11111111-1111-4111-a111-111111111111',
                    candidate_id: 'cand-1',
                    hiring_runs: { id: 'hr-1', org_id: 'org-alpha', role_title: 'Backend Engineer' },
                    decision_packet: { why_matched: 'Strong fit' },
                  },
                  error: null,
                };
              }
              if (table === 'organization_memberships') {
                return { data: { membership_role: 'owner', membership_status: 'active' }, error: null };
              }
              return { data: null, error: null };
            },
          });
          return makeBuilder();
        },
      }));

      const badReq = createMockRequest({ method: 'GET', headers: { Authorization: 'Bearer token-alpha' } });
      const badRes = await getPacket(badReq, { params: Promise.resolve({ extractionId: 'ext-1' }) });
      expect(badRes.status).toBe(400);

      const req = createMockRequest({ method: 'GET', headers: { Authorization: 'Bearer token-alpha' } });
      const res = await getPacket(req, { params: Promise.resolve({ extractionId: '11111111-1111-4111-a111-111111111111' }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.packet.why_matched).toBe('Strong fit');
    });

    it('2. Employer Alpha generates packet (authorization runs BEFORE service role)', async () => {
      const mockNormText = 'Senior Backend Engineer with extensive experience in TypeScript, PostgreSQL, and distributed systems.';
      const mockSha256 = '63cf455202be526825f80a5e2976f006ea8810c4508f9d89391a2dec5ae46e16';

      createSupabaseServerClient.mockImplementation(async (req, useServiceRole = false) => {
        if (useServiceRole) {
          return {
            rpc: async (fn) => {
              if (fn === 'allocate_claim_ledger_revision_and_persist') {
                return {
                  data: [{
                    decision_packet: {
                      status: 'EVIDENCE READY',
                      evaluation_metrics: { decision_readiness: 'EVIDENCE READY', proof_strength: 0.9 },
                    },
                  }],
                  error: null,
                };
              }
              return { data: [], error: null };
            },
            from: () => ({
              update: () => ({
                eq: () => ({ select: () => ({ count: 1 }) }),
              }),
            }),
          };
        }
        return {
          auth: {
            getUser: async () => ({ data: { user: { id: 'emp-alpha', email: 'alpha@org.com' } }, error: null }),
          },
          from: (table) => {
            const makeBuilder = () => ({
              select: () => makeBuilder(),
              eq: () => makeBuilder(),
              order: () => makeBuilder(),
              limit: () => makeBuilder(),
              maybeSingle: async () => {
                if (table === 'candidates') {
                  return {
                    data: {
                      id: 'ext-1',
                      candidate_id: 'cand-1',
                      fit_score: 0.9,
                      hiring_runs: { id: 'hr-1', org_id: 'org-alpha', role_title: 'Backend Engineer', job_description: 'Job description for Senior Backend Engineer with TypeScript and PostgreSQL requirements.', must_haves: ['TypeScript', 'PostgreSQL'], brief_json: { contract_approved: true, approved_rubric_version: '1.0.0', approved_by: 'user-alpha', approved_at: '2026-10-04T12:00:00Z', rubric_version: '1.0.0' } },
                      candidate_profiles: { id: 'cand-1', name: 'Cand One', bio: 'Backend Dev', location: 'Remote', skills: ['TypeScript', 'PostgreSQL'] },
                    },
                    error: null,
                  };
                }
                if (table === 'organization_memberships') {
                  return { data: { membership_role: 'owner', membership_status: 'active' }, error: null };
                }
                if (table === 'candidate_documents') {
                  return {
                    data: {
                      id: 'doc-1',
                      candidate_id: 'cand-1',
                      org_id: 'org-alpha',
                      filename: 'resume.pdf',
                      mime_type: 'application/pdf',
                      normalized_text: mockNormText,
                      normalized_text_sha256: mockSha256,
                      file_sha256: 'mock-file-sha256',
                    },
                    error: null,
                  };
                }
                return { data: null, error: null };
              },
            });
            return makeBuilder();
          },
        };
      });

      const req = createMockRequest({ method: 'POST', headers: { Authorization: 'Bearer token-alpha' } });
      const res = await generatePacket(req, { params: Promise.resolve({ extractionId: 'ext-1' }) });
      expect(res.status).toBe(200);
    });

    it('3. Employer Alpha creates screening session via POST /api/employer/screening-sessions', async () => {
      createSupabaseServerClient.mockImplementation(async (req, useServiceRole = false) => {
        if (useServiceRole) {
          return {
            from: () => ({
              insert: (rows) => ({
                select: () => ({
                  single: async () => ({
                    data: {
                      id: 'sess-alpha-123',
                      candidate_id: rows[0].candidate_id,
                      hiring_run_id: rows[0].hiring_run_id,
                      status: 'not_started',
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
            getUser: async () => ({ data: { user: { id: 'emp-alpha', email: 'alpha@org.com' } }, error: null }),
          },
          from: (table) => {
            const makeBuilder = () => ({
              select: () => makeBuilder(),
              eq: () => makeBuilder(),
              order: () => makeBuilder(),
              limit: () => makeBuilder(),
              maybeSingle: async () => {
                if (table === 'hiring_runs') return { data: { id: 'hr-1', org_id: 'org-alpha' }, error: null };
                if (table === 'organization_memberships') return { data: { membership_role: 'owner', membership_status: 'active' }, error: null };
                if (table === 'candidates') return { data: { id: 'cand-rec-1', candidate_id: 'cand-1' }, error: null };
                return { data: null, error: null };
              },
            });
            return makeBuilder();
          },
        };
      });

      const req = createMockRequest({
        method: 'POST',
        headers: { Authorization: 'Bearer token-alpha' },
        body: { hiring_run_id: 'hr-1', candidate_id: 'cand-1' },
      });
      const res = await createScreeningSession(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.session_id).toBe('sess-alpha-123');
    });

    it('4. Employer Beta from different organization is DENIED access (403)', async () => {
      createSupabaseServerClient.mockImplementation(async (req) => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'emp-beta', email: 'beta@org.com' } }, error: null }),
        },
        from: (table) => {
          const makeBuilder = () => ({
            select: () => makeBuilder(),
            eq: () => makeBuilder(),
            order: () => makeBuilder(),
            limit: () => makeBuilder(),
            maybeSingle: async () => {
              if (table === 'candidates') return { data: { id: '11111111-1111-4111-a111-111111111111', hiring_runs: { org_id: 'org-alpha' } }, error: null };
              if (table === 'organization_memberships') return { data: null, error: null }; // Not a member of org-alpha
              return { data: null, error: null };
            },
          });
          return makeBuilder();
        },
      }));

      const req = createMockRequest({ method: 'GET', headers: { Authorization: 'Bearer token-beta' } });
      const res = await getPacket(req, { params: Promise.resolve({ extractionId: '11111111-1111-4111-a111-111111111111' }) });
      expect(res.status).toBe(403);
    });
  });

  describe('CANDIDATE ONE & TWO WORKFLOWS', () => {
    it('5. Candidate One reads own status and proof profile', async () => {
      createSupabaseServerClient.mockImplementation(async (req) => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'cand-1', email: 'cand1@test.com' } }, error: null }),
        },
        from: (table) => ({
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { id: 'cand-1', name: 'Candidate One' }, error: null }),
              maybeSingle: async () => ({ data: { candidate_id: 'cand-1', summary: 'Proof summary' }, error: null }),
            }),
          }),
        }),
      }));

      const reqStatus = createMockRequest({ method: 'GET', headers: { Authorization: 'Bearer token-cand-1' } });
      const resStatus = await getCandidateStatus(reqStatus, { params: Promise.resolve({ candidateId: 'cand-1' }) });
      expect(resStatus.status).toBe(200);

      const reqProof = createMockRequest({ method: 'GET', headers: { Authorization: 'Bearer token-cand-1' } });
      const resProof = await getProofProfile(reqProof, { params: Promise.resolve({ candidateId: 'cand-1' }) });
      expect(resProof.status).toBe(200);
    });

    it('6. Candidate One reads, starts, answers, and completes own screening session', async () => {
      createSupabaseServerClient.mockImplementation(async (req) => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'cand-1', email: 'cand1@test.com' } }, error: null }),
        },
        from: (table) => ({
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { id: 'sess-1', candidate_id: 'cand-1', candidate_profiles: { email: 'cand1@test.com' }, questions: [{ id: 'q1' }] }, error: null }),
              maybeSingle: async () => ({ data: { id: 'sess-1', candidate_id: 'cand-1', candidate_profiles: { email: 'cand1@test.com' }, questions: [{ id: 'q1' }] }, error: null }),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({ single: async () => ({ data: { id: 'sess-1', status: 'started' }, error: null }) }),
              then: (resolve) => resolve({ data: [{ id: 'sess-1', status: 'completed' }], error: null }),
            }),
          }),
          upsert: () => ({
            select: () => ({ single: async () => ({ data: { session_id: 'sess-1', question_id: 'q1' }, error: null }) }),
            then: (resolve) => resolve({ data: [{ id: 'summary-1' }], error: null }),
          }),
          insert: () => ({
            select: () => ({ single: async () => ({ data: { id: 'summary-1' }, error: null }) }),
            then: (resolve) => resolve({ data: [{ id: 'summary-1' }], error: null }),
          }),
        }),
        rpc: async (fn, params) => {
          if (fn === 'complete_screening_session_transactional') {
            return {
              data: {
                replayed: false,
                summary: {
                  overall_score: params.p_technical_score,
                  summary_text: params.p_summary_text,
                  technical_score: params.p_technical_score,
                  communication_score: params.p_communication_score,
                  strengths: params.p_strengths || [],
                  concerns: params.p_concerns || [],
                  recommended_next_step: params.p_recommended_next_step || null,
                },
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
      }));

      // GET
      const reqGet = createMockRequest({ method: 'GET', headers: { Authorization: 'Bearer token-cand-1' } });
      const resGet = await getScreeningSession(reqGet, { params: Promise.resolve({ sessionId: 'sess-1' }) });
      expect(resGet.status).toBe(200);

      // START
      const reqStart = createMockRequest({ method: 'POST', headers: { Authorization: 'Bearer token-cand-1' } });
      const resStart = await startScreening(reqStart, { params: Promise.resolve({ sessionId: 'sess-1' }) });
      expect(resStart.status).toBe(200);

      // ANSWER
      const reqAns = createMockRequest({ method: 'POST', headers: { Authorization: 'Bearer token-cand-1' }, body: { question_id: 'q1', answer_text: 'Ans' } });
      const resAns = await answerScreening(reqAns, { params: Promise.resolve({ sessionId: 'sess-1' }) });
      expect(resAns.status).toBe(200);

      // COMPLETE
      const reqComp = createMockRequest({ method: 'POST', headers: { Authorization: 'Bearer token-cand-1' } });
      const resComp = await completeScreening(reqComp, { params: Promise.resolve({ sessionId: 'sess-1' }) });
      expect(resComp.status).toBe(200);
    });

    it('7. Candidate Two attempting Candidate One session access is DENIED (403)', async () => {
      createSupabaseServerClient.mockImplementation(async (req) => ({
        auth: {
          getUser: async () => ({ data: { user: { id: 'cand-2', email: 'cand2@test.com' } }, error: null }),
        },
        from: (table) => ({
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { id: 'sess-1', candidate_id: 'cand-1', candidate_profiles: { email: 'cand1@test.com' } }, error: null }),
              maybeSingle: async () => ({ data: { id: 'sess-1', candidate_id: 'cand-1', candidate_profiles: { email: 'cand1@test.com' } }, error: null }),
            }),
          }),
        }),
      }));

      const reqGet = createMockRequest({ method: 'GET', headers: { Authorization: 'Bearer token-cand-2' } });
      const resGet = await getScreeningSession(reqGet, { params: Promise.resolve({ sessionId: 'sess-1' }) });
      expect(resGet.status).toBe(403);

      const reqStart = createMockRequest({ method: 'POST', headers: { Authorization: 'Bearer token-cand-2' } });
      const resStart = await startScreening(reqStart, { params: Promise.resolve({ sessionId: 'sess-1' }) });
      expect(resStart.status).toBe(403);
    });
  });

  describe('UNAUTHENTICATED ACCESS DENIAL', () => {
    it('8. Unauthenticated requests to P0 routes return 401 Unauthorized', async () => {
      createSupabaseServerClient.mockImplementation(async () => ({
        auth: { getUser: async () => ({ data: { user: null }, error: { message: 'Unauthenticated' } }) },
      }));

      const req1 = createMockRequest({ method: 'GET' });
      expect((await getCandidateStatus(req1, { params: Promise.resolve({ candidateId: 'c-1' }) })).status).toBe(401);

      const req2 = createMockRequest({ method: 'GET' });
      expect((await getPacket(req2, { params: Promise.resolve({ extractionId: 'ext-1' }) })).status).toBe(401);

      const req3 = createMockRequest({ method: 'POST', body: { hiring_run_id: 'hr-1', candidate_id: 'cand-1' } });
      expect((await createScreeningSession(req3)).status).toBe(401);
    });
  });
});
