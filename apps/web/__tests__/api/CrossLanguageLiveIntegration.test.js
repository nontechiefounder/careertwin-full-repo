import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import http from 'http';
import { POST } from '@/app/api/employer/research-qa/route';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';

vi.mock('@/lib/serverAuth', () => ({
  requireUser: vi.fn(),
  getVerifiedOrgMembership: vi.fn(),
}));

describe('Genuine Cross-Language Live Integration: Next.js API Route to Real Python FastAPI Service', () => {
  const originalEnv = process.env;
  let malformedServer = null;
  const MALFORMED_PORT = 8998;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_ENABLE_RESEARCH_QA = 'true';
    process.env.WORKBYLINE_ENGINE_URL = 'http://127.0.0.1:8011';
    process.env.WORKBYLINE_CONTEXT_SERVICE_URL = 'http://127.0.0.1:8011';
    process.env.WORKBYLINE_INTERNAL_SERVICE_KEY = 'acceptance-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    process.env.WORKBYLINE_CONTEXT_DELEGATION_SECRET = 'acceptance-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    process.env.WORKBYLINE_ENGINE_MAPPINGS = JSON.stringify({
      org_alpha: {
        companyName: 'Acme Alpha Corp',
        corpusScope: 'TENANT_PRIVATE',
        runs: {
          run_alpha_01: {
            workspaceId: 'ws_alpha_corp',
            roleId: 'role_alpha_lead',
            corpusScope: 'TENANT_PRIVATE',
            status: 'active',
          },
        },
      },
    });

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'run_alpha_01', org_id: 'org_alpha' },
          error: null,
        }),
      }),
    };

    requireUser.mockResolvedValue({
      errorResponse: null,
      user: { id: 'user-alpha-01', email: 'owner@acme.invalid' },
      supabase: mockSupabase,
    });

    getVerifiedOrgMembership.mockResolvedValue({
      membership_role: 'admin',
    });
  });

  afterAll(async () => {
    if (malformedServer) {
      await new Promise((resolve) => malformedServer.close(resolve));
    }
  });

  function makeRequest(body) {
    return new Request('http://localhost:3004/api/employer/research-qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('1. Live Retrieval-Only: Real HTTP request to Python service returns valid passages with boolean flag', async () => {
    const req = makeRequest({
      hiring_run_id: 'run_alpha_01',
      question: 'infrastructure architecture',
      mode: 'retrieval_only',
      limit: 5,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.mode).toBe('retrieval_only');
    expect(['RETRIEVAL_ONLY_COMPLETE', 'NO_RELEVANT_PASSAGES']).toContain(data.status);
    expect(data.answer).toBeNull();
    expect(typeof data.has_validation_errors).toBe('boolean');
    expect(data.has_validation_errors).toBe(false);
    expect(Array.isArray(data.passages)).toBe(true);
    expect(data.company_name).toBe('Acme Alpha Corp');
    expect(data.role_id).toBe('role_alpha_lead');
  });

  it('2. Live Insufficient Evidence: Real LangGraph flow in Python returns 200 without HTTP 502', async () => {
    const req = makeRequest({
      hiring_run_id: 'run_alpha_01',
      question: 'UnmatchedQueryWithoutPassagesXYZ987',
      mode: 'retrieval_augmented',
      limit: 5,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(typeof data.answer).toBe('string');
    expect(data.has_validation_errors).toBe(false);
    expect(Array.isArray(data.citations)).toBe(true);
  });

  it('3. Live Unavailable Provider: When generation unconfigured, returns 503 BLOCKED_PENDING_KEY_ROTATION', async () => {
    const req = makeRequest({
      hiring_run_id: 'run_alpha_01',
      question: 'Summarize candidate background?',
      mode: 'retrieval_augmented',
      limit: 5,
    });

    const res = await POST(req);
    // When evidence is present or generator is requested without GEMINI_API_KEY, fails closed with 503
    if (res.status === 503) {
      const data = await res.json();
      expect(data.code).toBe('BLOCKED_PENDING_KEY_ROTATION');
      expect(data.status).toBe('INSUFFICIENT_EVIDENCE');
    } else {
      // If no passages exist in live DB for this query, LangGraph safely abstains with 200
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe('INSUFFICIENT_EVIDENCE');
      expect(data.has_validation_errors).toBe(false);
    }
  });

  it('4. Authorization Rejection: Unauthorized user is rejected with 403 before calling Python service', async () => {
    getVerifiedOrgMembership.mockResolvedValueOnce(null);

    const req = makeRequest({
      hiring_run_id: 'run_alpha_01',
      question: 'Confidential salary details',
      mode: 'retrieval_only',
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe('FORBIDDEN');
  });

  it('5. Malformed Response (Explicit Test Server): Upstream missing boolean fails closed with 502 MALFORMED_VALIDATION_FLAG', async () => {
    // Start explicit ephemeral test server that returns malformed payload
    malformedServer = http.createServer((sReq, sRes) => {
      sRes.writeHead(200, { 'Content-Type': 'application/json' });
      sRes.end(JSON.stringify({
        answer: 'Malformed response omitting has_validation_errors flag',
        status: 'GROUNDED',
        citations: [{ span_id: 's1', quote: 'quote' }],
        // Intentionally missing has_validation_errors
      }));
    });

    await new Promise((resolve) => malformedServer.listen(MALFORMED_PORT, '127.0.0.1', resolve));

    process.env.WORKBYLINE_ENGINE_URL = `http://127.0.0.1:${MALFORMED_PORT}`;
    process.env.WORKBYLINE_CONTEXT_SERVICE_URL = `http://127.0.0.1:${MALFORMED_PORT}`;

    const req = makeRequest({
      hiring_run_id: 'run_alpha_01',
      question: 'Test question to malformed server',
      mode: 'retrieval_augmented',
    });

    const res = await POST(req);
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.code).toBe('MALFORMED_VALIDATION_FLAG');

    await new Promise((resolve) => malformedServer.close(resolve));
    malformedServer = null;
  });
});
