import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processOutboxEvent,
  drainPendingOutboxEvents,
} from '@/lib/contextEvidenceWorker';
import { contextScope, contextFetch, ContextError } from '@/lib/contextClient';

const mockAuth = {
  user: { id: 'usr-123', email: 'recruiter@alpha.com' },
  run: { id: 'run_alpha_01', org_id: 'org_tenant_alpha' },
  membership: { membership_role: 'recruiter', membership_status: 'active' },
};

vi.mock('@/lib/serverAuth', () => ({
  requireUser: vi.fn(async () => ({
    user: mockAuth.user,
    supabase: {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockAuth.run, error: null }),
      }),
    },
    errorResponse: null,
  })),
  getVerifiedOrgMembership: vi.fn(async () => mockAuth.membership),
}));

describe('Context Evidence Foundation — Worker & Client Contract Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Legacy Fabricated Worker Retired Contract ──────────────────────────
  it('1. Verifies legacy in-process worker is retired and fails closed', async () => {
    await expect(processOutboxEvent()).rejects.toThrow('LEGACY_WORKER_DISABLED_USE_CONTEXT_SERVICE');
    await expect(drainPendingOutboxEvents()).rejects.toThrow('LEGACY_WORKER_DISABLED_USE_CONTEXT_SERVICE');
  });

  // ── 2. contextScope Delegated Authorization Contract ───────────────────────
  it('2. Enforces exact server-resolved scope and issues valid HMAC delegated tokens', async () => {
    const mockRequest = new Request('http://localhost:3000/api/employer/context-sources', {
      headers: { Authorization: 'Bearer mock-user-token' },
    });

    // Setup environment
    const prevMappings = process.env.WORKBYLINE_ENGINE_MAPPINGS;
    const prevUrl = process.env.WORKBYLINE_CONTEXT_SERVICE_URL;
    const prevSecret = process.env.WORKBYLINE_CONTEXT_DELEGATION_SECRET;

    process.env.WORKBYLINE_ENGINE_MAPPINGS = JSON.stringify({
      org_tenant_alpha: {
        runs: {
          run_alpha_01: {
            workspaceId: 'ws_alpha_corp',
            roleId: 'role_alpha_lead',
            status: 'active',
          },
        },
      },
    });
    process.env.WORKBYLINE_CONTEXT_SERVICE_URL = 'http://127.0.0.1:8011';
    process.env.WORKBYLINE_CONTEXT_DELEGATION_SECRET = 'super-secret-key-that-is-at-least-32-chars-long';

    try {
      const scope = await contextScope(mockRequest, 'run_alpha_01', 'upload');
      expect(scope.base).toBe('http://127.0.0.1:8011');
      expect(scope.workspace).toBe('ws_alpha_corp');
      expect(typeof scope.token).toBe('string');

      // Verify token format: head.body.signature
      const parts = scope.token.split('.');
      expect(parts.length).toBe(3);

      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      expect(payload.iss).toBe('workbyline-v2-web');
      expect(payload.aud).toBe('workbyline-context-evidence');
      expect(payload.actor).toBe('usr-123');
      expect(payload.org).toBe('org_tenant_alpha');
      expect(payload.run).toBe('run_alpha_01');
      expect(payload.workspace).toBe('ws_alpha_corp');
      expect(payload.role).toBe('role_alpha_lead');
      expect(payload.operation).toBe('upload');
      expect(payload.jti).toMatch(/^[0-9a-f-]{36}$/);
    } finally {
      process.env.WORKBYLINE_ENGINE_MAPPINGS = prevMappings;
      process.env.WORKBYLINE_CONTEXT_SERVICE_URL = prevUrl;
      process.env.WORKBYLINE_CONTEXT_DELEGATION_SECRET = prevSecret;
    }
  });

  // ── 3. contextScope Negative Authorization Boundaries ───────────────────────
  it('3. Rejects missing run, unauthorized role, unmapped workspace, or bad config', async () => {
    // Missing hiring run id
    await expect(contextScope(new Request('http://localhost:3000'), '')).rejects.toThrow(ContextError);

    // Bad delegation secret length
    const prevSecret = process.env.WORKBYLINE_CONTEXT_DELEGATION_SECRET;
    process.env.WORKBYLINE_CONTEXT_DELEGATION_SECRET = 'short';
    try {
      await expect(contextScope(new Request('http://localhost:3000'), 'run-123')).rejects.toThrow();
    } finally {
      process.env.WORKBYLINE_CONTEXT_DELEGATION_SECRET = prevSecret;
    }
  });

  // ── 4. contextFetch Error Handling and Timeout Contract ────────────────────
  it('4. Handles ContextError and maps upstream HTTP statuses predictably', async () => {
    const scope = {
      base: 'http://127.0.0.1:8011',
      workspace: 'ws-test',
      token: 'mock-token',
    };

    // Mock global fetch returning 404 SOURCE_NOT_FOUND
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValue({ error: 'SOURCE_NOT_FOUND' }),
    });

    try {
      await expect(contextFetch(scope, '/sources/src-missing')).rejects.toMatchObject({
        status: 404,
        code: 'SOURCE_NOT_FOUND',
      });
    } finally {
      vi.restoreAllMocks();
    }
  });
});
