import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/employer/research-qa/route';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import {
  resolveEngineContext,
  validateEngineConfig,
  generateDelegatedAuthorizationToken,
  verifyDelegatedAuthorizationToken,
  validateEngineResponse,
} from '@/lib/engineConfig';

vi.mock('@/lib/serverAuth', () => ({
  requireUser: vi.fn(),
  getVerifiedOrgMembership: vi.fn(),
}));

describe('/api/employer/research-qa API Route — Full Phase A Regression & Contract Suite', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_ENABLE_RESEARCH_QA = 'true';
    process.env.WORKBYLINE_ENGINE_URL = 'http://127.0.0.1:8000';
    process.env.WORKBYLINE_INTERNAL_SERVICE_KEY = 'test-secret-service-key-alpha';
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── 1. Feature Flag & Authentication ─────────────────────────────────────
  it('1. Rejects request with 403 when feature flag is disabled', async () => {
    process.env.NEXT_PUBLIC_ENABLE_RESEARCH_QA = 'false';
    delete process.env.ENABLE_RESEARCH_QA;

    const req = new Request('http://localhost:3000/api/employer/research-qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hiring_run_id: 'run_alpha_01', question: 'What is documented?' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe('RESEARCH_QA_DISABLED');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('2. Rejects request with 401 when user is unauthenticated', async () => {
    requireUser.mockResolvedValue({
      errorResponse: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
      user: null,
      supabase: null,
    });

    const req = new Request('http://localhost:3000/api/employer/research-qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hiring_run_id: 'run_alpha_01', question: 'What is documented?' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ── 2. Finding A1: Exact Tenant & Run Mapping ────────────────────────────
  it('3. Rejects request when hiring_run_id is missing (never defaults to memberships[0])', async () => {
    const mockSupabase = { from: vi.fn() };
    requireUser.mockResolvedValue({
      errorResponse: null,
      user: { id: 'user-1' },
      supabase: mockSupabase,
    });

    const req = new Request('http://localhost:3000/api/employer/research-qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'What is documented?' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('MISSING_HIRING_RUN');
    expect(mockSupabase.from).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('4. Two distinct organizations resolve to their distinct server-mapped workspaces and roles', async () => {
    // Org Alpha
    const ctxAlpha = resolveEngineContext('org_tenant_alpha', 'run_alpha_01');
    expect(ctxAlpha.ok).toBe(true);
    expect(ctxAlpha.workspaceId).toBe('ws_alpha_corp');
    expect(ctxAlpha.roleId).toBe('role_alpha_lead');
    expect(ctxAlpha.companyName).toBe('Alpha Corp');

    // Org Beta
    const ctxBeta = resolveEngineContext('org_tenant_beta', 'run_beta_01');
    expect(ctxBeta.ok).toBe(true);
    expect(ctxBeta.workspaceId).toBe('ws_beta_corp');
    expect(ctxBeta.roleId).toBe('role_beta_lead');
    expect(ctxBeta.companyName).toBe('Beta Corp');
  });

  it('5. Two distinct runs in the SAME organization resolve to distinct roles', async () => {
    const run1 = resolveEngineContext('org_tenant_alpha', 'run_alpha_01');
    expect(run1.ok).toBe(true);
    expect(run1.roleId).toBe('role_alpha_lead');

    const run2 = resolveEngineContext('org_tenant_alpha', 'run_alpha_02');
    expect(run2.ok).toBe(true);
    expect(run2.roleId).toBe('role_alpha_data');

    expect(run1.roleId).not.toBe(run2.roleId);
  });

  it('6. Unmapped hiring run causes zero upstream engine requests', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'run_unknown_999', org_id: 'org_tenant_alpha' },
          error: null,
        }),
      }),
    };

    requireUser.mockResolvedValue({
      errorResponse: null,
      user: { id: 'user-alpha' },
      supabase: mockSupabase,
    });
    getVerifiedOrgMembership.mockResolvedValue({
      membership_role: 'admin',
    });

    const req = new Request('http://localhost:3000/api/employer/research-qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hiring_run_id: 'run_unknown_999',
        question: 'What is documented for this unmapped run?',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe('UNMAPPED_WORKSPACE');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('7. Revoked or inactive mapping returns 403 MAPPING_REVOKED causing zero upstream calls', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'run_readily_revoked_03', org_id: 'org_pilot_readily' },
          error: null,
        }),
      }),
    };

    requireUser.mockResolvedValue({
      errorResponse: null,
      user: { id: 'user-readily' },
      supabase: mockSupabase,
    });
    getVerifiedOrgMembership.mockResolvedValue({
      membership_role: 'recruiter',
    });

    const req = new Request('http://localhost:3000/api/employer/research-qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hiring_run_id: 'run_readily_revoked_03',
        question: 'What is documented?',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe('MAPPING_REVOKED');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('8. Client-supplied conflicting role_id is rejected with 400 ROLE_CONTEXT_CONFLICT', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'run_alpha_01', org_id: 'org_tenant_alpha' },
          error: null,
        }),
      }),
    };

    requireUser.mockResolvedValue({
      errorResponse: null,
      user: { id: 'user-alpha' },
      supabase: mockSupabase,
    });
    getVerifiedOrgMembership.mockResolvedValue({
      membership_role: 'admin',
    });

    const req = new Request('http://localhost:3000/api/employer/research-qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hiring_run_id: 'run_alpha_01',
        role_id: 'forged_foreign_role',
        question: 'What is documented?',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('ROLE_CONTEXT_CONFLICT');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ── 3. Finding A2: Engine Delegated Authorization ────────────────────────
  it('9. Generates valid HMAC-SHA256 signed delegated authorization token', () => {
    const secret = 'test-secret-service-key-alpha';
    const token = generateDelegatedAuthorizationToken({
      actorId: 'user-123',
      actorEmail: 'test@alpha.corp',
      orgId: 'org_tenant_alpha',
      hiringRunId: 'run_alpha_01',
      workspaceId: 'ws_alpha_corp',
      roleId: 'role_alpha_lead',
      operation: 'research_qa',
      secretKey: secret,
      ttlSeconds: 300,
    });

    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);

    // Verify token validity
    const verified = verifyDelegatedAuthorizationToken(token, secret, {
      requiredWorkspace: 'ws_alpha_corp',
      requiredRole: 'role_alpha_lead',
      requiredOperation: 'research_qa',
    });

    expect(verified.ok).toBe(true);
    expect(verified.payload.actor_id).toBe('user-123');
    expect(verified.payload.org_id).toBe('org_tenant_alpha');
    expect(verified.payload.aud).toBe('workbyline-context-engine');

    // Foreign workspace verification must fail
    const foreignCheck = verifyDelegatedAuthorizationToken(token, secret, {
      requiredWorkspace: 'ws_beta_corp',
    });
    expect(foreignCheck.ok).toBe(false);
    expect(foreignCheck.code).toBe('WORKSPACE_MISMATCH');

    // Altered token verification must fail
    const alteredToken = token.slice(0, -4) + 'abcd';
    const alteredCheck = verifyDelegatedAuthorizationToken(alteredToken, secret);
    expect(alteredCheck.ok).toBe(false);
    expect(alteredCheck.code).toBe('SIGNATURE_MISMATCH');
  });

  // ── 4. Finding A3: Strict Limit & Boolean Contracts ───────────────────────
  it('10. Rejects invalid limit types (strings like "5junk", floats like 1.9, out of range)', async () => {
    const mockSupabase = { from: vi.fn() };
    requireUser.mockResolvedValue({
      errorResponse: null,
      user: { id: 'user-1' },
      supabase: mockSupabase,
    });

    // Test string limit "5junk"
    let req = new Request('http://localhost:3000/api/employer/research-qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hiring_run_id: 'run_alpha_01',
        question: 'What is documented?',
        limit: '5junk',
      }),
    });
    let res = await POST(req);
    expect(res.status).toBe(400);
    let data = await res.json();
    expect(data.code).toBe('INVALID_LIMIT');

    // Test float limit 1.9
    req = new Request('http://localhost:3000/api/employer/research-qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hiring_run_id: 'run_alpha_01',
        question: 'What is documented?',
        limit: 1.9,
      }),
    });
    res = await POST(req);
    expect(res.status).toBe(400);
    data = await res.json();
    expect(data.code).toBe('INVALID_LIMIT');
  });

  // ── 5. Finding A3: Grounding Contract & Abstention ────────────────────────
  it('11. Automatically downgrades GROUNDED to INSUFFICIENT_EVIDENCE and abstains if citations are empty', () => {
    const result = validateEngineResponse(
      {
        answer: 'Unverified claim about the candidate having lead infra experience.',
        status: 'GROUNDED',
        citations: [],
        has_validation_errors: false,
        latency_seconds: 0.125,
        execution_provenance: 'LIVE_LOCAL_RETRIEVAL',
      },
      'retrieval_augmented'
    );

    expect(result.ok).toBe(true);
    expect(result.data.status).toBe('INSUFFICIENT_EVIDENCE');
    // Never return unsupported original answer text as grounded!
    expect(result.data.answer).toContain('[Evidence Abstention');
    expect(result.data.answer).not.toContain('Unverified claim');
    expect(result.data.latency_ms).toBe(125);
  });

  it('12. Automatically downgrades GROUNDED if has_validation_errors is true', () => {
    const result = validateEngineResponse(
      {
        answer: 'Claim with validation failure.',
        status: 'GROUNDED',
        citations: [{ span_id: 'span-1', quote: 'Valid quote' }],
        has_validation_errors: true,
        latency_ms: 250,
      },
      'retrieval_augmented'
    );

    expect(result.ok).toBe(true);
    expect(result.data.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.data.answer).toContain('[Evidence Abstention');
  });

  it('13. Rejects upstream response with non-boolean has_validation_errors (e.g. string "false")', () => {
    const result = validateEngineResponse(
      {
        answer: 'Answer text',
        status: 'GROUNDED',
        citations: [{ span_id: 'span-1', quote: 'Quote' }],
        has_validation_errors: 'false', // string boolean must be rejected
      },
      'retrieval_augmented'
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe(502);
    expect(result.code).toBe('MALFORMED_VALIDATION_FLAG');
  });

  // ── 6. Finding A3: Discriminated Mode retrieval_only ──────────────────────
  it('14. Mode retrieval_only succeeds with RETRIEVAL_ONLY_COMPLETE without requiring answer text', () => {
    const result = validateEngineResponse(
      {
        status: 'RETRIEVAL_ONLY_COMPLETE',
        latency_seconds: 0.045,
        passages: [
          {
            span_id: 'span_01',
            document_id: 'doc_1',
            text: 'Kubernetes cluster administration and Terraform automation.',
            filename: 'infra_lead_brief.md',
            score: 0.942,
          },
        ],
        execution_provenance: 'LIVE_LOCAL_RETRIEVAL',
      },
      'retrieval_only'
    );

    expect(result.ok).toBe(true);
    expect(result.data.mode).toBe('retrieval_only');
    expect(result.data.status).toBe('RETRIEVAL_ONLY_COMPLETE');
    expect(result.data.answer).toBeNull();
    expect(result.data.passages.length).toBe(1);
    expect(result.data.passages[0].span_id).toBe('span_01');
    expect(result.data.latency_ms).toBe(45);
  });

  // ── 7. Finding A2: Fail-Closed Configuration ─────────────────────────────
  it('15. Missing or whitespace-only configuration fails closed before network dispatch', async () => {
    process.env.WORKBYLINE_ENGINE_URL = '   ';

    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'run_alpha_01', org_id: 'org_tenant_alpha' },
          error: null,
        }),
      }),
    };

    requireUser.mockResolvedValue({
      errorResponse: null,
      user: { id: 'user-alpha' },
      supabase: mockSupabase,
    });
    getVerifiedOrgMembership.mockResolvedValue({ membership_role: 'admin' });

    const req = new Request('http://localhost:3000/api/employer/research-qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hiring_run_id: 'run_alpha_01', question: 'What is documented?' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.code).toBe('ENGINE_CONFIG_MISSING');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // ── 8. Finding A2: Blocked Provider Returns Safe 503 ─────────────────────
  it('16. Unconfigured provider key returns 503 BLOCKED_PENDING_KEY_ROTATION without fabricated answers', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'run_alpha_01', org_id: 'org_tenant_alpha' },
          error: null,
        }),
      }),
    };

    requireUser.mockResolvedValue({
      errorResponse: null,
      user: { id: 'user-alpha' },
      supabase: mockSupabase,
    });
    getVerifiedOrgMembership.mockResolvedValue({ membership_role: 'admin' });

    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        detail: 'GEMINI_API_KEY environment variable is not set',
      }),
    });

    const req = new Request('http://localhost:3000/api/employer/research-qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hiring_run_id: 'run_alpha_01', question: 'What is documented?' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.code).toBe('BLOCKED_PENDING_KEY_ROTATION');
    expect(data.answer).toBeUndefined();
    expect(data.citations).toEqual([]);
  });
});
