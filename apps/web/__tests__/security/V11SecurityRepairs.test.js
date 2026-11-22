import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockAdminUpdateEq = vi.fn();
const mockAdminUpdate = vi.fn(() => ({ eq: mockAdminUpdateEq }));
const mockAdminFrom = vi.fn(() => ({ update: mockAdminUpdate }));

const mockUserFrom = vi.fn();
const mockCreateSupabaseServerClient = vi.fn();

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: (...args) => mockCreateSupabaseServerClient(...args),
}));

const mockGenerateAuthUrl = vi.fn((opts) => `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(opts.state)}`);
const mockGetToken = vi.fn();

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: function MockOAuth2() {
        this.generateAuthUrl = mockGenerateAuthUrl;
        this.getToken = mockGetToken;
        this.setCredentials = vi.fn();
      },
    },
    gmail: vi.fn(),
  },
}));

describe('V11 Bounded Security Repairs', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.GMAIL_OAUTH_STATE_SECRET = 'test-oauth-state-secret-32-chars-min';
    process.env.NEXT_PUBLIC_URL = 'http://localhost:3010';

    const { clearConsumedGmailNoncesForTest } = await import('@/lib/gmail');
    clearConsumedGmailNoncesForTest();

    mockAdminUpdateEq.mockResolvedValue({ error: null });
    mockGetToken.mockResolvedValue({
      tokens: {
        refresh_token: 'secret-refresh-token',
        id_token: `${Buffer.from('{"alg":"RS256"}').toString('base64url')}.${Buffer.from('{"email":"emp@example.com"}').toString('base64url')}.sig`,
      },
    });

    mockCreateSupabaseServerClient.mockImplementation(async (_req, useServiceRole) => {
      if (useServiceRole) {
        return { from: mockAdminFrom };
      }
      return {
        auth: { getUser: mockGetUser },
        from: mockUserFrom,
      };
    });
  });

  describe('1. Gmail OAuth State/Session Binding & Replay Protection', () => {
    it('rejects missing, wrong, expired, different-session, and replayed state with zero token exchanges or DB writes', async () => {
      const { createGmailOAuthState, GMAIL_OAUTH_STATE_COOKIE } = await import('@/lib/gmail');
      const { GET: callbackGET } = await import('@/app/api/integrations/gmail/callback/route');

      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null });

      // Missing state
      const resMissing = await callbackGET({
        url: 'http://localhost:3010/api/integrations/gmail/callback?code=auth-code-1',
        cookies: { get: () => ({ value: 'nonce-1' }) },
      });
      expect(resMissing.headers.get('location')).toContain('error=invalid_state');

      // Wrong / tampered state
      const resWrong = await callbackGET({
        url: 'http://localhost:3010/api/integrations/gmail/callback?code=auth-code-1&state=tampered.sig',
        cookies: { get: () => ({ value: 'nonce-1' }) },
      });
      expect(resWrong.headers.get('location')).toContain('error=invalid_state');

      // Expired state
      const expired = createGmailOAuthState('user-a', Date.now() - 20 * 60 * 1000);
      const resExpired = await callbackGET({
        url: `http://localhost:3010/api/integrations/gmail/callback?code=auth-code-1&state=${encodeURIComponent(expired.state)}`,
        cookies: { get: (k) => (k === GMAIL_OAUTH_STATE_COOKIE ? { value: expired.nonce } : undefined) },
      });
      expect(resExpired.headers.get('location')).toContain('error=invalid_state');

      // Different-session state (minted for user-b, callback as user-a)
      const otherSession = createGmailOAuthState('user-b');
      const resDiff = await callbackGET({
        url: `http://localhost:3010/api/integrations/gmail/callback?code=auth-code-1&state=${encodeURIComponent(otherSession.state)}`,
        cookies: { get: (k) => (k === GMAIL_OAUTH_STATE_COOKIE ? { value: otherSession.nonce } : undefined) },
      });
      expect(resDiff.headers.get('location')).toContain('error=invalid_state');

      expect(mockGetToken).not.toHaveBeenCalled();
      expect(mockAdminFrom).not.toHaveBeenCalled();

      // Valid synthetic OAuth transaction succeeds once, then replay is blocked
      const valid = createGmailOAuthState('user-a');
      const resOk = await callbackGET({
        url: `http://localhost:3010/api/integrations/gmail/callback?code=auth-code-1&state=${encodeURIComponent(valid.state)}`,
        cookies: { get: (k) => (k === GMAIL_OAUTH_STATE_COOKIE ? { value: valid.nonce } : undefined) },
      });
      expect(resOk.headers.get('location')).toContain('success=gmail_connected');
      expect(mockGetToken).toHaveBeenCalledTimes(1);
      expect(mockAdminFrom).toHaveBeenCalledWith('profiles');

      // Replay same state + cookie -> blocked with zero extra exchanges/writes
      const resReplay = await callbackGET({
        url: `http://localhost:3010/api/integrations/gmail/callback?code=auth-code-1&state=${encodeURIComponent(valid.state)}`,
        cookies: { get: (k) => (k === GMAIL_OAUTH_STATE_COOKIE ? { value: valid.nonce } : undefined) },
      });
      expect(resReplay.headers.get('location')).toContain('error=invalid_state');
      expect(mockGetToken).toHaveBeenCalledTimes(1);
      expect(mockAdminFrom).toHaveBeenCalledTimes(1);
    });

    it('rejects exact expiry equality (now === exp), preserves consumed nonces at capacity, and admits at most 1 concurrent duplicate', async () => {
      const {
        createGmailOAuthState,
        createMemoryGmailNonceStore,
        setGmailNonceStore,
        GMAIL_OAUTH_STATE_COOKIE,
      } = await import('@/lib/gmail');
      const { GET: callbackGET } = await import('@/app/api/integrations/gmail/callback/route');

      expect(() => createMemoryGmailNonceStore({ maxEntries: 0 })).toThrow(RangeError);
      setGmailNonceStore(createMemoryGmailNonceStore({ maxEntries: 2 }));

      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null });

      // Exact expiry equality: now === exp -> rejected
      const now = 1_700_000_000_000;
      const issued = createGmailOAuthState('user-a', now - 10 * 60 * 1000);
      const spyNow = vi.spyOn(Date, 'now').mockReturnValue(now);
      const resExactExp = await callbackGET({
        url: `http://localhost:3010/api/integrations/gmail/callback?code=c1&state=${encodeURIComponent(issued.state)}`,
        cookies: { get: (k) => (k === GMAIL_OAUTH_STATE_COOKIE ? { value: issued.nonce } : undefined) },
      });
      spyNow.mockRestore();
      expect(resExactExp.headers.get('location')).toContain('error=invalid_state');
      expect(mockGetToken).not.toHaveBeenCalled();

      // Concurrent duplicate consumption -> at most 1 exchange/write
      const dup = createGmailOAuthState('user-a');
      const [c1, c2] = await Promise.all([
        callbackGET({
          url: `http://localhost:3010/api/integrations/gmail/callback?code=c-dup&state=${encodeURIComponent(dup.state)}`,
          cookies: { get: (k) => (k === GMAIL_OAUTH_STATE_COOKIE ? { value: dup.nonce } : undefined) },
        }),
        callbackGET({
          url: `http://localhost:3010/api/integrations/gmail/callback?code=c-dup&state=${encodeURIComponent(dup.state)}`,
          cookies: { get: (k) => (k === GMAIL_OAUTH_STATE_COOKIE ? { value: dup.nonce } : undefined) },
        }),
      ]);
      const locs = [c1.headers.get('location'), c2.headers.get('location')];
      expect(locs.filter((l) => l.includes('success=gmail_connected'))).toHaveLength(1);
      expect(locs.filter((l) => l.includes('error=invalid_state'))).toHaveLength(1);
      expect(mockGetToken).toHaveBeenCalledTimes(1);

      // Fill second slot, then verify 3rd fails closed AND 1st (dup) is still blocked
      const s2 = createGmailOAuthState('user-a');
      const r2 = await callbackGET({
        url: `http://localhost:3010/api/integrations/gmail/callback?code=c2&state=${encodeURIComponent(s2.state)}`,
        cookies: { get: (k) => (k === GMAIL_OAUTH_STATE_COOKIE ? { value: s2.nonce } : undefined) },
      });
      expect(r2.headers.get('location')).toContain('success=gmail_connected');

      const s3 = createGmailOAuthState('user-a');
      const r3 = await callbackGET({
        url: `http://localhost:3010/api/integrations/gmail/callback?code=c3&state=${encodeURIComponent(s3.state)}`,
        cookies: { get: (k) => (k === GMAIL_OAUTH_STATE_COOKIE ? { value: s3.nonce } : undefined) },
      });
      expect(r3.headers.get('location')).toContain('error=invalid_state');

      const rReplayDup = await callbackGET({
        url: `http://localhost:3010/api/integrations/gmail/callback?code=c-dup&state=${encodeURIComponent(dup.state)}`,
        cookies: { get: (k) => (k === GMAIL_OAUTH_STATE_COOKIE ? { value: dup.nonce } : undefined) },
      });
      expect(rReplayDup.headers.get('location')).toContain('error=invalid_state');
      expect(mockGetToken).toHaveBeenCalledTimes(2);
      expect(mockAdminFrom).toHaveBeenCalledTimes(2);

      // Restore default store for subsequent suites
      setGmailNonceStore(createMemoryGmailNonceStore());
    });

    it('allowlists callback error query parameter', async () => {
      const { GET: callbackGET } = await import('@/app/api/integrations/gmail/callback/route');
      const res = await callbackGET({
        url: 'http://localhost:3010/api/integrations/gmail/callback?error=https://evil.example/phish',
        cookies: { get: () => undefined },
      });
      expect(res.headers.get('location')).toBe('http://localhost:3010/employer/integrations?error=oauth_error');
      expect(mockGetToken).not.toHaveBeenCalled();
    });

    it('connect endpoint requires auth and sets HttpOnly state cookie', async () => {
      const { GET: connectGET } = await import('@/app/api/integrations/gmail/connect/route');
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      const unauth = await connectGET(new Request('http://localhost:3010/api/integrations/gmail/connect'));
      expect(unauth.status).toBe(401);

      mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-a' } }, error: null });
      const ok = await connectGET(new Request('http://localhost:3010/api/integrations/gmail/connect'));
      expect(ok.status).toBe(200);
      const body = await ok.json();
      expect(body.url).toContain('state=');
      expect(ok.headers.get('set-cookie')).toContain('wbl_gmail_oauth_state=');
    });
  });

  describe('2. /api/auth/me Safe Profile Serialization', () => {
    it('selects explicit safe columns and never exposes gmail_refresh_token', async () => {
      const { GET: meGET } = await import('@/app/api/auth/me/route');
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-a', email: 'a@example.com' } }, error: null });

      let selectedCols = '';
      mockUserFrom.mockImplementation((table) => {
        if (table === 'profiles') {
          return {
            select: (cols) => {
              selectedCols = cols;
              return {
                eq: () => ({
                  single: async () => ({
                    data: {
                      id: 'user-a',
                      email: 'a@example.com',
                      name: 'Alice',
                      role: 'employer',
                      company: 'Acme',
                      gmail_connected: true,
                      gmail_email: 'a@gmail.com',
                      gmail_refresh_token: 'SHOULD_NEVER_LEAK',
                    },
                    error: null,
                  }),
                }),
              };
            },
          };
        }
        return {
          select: () => ({
            eq: async () => ({ data: [] }),
          }),
        };
      });

      const res = await meGET(new Request('http://localhost:3010/api/auth/me'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(selectedCols).not.toContain('*');
      expect(selectedCols).not.toContain('gmail_refresh_token');
      expect(body).not.toHaveProperty('gmail_refresh_token');
      expect(JSON.stringify(body)).not.toContain('SHOULD_NEVER_LEAK');
      expect(body.gmail_connected).toBe(true);
    });
  });

  describe('3. /api/search Filter Sanitization, AuthZ & Error Handling', () => {
    it('sanitizes PostgREST metacharacters, scopes by employer_id, and fails closed on query error', async () => {
      const { GET: searchGET, sanitizeSearchQuery } = await import('@/app/api/search/route');

      expect(sanitizeSearchQuery('Staff,id.neq.0)or(id.eq.1')).toBe('Staff id.neq.0 or id.eq.1');
      expect(sanitizeSearchQuery("O'Reilly")).toBe("O'Reilly");
      expect(sanitizeSearchQuery('Node.js')).toBe('Node.js');
      expect(sanitizeSearchQuery('100%_Engineer')).toBe('100\\%\\_Engineer');

      // Unauthenticated -> 401
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      const r401 = await searchGET(new Request('http://localhost:3010/api/search?q=engineer'));
      expect(r401.status).toBe(401);

      // DB query error -> 500 (never silently swallowed)
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-a' } }, error: null });
      mockUserFrom.mockImplementation(() => ({
        select: () => ({
          or: () => ({
            eq: () => ({
              limit: async () => ({ data: null, error: { message: 'db down' } }),
            }),
          }),
        }),
      }));
      const r500 = await searchGET(new Request('http://localhost:3010/api/search?q=engineer'));
      expect(r500.status).toBe(500);

      // Valid query succeeds scoped to employer_id
      let capturedOr = '';
      let capturedEmployerId = '';
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'user-a' } }, error: null });
      mockUserFrom.mockImplementation((table) => {
        if (table === 'hiring_runs') {
          return {
            select: () => ({
              or: (expr) => {
                capturedOr = expr;
                return {
                  eq: (_col, val) => {
                    capturedEmployerId = val;
                    return {
                      limit: async () => ({ data: [{ id: 'run-1', role_title: 'Staff Engineer', company: 'Acme', status: 'active' }], error: null }),
                    };
                  },
                };
              },
            }),
          };
        }
        return {
          select: () => ({
            ilike: () => ({ limit: async () => ({ data: [], error: null }) }),
          }),
        };
      });
      const r200 = await searchGET(new Request('http://localhost:3010/api/search?q=Staff,id.neq.0'));
      expect(r200.status).toBe(200);
      expect(capturedOr).toBe('role_title.ilike."%Staff id.neq.0%",company.ilike."%Staff id.neq.0%"');
      expect(capturedEmployerId).toBe('user-a');
      const body200 = await r200.json();
      expect(body200.results).toHaveLength(1);
    });
  });
});
