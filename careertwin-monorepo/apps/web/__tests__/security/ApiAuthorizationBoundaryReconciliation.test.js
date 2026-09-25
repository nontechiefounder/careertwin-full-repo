import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockRequest, resetHarnessSpies } from './apiAuthorizationTestHarness';

// Import P0 handlers directly
import { GET as getScreeningSession } from '@/app/api/candidate/screening-sessions/[sessionId]/route';
import { POST as startScreening } from '@/app/api/candidate/screening-sessions/[sessionId]/start/route';
import { POST as answerScreening } from '@/app/api/candidate/screening-sessions/[sessionId]/answer/route';
import { POST as completeScreening } from '@/app/api/candidate/screening-sessions/[sessionId]/complete/route';
import { GET as getCandidateStatus } from '@/app/api/candidate/status/[candidateId]/route';
import { GET as getProofProfile } from '@/app/api/candidate/proof-profile/[candidateId]/route';
import { POST as generateProofProfile } from '@/app/api/candidate/proof-profile/[candidateId]/generate/route';
import { POST as generatePacket } from '@/app/api/employer/packets/[extractionId]/generate/route';

import { GET as getEmployerAnalytics } from '@/app/api/employer/analytics/route';
import { GET as getEmployerBrief } from '@/app/api/employer/brief/[id]/route';
import { POST as suggestHiringRuns } from '@/app/api/employer/hiring-runs/suggest/route';
import { GET as getShortlist } from '@/app/api/employer/shortlist/[roleId]/route';
import { GET as getSearch } from '@/app/api/search/route';

import { createSupabaseServerClient } from '@/lib/supabaseServer';

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe('API Authorization Boundary Reconciliation Tests (Step 4B5.3-B Hardened Baseline)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarnessSpies();

    // Pure unauthenticated server client mock (returns error for getUser)
    createSupabaseServerClient.mockImplementation(async (req) => ({
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: { message: 'Auth session missing!' },
        }),
      },
      from: (table) => {
        const makeBuilder = () => ({
          select: () => makeBuilder(),
          eq: () => makeBuilder(),
          or: () => makeBuilder(),
          ilike: () => makeBuilder(),
          order: () => makeBuilder(),
          limit: () => makeBuilder(),
          single: async () => ({ data: null, error: { message: 'Database unauthenticated' } }),
          maybeSingle: async () => ({ data: null, error: { message: 'Database unauthenticated' } }),
          insert: () => makeBuilder(),
          update: () => makeBuilder(),
          upsert: () => makeBuilder(),
          then: (resolve) => resolve({ data: [], error: { message: 'Database unauthenticated' } }),
        });
        return makeBuilder();
      },
    }));
  });

  describe('PART 4 — Hardened P0 Route Handler Empirical Verification', () => {
    it('1. Candidate screening handlers check getUser and return 401 when unauthenticated', async () => {
      const reqGet = createMockRequest({ method: 'GET' });
      const resGet = await getScreeningSession(reqGet, { params: Promise.resolve({ sessionId: 'sess-1' }) });
      expect(resGet.status).toBe(401);

      const reqStart = createMockRequest({ method: 'POST' });
      const resStart = await startScreening(reqStart, { params: Promise.resolve({ sessionId: 'sess-1' }) });
      expect(resStart.status).toBe(401);

      const reqAns = createMockRequest({ method: 'POST', body: { question_id: 'q1', answer_text: 'ans' } });
      const resAns = await answerScreening(reqAns, { params: Promise.resolve({ sessionId: 'sess-1' }) });
      expect(resAns.status).toBe(401);
    });

    it('2. Candidate profile, status, and packet generation handlers check getUser and return 401 when unauthenticated', async () => {
      const reqStatus = createMockRequest({ method: 'GET' });
      const resStatus = await getCandidateStatus(reqStatus, { params: Promise.resolve({ candidateId: 'cand-1' }) });
      expect(resStatus.status).toBe(401);

      const reqProof = createMockRequest({ method: 'GET' });
      const resProof = await getProofProfile(reqProof, { params: Promise.resolve({ candidateId: 'cand-1' }) });
      expect(resProof.status).toBe(401);

      const reqPacketGen = createMockRequest({ method: 'POST' });
      const resPacketGen = await generatePacket(reqPacketGen, { params: Promise.resolve({ extractionId: 'ext-1' }) });
      expect(resPacketGen.status).toBe(401);
    });

    it('3. Employer analytics, brief, suggest, shortlist, and search check getUser and return 401 when unauthenticated', async () => {
      const reqAnalytics = createMockRequest({ method: 'GET' });
      const resAnalytics = await getEmployerAnalytics(reqAnalytics);
      expect(resAnalytics.status).toBe(401);

      const reqBrief = createMockRequest({ method: 'GET' });
      const resBrief = await getEmployerBrief(reqBrief, { params: Promise.resolve({ id: 'b-1' }) });
      expect(resBrief.status).toBe(401);

      const reqSuggest = createMockRequest({ method: 'POST', body: { role_title: 'Engineer' } });
      const resSuggest = await suggestHiringRuns(reqSuggest);
      expect(resSuggest.status).toBe(401);

      const reqShortlist = createMockRequest({ method: 'GET' });
      const resShortlist = await getShortlist(reqShortlist, { params: Promise.resolve({ roleId: 'r-1' }) });
      expect(resShortlist.status).toBe(401);

      const reqSearch = createMockRequest({ method: 'GET', url: 'http://localhost:3100/api/search?q=test' });
      const resSearch = await getSearch(reqSearch);
      expect(resSearch.status).toBe(401);
    });
  });
});
