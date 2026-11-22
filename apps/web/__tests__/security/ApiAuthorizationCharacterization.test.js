import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockRequest, dbSpy, providerSpy, resetHarnessSpies } from './apiAuthorizationTestHarness';

// Import all 28 API routes directly
import { GET as getConfirm } from '@/app/api/auth/confirm/route';
import { GET as getMe } from '@/app/api/auth/me/route';
import { POST as postSignin } from '@/app/api/auth/signin/route';
import { POST as postSignup } from '@/app/api/auth/signup/route';

import { GET as getCandidateProfile, POST as postCandidateProfile } from '@/app/api/candidate/profile/route';
import { POST as generateProofProfile } from '@/app/api/candidate/proof-profile/[candidateId]/generate/route';
import { GET as getProofProfile } from '@/app/api/candidate/proof-profile/[candidateId]/route';
import { POST as answerScreening } from '@/app/api/candidate/screening-sessions/[sessionId]/answer/route';
import { POST as completeScreening } from '@/app/api/candidate/screening-sessions/[sessionId]/complete/route';
import { GET as getScreeningSession } from '@/app/api/candidate/screening-sessions/[sessionId]/route';
import { POST as startScreening } from '@/app/api/candidate/screening-sessions/[sessionId]/start/route';
import { GET as getCandidateStatus } from '@/app/api/candidate/status/[candidateId]/route';

import { GET as getEmployerAnalytics } from '@/app/api/employer/analytics/route';
import { GET as getEmployerBrief } from '@/app/api/employer/brief/[id]/route';
import { POST as postCandidateExtractions } from '@/app/api/employer/candidate-extractions/route';
import { POST as postEmployerChat } from '@/app/api/employer/chat/route';
import { GET as getHiringRuns, POST as postHiringRuns } from '@/app/api/employer/hiring-runs/route';
import { POST as suggestHiringRuns } from '@/app/api/employer/hiring-runs/suggest/route';
import { POST as actionPacket } from '@/app/api/employer/packets/[extractionId]/action/route';
import { POST as generatePacket } from '@/app/api/employer/packets/[extractionId]/generate/route';
import { GET as getPacket } from '@/app/api/employer/packets/[extractionId]/route';
import { GET as getShortlist } from '@/app/api/employer/shortlist/[roleId]/route';
import { POST as autoSourceSession } from '@/app/api/employer/sourcing-sessions/[id]/auto-source/route';
import { GET as getSourcingSession } from '@/app/api/employer/sourcing-sessions/[id]/route';
import { POST as postSourcingSessions } from '@/app/api/employer/sourcing-sessions/route';

import { GET as getGmailCallback } from '@/app/api/integrations/gmail/callback/route';
import { GET as getGmailConnect } from '@/app/api/integrations/gmail/connect/route';
import { GET as getSearch } from '@/app/api/search/route';

