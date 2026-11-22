import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/employer/research-qa/route';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';

vi.mock('@/lib/serverAuth', () => ({
  requireUser: vi.fn(),
  getVerifiedOrgMembership: vi.fn(),
}));

describe('Cross-Language Proxy Contract Unit Tests (Mocked Upstream Service)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_ENABLE_RESEARCH_QA = 'true';
    process.env.WORKBYLINE_ENGINE_URL = 'http://127.0.0.1:8011';
    process.env.WORKBYLINE_INTERNAL_SERVICE_KEY = 'test-secret-service-key-alpha';
    process.env.WORKBYLINE_ENGINE_MAPPINGS = JSON.stringify({
      org_alpha: {
        companyName: 'Acme Corp',
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
      user: { id: 'user-alpha-01', email: 'owner@acme.com' },
      supabase: mockSupabase,
    });

    getVerifiedOrgMembership.mockResolvedValue({
      membership_role: 'admin',
    });
  });

  function makeRequest(body) {
    return new Request('http://localhost:3004/api/employer/research-qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('1. Retrieval-only: Python response cleanly validates and passes through to browser', async () => {
    // Simulate exact Python FastAPI kernel.retrieve response
    const pythonPayload = {
      mode: 'retrieval_only',
      status: 'RETRIEVAL_ONLY_COMPLETE',
      answer: null,
      passages: [
        {
          span_id: 'span_python_01',
          source_id: 'src_doc_01',
          version_id: 'ver_doc_01',
          filename: 'system_architecture.txt',
          text: 'The distributed engine utilizes PostgreSQL with pgvector for scoped embeddings.',
          score: 8,
          employer_approval: 'NOT_OBTAINED',
        },
      ],
      coverage: { eligible_sources: 1, completed: 1, partial: 0, pending: 0, failed: 0 },
      retrieval_method: 'lexical-token-overlap-baseline',
      has_validation_errors: false,
      disclaimer: 'SOURCE MATERIAL / NOT EMPLOYER-APPROVED; retrieval does not verify competence',
      latency_ms: 42,
      execution_provenance: 'LOCAL_IN_MEMORY_FALLBACK',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => pythonPayload,
    });

    const req = makeRequest({
      hiring_run_id: 'run_alpha_01',
      question: 'PostgreSQL architecture',
      mode: 'retrieval_only',
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.mode).toBe('retrieval_only');
    expect(data.status).toBe('RETRIEVAL_ONLY_COMPLETE');
    expect(data.answer).toBeNull();
    expect(data.has_validation_errors).toBe(false);
    expect(data.passages).toHaveLength(1);
    expect(data.passages[0].span_id).toBe('span_python_01');
    expect(data.company_name).toBe('Acme Corp');
    expect(data.role_id).toBe('role_alpha_lead');
  });

  it('2. Grounded: Python QA flow response with valid citations passes through with boolean flag', async () => {
    // Simulate exact Python FastAPI LangGraph flow response
    const pythonPayload = {
      answer: 'The candidate has 5 years of Python engineering experience.',
      status: 'GROUNDED',
      citations: [
        {
          span_id: 'span_python_01',
          source_id: 'src_doc_01',
          version_id: 'ver_doc_01',
          quote: 'Candidate has 5 years of Python engineering experience.',
          filename: 'resume.txt',
        },
      ],
      has_validation_errors: false,
      claims: [
        {
          claim_id: 'claim_1_1',
          text: 'Candidate has 5 years of Python engineering experience',
          supporting_span_id: 'span_python_01',
          validation_outcome: 'SUPPORTED',
          validation_reason: 'Supported',
        },
      ],
      disclaimer: 'SOURCE MATERIAL / NOT EMPLOYER-APPROVED; citations do not establish competence',
      validation_scope: 'citation identity, exact quotation, and claim-support consistency; semantic entailment requires separate evaluation',
      latency_ms: 110,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => pythonPayload,
    });

    const req = makeRequest({
      hiring_run_id: 'run_alpha_01',
      question: 'What Python experience is documented?',
      mode: 'retrieval_augmented',
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.status).toBe('GROUNDED');
    expect(data.answer).toBe('The candidate has 5 years of Python engineering experience.');
    expect(data.has_validation_errors).toBe(false);
    expect(data.citations).toHaveLength(1);
    expect(data.citations[0].quote).toBe('Candidate has 5 years of Python engineering experience.');
  });

  it('3. Insufficient Evidence: Python flow with no evidence returns clean 200 without HTTP 502', async () => {
    // Exact response that previously caused HTTP 502 MALFORMED_VALIDATION_FLAG due to missing has_validation_errors
    const pythonPayload = {
      answer: 'Insufficient source evidence.',
      status: 'INSUFFICIENT_EVIDENCE',
      citations: [],
      has_validation_errors: false,
      claims: [],
      disclaimer: 'SOURCE MATERIAL / NOT EMPLOYER-APPROVED; citations do not establish competence',
      validation_scope: 'citation identity, exact quotation, and claim-support consistency; semantic entailment requires separate evaluation',
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => pythonPayload,
    });

    const req = makeRequest({
      hiring_run_id: 'run_alpha_01',
      question: 'What is the candidate clearance level?',
      mode: 'retrieval_augmented',
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(data.answer).toBe('Insufficient source evidence.');
    expect(data.has_validation_errors).toBe(false);
    expect(data.citations).toEqual([]);
  });

  it('4. Malformed Python response: missing has_validation_errors fails closed with 502 MALFORMED_VALIDATION_FLAG', async () => {
    const brokenPythonPayload = {
      answer: 'Candidate has skills.',
      status: 'GROUNDED',
      citations: [{ span_id: 's1', quote: 'skills' }],
      // Omitted has_validation_errors
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => brokenPythonPayload,
    });

    const req = makeRequest({
      hiring_run_id: 'run_alpha_01',
      question: 'Candidate skills?',
      mode: 'retrieval_augmented',
    });

    const res = await POST(req);
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.code).toBe('MALFORMED_VALIDATION_FLAG');
  });

  it('5. Malformed Python response: object answer fails closed with 502 INVALID_ANSWER_TYPE', async () => {
    const brokenPythonPayload = {
      answer: { nested: 'object value' },
      status: 'GROUNDED',
      citations: [{ span_id: 's1', quote: 'quote' }],
      has_validation_errors: false,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => brokenPythonPayload,
    });

    const req = makeRequest({
      hiring_run_id: 'run_alpha_01',
      question: 'Experience?',
      mode: 'retrieval_augmented',
    });

    const res = await POST(req);
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.code).toBe('INVALID_ANSWER_TYPE');
  });

  it('6. Unavailable Provider: Python 503 LIVE_GENERATION_UNAVAILABLE returns 503 BLOCKED_PENDING_KEY_ROTATION', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'LIVE_GENERATION_UNAVAILABLE' }),
    });

    const req = makeRequest({
      hiring_run_id: 'run_alpha_01',
      question: 'Summarize candidate background?',
      mode: 'retrieval_augmented',
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.code).toBe('BLOCKED_PENDING_KEY_ROTATION');
    expect(data.status).toBe('INSUFFICIENT_EVIDENCE');
  });
});
