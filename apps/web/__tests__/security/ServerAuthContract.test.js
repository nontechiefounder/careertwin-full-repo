import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authenticateServerRequest } from '@/lib/serverAuth';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe('Server Request Authentication Contract Tests (Step 4B5.1.1 Hardened)', () => {
  let mockGetUser;
  let mockFrom;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetUser = vi.fn();
    mockFrom = vi.fn();

    createSupabaseServerClient.mockImplementation(async () => ({
      auth: {
        getUser: mockGetUser,
      },
      from: mockFrom,
    }));
  });

  // --- PART 6 HARDENED IDENTITY MINIMIZATION TESTS ---

  it('1. Verified provider user with user_metadata.role returns no user_metadata or role', async () => {
    const rawProviderUser = {
      id: 'usr-meta-1',
      email: 'meta1@example.com',
      user_metadata: { role: 'employer', custom_claim: 'superadmin' },
    };
    mockGetUser.mockResolvedValue({ data: { user: rawProviderUser }, error: null });

    const req = { headers: new Map([['Authorization', 'Bearer valid-jwt-token']]) };
    const res = await authenticateServerRequest(req);

    expect(res.ok).toBe(true);
    expect(res.context.user.user_metadata).toBeUndefined();
    expect(res.context.user.role).toBeUndefined();
    expect(res.context.role).toBeUndefined();
  });

  it('2. Verified provider user with user_metadata.orgId returns no orgId', async () => {
    const rawProviderUser = {
      id: 'usr-meta-2',
      email: 'meta2@example.com',
      user_metadata: { orgId: 'org-fake-123' },
    };
    mockGetUser.mockResolvedValue({ data: { user: rawProviderUser }, error: null });

    const req = { headers: new Map([['Authorization', 'Bearer valid-jwt-token']]) };
    const res = await authenticateServerRequest(req);

    expect(res.ok).toBe(true);
    expect(res.context.user.orgId).toBeUndefined();
    expect(res.context.orgId).toBeUndefined();
  });

  it('3. Verified provider user with app_metadata.role returns no app_metadata or role', async () => {
    const rawProviderUser = {
      id: 'usr-meta-3',
      email: 'meta3@example.com',
      app_metadata: { role: 'admin', provider: 'google' },
    };
    mockGetUser.mockResolvedValue({ data: { user: rawProviderUser }, error: null });

    const req = { headers: new Map([['Authorization', 'Bearer valid-jwt-token']]) };
    const res = await authenticateServerRequest(req);

    expect(res.ok).toBe(true);
    expect(res.context.user.app_metadata).toBeUndefined();
    expect(res.context.user.role).toBeUndefined();
  });

  it('4. Verified provider user with app_metadata.orgId returns no orgId', async () => {
    const rawProviderUser = {
      id: 'usr-meta-4',
      email: 'meta4@example.com',
      app_metadata: { orgId: 'org-app-555' },
    };
    mockGetUser.mockResolvedValue({ data: { user: rawProviderUser }, error: null });

    const req = { headers: new Map([['Authorization', 'Bearer valid-jwt-token']]) };
    const res = await authenticateServerRequest(req);

    expect(res.ok).toBe(true);
    expect(res.context.user.orgId).toBeUndefined();
    expect(res.context.orgId).toBeUndefined();
  });

  it('5. Returned context.user contains exactly id and email', async () => {
    const rawProviderUser = {
      id: 'usr-exact-1',
      email: 'exact@example.com',
      phone: '+1234567890',
      created_at: '2026-01-01',
    };
    mockGetUser.mockResolvedValue({ data: { user: rawProviderUser }, error: null });

    const req = { headers: new Map([['Authorization', 'Bearer valid-jwt-token']]) };
    const res = await authenticateServerRequest(req);

    expect(res.ok).toBe(true);
    expect(Object.keys(res.context.user).sort()).toEqual(['email', 'id']);
    expect(res.context.user).toEqual({
      id: 'usr-exact-1',
      email: 'exact@example.com',
    });
  });

  it('6. Returned context.user is not the original provider-user object', async () => {
    const rawProviderUser = {
      id: 'usr-ref-1',
      email: 'ref@example.com',
    };
    mockGetUser.mockResolvedValue({ data: { user: rawProviderUser }, error: null });

    const req = { headers: new Map([['Authorization', 'Bearer valid-jwt-token']]) };
    const res = await authenticateServerRequest(req);

    expect(res.ok).toBe(true);
    expect(res.context.user).not.toBe(rawProviderUser);
  });

  it('7. Email may be null', async () => {
    const rawProviderUser = {
      id: 'usr-no-email',
      email: undefined,
    };
    mockGetUser.mockResolvedValue({ data: { user: rawProviderUser }, error: null });

    const req = { headers: new Map([['Authorization', 'Bearer valid-jwt-token']]) };
    const res = await authenticateServerRequest(req);

    expect(res.ok).toBe(true);
    expect(res.context.user).toEqual({
      id: 'usr-no-email',
      email: null,
    });
  });

  it('8. Arbitrary provider fields are discarded', async () => {
    const rawProviderUser = {
      id: 'usr-arb-1',
      email: 'arb@example.com',
      aud: 'authenticated',
      role: 'authenticated',
      identities: [{ id: 'id-1' }],
      factors: [{ id: 'f-1' }],
      updated_at: '2026-08-01',
    };
    mockGetUser.mockResolvedValue({ data: { user: rawProviderUser }, error: null });

    const req = { headers: new Map([['Authorization', 'Bearer valid-jwt-token']]) };
    const res = await authenticateServerRequest(req);

    expect(res.ok).toBe(true);
    expect(res.context.user.aud).toBeUndefined();
    expect(res.context.user.identities).toBeUndefined();
    expect(res.context.user.factors).toBeUndefined();
  });

  // --- PART 6 FAILURE STATUS & ERROR MAPPING TESTS ---

  it('9. Normal getUser auth error returns INVALID_SESSION / 401', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid JWT token' },
    });

    const req = { headers: new Map([['Authorization', 'Bearer expired-jwt-token']]) };
    const res = await authenticateServerRequest(req);

    expect(res).toEqual({
      ok: false,
      status: 401,
      code: 'INVALID_SESSION',
      message: 'Invalid or expired authentication session',
    });
  });

  it('10. getUser returns no user -> INVALID_SESSION / 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const req = { headers: new Map([['Authorization', 'Bearer empty-user-token']]) };
    const res = await authenticateServerRequest(req);

    expect(res).toEqual({
      ok: false,
      status: 401,
      code: 'INVALID_SESSION',
      message: 'Invalid or expired authentication session',
    });
  });

  it('11. createSupabaseServerClient exception -> AUTH_PROVIDER_ERROR / 503', async () => {
    createSupabaseServerClient.mockRejectedValue(new Error('Fatal client initialization error'));

    const req = { headers: new Map([['Authorization', 'Bearer valid-jwt-token']]) };
    const res = await authenticateServerRequest(req);

    expect(res).toEqual({
      ok: false,
      status: 503,
      code: 'AUTH_PROVIDER_ERROR',
      message: 'Authentication service temporarily unavailable',
    });
  });

  it('12. getUser thrown exception -> AUTH_PROVIDER_ERROR / 503', async () => {
    mockGetUser.mockRejectedValue(new Error('Network connection reset by peer'));

    const req = { headers: new Map([['Authorization', 'Bearer valid-jwt-token']]) };
    const res = await authenticateServerRequest(req);

    expect(res).toEqual({
      ok: false,
      status: 503,
      code: 'AUTH_PROVIDER_ERROR',
      message: 'Authentication service temporarily unavailable',
    });
  });

  it('13. Provider failure message is sanitized', async () => {
    const rawSensitiveError = 'Internal GoTrue Auth Database Timeout: connection pool exhausted at 10.0.0.1:5432';
    createSupabaseServerClient.mockRejectedValue(new Error(rawSensitiveError));

    const req = { headers: new Map([['Authorization', 'Bearer valid-jwt-token']]) };
    const res = await authenticateServerRequest(req);

    expect(res.message).toBe('Authentication service temporarily unavailable');
    expect(JSON.stringify(res).includes('10.0.0.1')).toBe(false);
  });

  it('14. Provider stack is not returned', async () => {
    const errorWithStack = new Error('GoTrue failure');
    errorWithStack.stack = 'Error: GoTrue failure\n    at GoTrueClient.getUser (node_modules/gotrue/dist/index.js:123:45)';
    createSupabaseServerClient.mockRejectedValue(errorWithStack);

    const req = { headers: new Map([['Authorization', 'Bearer valid-jwt-token']]) };
    const res = await authenticateServerRequest(req);

    expect(res.stack).toBeUndefined();
    expect(JSON.stringify(res).includes('node_modules')).toBe(false);
  });

  it('15. Token values are not returned in failure response', async () => {
    const secretToken = 'secret-user-bearer-token-12345';
    createSupabaseServerClient.mockRejectedValue(new Error('Crash'));

    const req = { headers: new Map([['Authorization', `Bearer ${secretToken}`]]) };
    const res = await authenticateServerRequest(req);

    expect(JSON.stringify(res).includes(secretToken)).toBe(false);
  });

  // --- EXISTING CONTRACT SCENARIOS (RE-VERIFIED) ---

  it('16. Missing token with default options returns AUTH_REQUIRED/401', async () => {
    const req = { headers: new Map() };
    const res = await authenticateServerRequest(req);

    expect(res).toEqual({
      ok: false,
      status: 401,
      code: 'AUTH_REQUIRED',
      message: 'Authentication token is required',
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it('17. Missing token with requireAuth false returns public success with null context', async () => {
    const req = { headers: new Map() };
    const res = await authenticateServerRequest(req, { requireAuth: false });

    expect(res).toEqual({
      ok: true,
      client: null,
      context: null,
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it('18. Valid Bearer token returns verified user context', async () => {
    const mockUser = { id: 'usr-123', email: 'valid@example.com' };
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

    const req = { headers: new Map([['Authorization', 'Bearer valid-jwt-token-abc']]) };
    const res = await authenticateServerRequest(req);

    expect(res.ok).toBe(true);
    expect(res.context.userId).toBe('usr-123');
    expect(res.context.user).toEqual({ id: 'usr-123', email: 'valid@example.com' });
    expect(createSupabaseServerClient).toHaveBeenCalledWith(req, false);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('19. Valid cookie token returns verified user context', async () => {
    const mockUser = { id: 'usr-456', email: 'cookie@example.com' };
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

    const req = { headers: new Map([['cookie', 'ct_token=valid-cookie-token-456']]) };
    const res = await authenticateServerRequest(req);

    expect(res.ok).toBe(true);
    expect(res.context.userId).toBe('usr-456');
    expect(createSupabaseServerClient).toHaveBeenCalledWith(req, false);
  });

  it('20. Same header and cookie token is accepted once', async () => {
    const mockUser = { id: 'usr-789', email: 'same@example.com' };
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

    const req = {
      headers: new Map([
        ['Authorization', 'Bearer token-123'],
        ['cookie', 'ct_token=token-123'],
      ]),
    };

    const res = await authenticateServerRequest(req);

    expect(res.ok).toBe(true);
    expect(res.context.userId).toBe('usr-789');
  });

  it('21. Different header and cookie tokens return TOKEN_SOURCE_CONFLICT', async () => {
    const req = {
      headers: new Map([
        ['Authorization', 'Bearer token-header-abc'],
        ['cookie', 'ct_token=token-cookie-xyz'],
      ]),
    };

    const res = await authenticateServerRequest(req);

    expect(res).toEqual({
      ok: false,
      status: 401,
      code: 'TOKEN_SOURCE_CONFLICT',
      message: 'Conflicting authentication tokens provided in header and cookie',
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it('22. Malformed Authorization returns MALFORMED_AUTHORIZATION', async () => {
    const req = {
      headers: new Map([
        ['Authorization', 'Bearer '],
        ['cookie', 'ct_token=valid-cookie-token'],
      ]),
    };

    const res = await authenticateServerRequest(req);

    expect(res).toEqual({
      ok: false,
      status: 401,
      code: 'MALFORMED_AUTHORIZATION',
      message: 'Malformed Authorization header format',
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it('23. Non-Bearer Authorization returns MALFORMED_AUTHORIZATION', async () => {
    const req = { headers: new Map([['Authorization', 'Basic dXNlcjpwYXNz']]) };
    const res = await authenticateServerRequest(req);

    expect(res).toEqual({
      ok: false,
      status: 401,
      code: 'MALFORMED_AUTHORIZATION',
      message: 'Malformed Authorization header format',
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it('24. Deprecated header marker returns DEPRECATED_SESSION before client creation', async () => {
    const req = { headers: new Map([['Authorization', 'Bearer mock-token']]) };
    const res = await authenticateServerRequest(req);

    expect(res).toEqual({
      ok: false,
      status: 401,
      code: 'DEPRECATED_SESSION',
      message: 'Deprecated authentication session is rejected',
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('25. Deprecated cookie marker returns DEPRECATED_SESSION before client creation', async () => {
    const req = { headers: new Map([['cookie', 'ct_token=mock-token']]) };
    const res = await authenticateServerRequest(req);

    expect(res).toEqual({
      ok: false,
      status: 401,
      code: 'DEPRECATED_SESSION',
      message: 'Deprecated authentication session is rejected',
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it('26. Deprecated marker with requireAuth false still returns DEPRECATED_SESSION', async () => {
    const req = { headers: new Map([['Authorization', 'Bearer mock-token']]) };
    const res = await authenticateServerRequest(req, { requireAuth: false });

    expect(res).toEqual({
      ok: false,
      status: 401,
      code: 'DEPRECATED_SESSION',
      message: 'Deprecated authentication session is rejected',
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it('27. Body-supplied role and orgId are ignored', async () => {
    const mockUser = { id: 'usr-102', email: 'test2@example.com' };
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

    const req = {
      headers: new Map([['Authorization', 'Bearer valid-token']]),
      json: async () => ({ role: 'employer', orgId: 'org-999' }),
    };

    const res = await authenticateServerRequest(req);

    expect(res.context.role).toBeUndefined();
    expect(res.context.orgId).toBeUndefined();
  });

  it('28. Query-supplied role and orgId are ignored', async () => {
    const mockUser = { id: 'usr-103', email: 'test3@example.com' };
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

    const req = {
      url: 'http://localhost:3100/api/employer/analytics?role=employer&orgId=org-888',
      headers: new Map([['Authorization', 'Bearer valid-token']]),
    };

    const res = await authenticateServerRequest(req);

    expect(res.context.role).toBeUndefined();
    expect(res.context.orgId).toBeUndefined();
  });

  it('29. No service-role client is requested', async () => {
    const mockUser = { id: 'usr-104', email: 'test4@example.com' };
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

    const req = { headers: new Map([['Authorization', 'Bearer valid-token']]) };
    await authenticateServerRequest(req);

    expect(createSupabaseServerClient).toHaveBeenCalledWith(req, false);
  });

  it('30. No database call occurs before or during successful identity verification', async () => {
    const mockUser = { id: 'usr-105', email: 'test5@example.com' };
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

    const req = { headers: new Map([['Authorization', 'Bearer valid-token']]) };
    await authenticateServerRequest(req);

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('31. Unrelated cookies are ignored', async () => {
    const mockUser = { id: 'usr-106', email: 'test6@example.com' };
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

    const req = {
      headers: new Map([
        ['Authorization', 'Bearer valid-token'],
        ['cookie', 'theme=dark; tracker_id=9988; session_id=xyz'],
      ]),
    };

    const res = await authenticateServerRequest(req);

    expect(res.ok).toBe(true);
    expect(res.context.userId).toBe('usr-106');
  });

  it('32. Zero external network requests occur', async () => {
    const req = { headers: new Map([['Authorization', 'Bearer mock-token']]) };
    const res = await authenticateServerRequest(req);

    expect(res.ok).toBe(false);
    expect(res.code).toBe('DEPRECATED_SESSION');
  });
});