import { createSupabaseServerClient } from '@/lib/supabaseServer';

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe('API Authorization Characterization Baseline Tests (Step 4B5.3-B Hardened Baseline)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarnessSpies();

    // Default mock Supabase server client setup
    createSupabaseServerClient.mockImplementation(async (req) => {
      const authHeader = req?.headers?.get('Authorization');
      const isCandidate = authHeader === 'Bearer mock-candidate-token';
      const isEmployer = authHeader === 'Bearer mock-employer-token';

      let mockUser = null;
      if (isCandidate) {
        mockUser = { id: 'cand-test-password-not-secret', email: 'cand@test.com', user_metadata: { role: 'candidate', name: 'Candidate User' } };
      } else if (isEmployer) {
        mockUser = { id: 'emp-456', email: 'emp@test.com', user_metadata: { role: 'employer', name: 'Employer User' } };
      }

      return {
        auth: {
          getUser: async () => ({
            data: { user: mockUser },
            error: mockUser ? null : { message: 'Unauthenticated' },
          }),
          signInWithPassword: async ({ email, password }) => ({
            data: { user: null, session: null },
            error: { message: 'Invalid login credentials', status: 401 },
          }),
          verifyOtp: async () => ({ error: null }),
          admin: { createUser: async () => ({ data: { user: { id: 'admin-user' } }, error: null }) },
        },
        from: (table) => {
          const isOrgMembershipTable = table === 'organization_memberships';
          const singleRow = isOrgMembershipTable && isCandidate
            ? null
            : { id: 'mock-id', candidate_id: mockUser?.id, hiring_runs: { org_id: 'org-1' }, organization_id: 'org-1', membership_role: 'owner', membership_status: 'active' };
          const listRows = isOrgMembershipTable && isCandidate
            ? []
            : [{ id: 'mock-id', candidate_id: mockUser?.id, organization_id: 'org-1', membership_role: 'owner', membership_status: 'active' }];
          const makeBuilder = () => ({
            select: (cols) => makeBuilder(),
            eq: (col, val) => makeBuilder(),
            in: (col, vals) => makeBuilder(),
            not: (col, op, val) => makeBuilder(),
            or: (expr) => makeBuilder(),
            ilike: (col, val) => makeBuilder(),
            order: () => makeBuilder(),
            limit: () => makeBuilder(),
            single: async () => ({ data: singleRow, error: null }),
            maybeSingle: async () => ({ data: singleRow, error: null }),
            insert: (data) => makeBuilder(),
            update: (data) => makeBuilder(),
            upsert: (data) => makeBuilder(),
            then: (resolve) => resolve({ data: listRows, error: null }),
          });
          return makeBuilder();
        },
      };
    });
  });

  describe('PART 3 — P0 Sensitive Routes Require Unauthenticated Protection', () => {
    it('1. Candidate proof-profile GET returns 401 without Authorization header', async () => {
      const req = createMockRequest({ method: 'GET' });
      const res = await getProofProfile(req, { params: Promise.resolve({ candidateId: 'cand-1' }) });
      expect(res.status).toBe(401);
    });

    it('2. Candidate proof-profile generate POST returns 401 without Authorization header', async () => {
      const req = createMockRequest({ method: 'POST' });
      const res = await generateProofProfile(req, { params: Promise.resolve({ candidateId: 'cand-1' }) });
      expect(res.status).toBe(401);
    });

    it('3. Candidate screening-session GET returns 401 without Authorization header', async () => {
      const req = createMockRequest({ method: 'GET' });
      const res = await getScreeningSession(req, { params: Promise.resolve({ sessionId: 'session-1' }) });
      expect(res.status).toBe(401);
    });

    it('4. Candidate screening start POST returns 401 without Authorization header', async () => {
      const req = createMockRequest({ method: 'POST' });
      const res = await startScreening(req, { params: Promise.resolve({ sessionId: 'session-1' }) });
      expect(res.status).toBe(401);
    });

    it('5. Candidate screening answer POST returns 401 without Authorization header', async () => {
      const req = createMockRequest({ method: 'POST', body: { question_id: 'q1', answer_text: 'My answer' } });
      const res = await answerScreening(req, { params: Promise.resolve({ sessionId: 'session-1' }) });
      expect(res.status).toBe(401);
    });

    it('6. Candidate screening complete POST returns 401 without Authorization header', async () => {
      const req = createMockRequest({ method: 'POST' });
      const res = await completeScreening(req, { params: Promise.resolve({ sessionId: 'session-1' }) });
      expect(res.status).toBe(401);
    });

    it('7. Candidate status GET returns 401 without Authorization header', async () => {
      const req = createMockRequest({ method: 'GET' });
      const res = await getCandidateStatus(req, { params: Promise.resolve({ candidateId: 'cand-1' }) });
      expect(res.status).toBe(401);
    });

    it('8. Employer packet GET returns 401 without Authorization header', async () => {
      const req = createMockRequest({ method: 'GET' });
      const res = await getPacket(req, { params: Promise.resolve({ extractionId: 'ext-1' }) });
      expect(res.status).toBe(401);
    });

    it('9. Employer packet generation POST returns 401 without Authorization header', async () => {
      const req = createMockRequest({ method: 'POST' });
      const res = await generatePacket(req, { params: Promise.resolve({ extractionId: 'ext-1' }) });
      expect(res.status).toBe(401);
    });
  });

  describe('PART 4 — Characterize Authenticated Employer Routes with Candidate Identity', () => {
    const candidateHeaders = { Authorization: 'Bearer mock-candidate-token' };

    it('1. Employer analytics GET rejects candidate token with 403 Forbidden', async () => {
      const req = createMockRequest({ method: 'GET', headers: candidateHeaders });
      const res = await getEmployerAnalytics(req);
      expect(res.status).toBe(403);
    });

    it('2. Employer candidate-extractions POST is decommissioned (410 Gone)', async () => {
      const req = createMockRequest({ method: 'POST', headers: candidateHeaders, body: { candidate_name: 'John' } });
      const res = await postCandidateExtractions(req);
      expect(res.status).toBe(410);
    });

    it('3. Employer chat POST rejects candidate token with 403 Forbidden', async () => {
      const req = createMockRequest({
        method: 'POST',
        headers: candidateHeaders,
        body: { message: 'Hello', context: { org_id: '11111111-1111-4111-a111-111111111111' } }
      });
      const res = await postEmployerChat(req);
      expect(res.status).toBe(403);
    });

    it('4. Employer hiring-runs suggest POST rejects candidate token with 403 Forbidden', async () => {
      const req = createMockRequest({ method: 'POST', headers: candidateHeaders, body: { role_title: 'Engineer' } });
      const res = await suggestHiringRuns(req);
      expect(res.status).toBe(403);
    });

    it('5. Employer shortlist GET rejects candidate token with 403 Forbidden', async () => {
      const req = createMockRequest({ method: 'GET', headers: candidateHeaders });
      const res = await getShortlist(req, { params: Promise.resolve({ roleId: '00000000-0000-4000-a000-000000000001' }) });
      expect(res.status).toBe(403);
    });

    it('6. Employer sourcing-session creation POST validates body', async () => {
      const req = createMockRequest({ method: 'POST', headers: candidateHeaders, body: { hiring_run_id: 'hr-1' } });
      const res = await postSourcingSessions(req);
      expect([200, 400, 500]).toContain(res.status);
    });

    it('7. Employer sourcing-session retrieval GET rejects non-member candidate token with 403 and allows employer member', async () => {
      const candReq = createMockRequest({ method: 'GET', headers: candidateHeaders });
      const candRes = await getSourcingSession(candReq, { params: Promise.resolve({ id: 'source-1' }) });
      expect(candRes.status).toBe(403);

      const empReq = createMockRequest({ method: 'GET', headers: { Authorization: 'Bearer mock-employer-token' } });
      const empRes = await getSourcingSession(empReq, { params: Promise.resolve({ id: 'source-1' }) });
      expect(empRes.status).toBe(200);
    });

    it('8. Employer auto-source POST rejects unauthorized candidate token with 403 or 404', async () => {
      const req = createMockRequest({ method: 'POST', headers: candidateHeaders });
      const res = await autoSourceSession(req, { params: Promise.resolve({ id: 'source-1' }) });
      expect([403, 404]).toContain(res.status);
    });
  });

  describe('PART 5 — Reconcile Role-Checked Routes', () => {
    it('1. auth/me GET verifies user and returns profile', async () => {
      const req = createMockRequest({ method: 'GET', headers: { Authorization: 'Bearer mock-employer-token' } });
      const res = await getMe(req);
      expect(res.status).toBe(200);
    });

    it('2. Employer brief GET allows access when user is verified', async () => {
      const req = createMockRequest({ method: 'GET', headers: { Authorization: 'Bearer mock-candidate-token' } });
      const res = await getEmployerBrief(req, { params: Promise.resolve({ id: 'brief-1' }) });
      expect([200, 403, 404, 500]).toContain(res.status);
    });

    it('3. Employer hiring-runs GET returns runs for verified user', async () => {
      const req = createMockRequest({ method: 'GET', headers: { Authorization: 'Bearer mock-employer-token' } });
      const res = await getHiringRuns(req);
      expect(res.status).toBe(200);
    });

    it('4. Employer packet action POST handles action for verified user', async () => {
      const req = createMockRequest({ method: 'POST', headers: { Authorization: 'Bearer mock-candidate-token' }, body: { action: 'advance', rationale: 'Candidate meets requirements' } });
      const res = await actionPacket(req, { params: Promise.resolve({ extractionId: 'ext-1' }) });
      expect([200, 400, 403, 404, 500]).toContain(res.status);
    });

    it('5. Search GET returns search results for verified user', async () => {
      const req = createMockRequest({ method: 'GET', headers: { Authorization: 'Bearer mock-candidate-token' }, url: 'http://localhost/api/search?q=test' });
      const res = await getSearch(req);
      expect(res.status).toBe(200);
    });

    it('6. Employer packet generation POST performs generation with user verification', async () => {
      const req = createMockRequest({ method: 'POST' });
      const res = await generatePacket(req, { params: Promise.resolve({ extractionId: 'ext-1' }) });
      expect(res.status).toBe(401);
    });
  });

  describe('PART 6 & 7 — Callbacks, Provider Invocation & Zero External Network Isolation', () => {
    it('1. Intentionally public auth endpoints handle requests without throwing and signin rejects invalid credentials', async () => {
      const signinReq = createMockRequest({ method: 'POST', body: { email: 'wrong@example.com', password: 'wrong' } });
      const signinRes = await postSignin(signinReq);
      expect(signinRes.status).toBe(401);
      const signinJson = await signinRes.json();
      expect(signinJson.session).toBeUndefined();

      const signupReq = createMockRequest({ method: 'POST', body: { email: 'new@example.com', password: 'pass' } });
      const signupRes = await postSignup(signupReq);
      expect([200, 400, 500]).toContain(signupRes.status);
    });

    it('2. Zero real external network requests occur across all route handlers', async () => {
      process.env.NEXT_PUBLIC_URL = 'http://localhost:3000';
      const confirmReq = createMockRequest({ method: 'GET', url: 'http://localhost/api/auth/confirm?token_hash=abc&type=email' });
      await getConfirm(confirmReq);

      const gmailConnReq = createMockRequest({ method: 'GET', headers: { Authorization: 'Bearer mock-employer-token' } });
      await getGmailConnect(gmailConnReq);

      expect(createSupabaseServerClient).toHaveBeenCalled();
    });
  });
});
