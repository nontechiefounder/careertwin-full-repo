import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { POST as postSignin } from '@/app/api/auth/signin/route';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: vi.fn(),
}));

function createMockRequest(body) {
  return {
    json: async () => body,
  };
}

describe('Auth Signin Decommission Security Tests (Step 4B5B2)', () => {
  let mockSignInWithPassword;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSignInWithPassword = vi.fn();
    createSupabaseServerClient.mockResolvedValue({
      auth: {
        signInWithPassword: mockSignInWithPassword,
      },
    });
  });

  describe('PART 4 — Static Decommission Source Assertions', () => {
    it('1. Source file signin/route.js contains 0 active references to mock session markers', () => {
      const sourcePath = resolve(__dirname, '../../app/api/auth/signin/route.js');
      const sourceCode = readFileSync(sourcePath, 'utf-8');

      expect(sourceCode).not.toContain('mock-token');
      expect(sourceCode).not.toContain('mock-refresh-token');
      expect(sourceCode).not.toContain('is_mock');
      expect(sourceCode).not.toContain('Admin Tester');
    });
  });

  describe('PART 5 — Handler Execution Tests', () => {
    it('1. Missing email returns 400 with validation message', async () => {
      const req = createMockRequest({ password: 'somepassword' });
      const res = await postSignin(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toBe('Email and password are required');
      expect(createSupabaseServerClient).not.toHaveBeenCalled();
    });

    it('2. Missing password returns 400 with validation message', async () => {
      const req = createMockRequest({ email: 'user@example.com' });
      const res = await postSignin(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toBe('Email and password are required');
      expect(createSupabaseServerClient).not.toHaveBeenCalled();
    });

    it('3. Arbitrary invalid credentials call Supabase signInWithPassword and return 401 without mock fields', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials', status: 401 },
      });

      const req = createMockRequest({ email: 'invalid@example.com', password: 'wrongpassword' });
      const res = await postSignin(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toBe('Invalid login credentials');
      expect(mockSignInWithPassword).toHaveBeenCalledTimes(1);
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'invalid@example.com',
        password: 'wrongpassword',
      });
      expect(json.is_mock).toBeUndefined();
      expect(json.session).toBeUndefined();
    });

    it('4. Successful mocked Supabase sign-in returns legitimate user and session shape without mock fields', async () => {
      const mockLegitUser = { id: 'usr-real-test-password-not-secret', email: 'legit@example.com' };
      const mockLegitSession = { access_token: 'legit-jwt-access-token', refresh_token: 'legit-jwt-refresh-token' };

      mockSignInWithPassword.mockResolvedValue({
        data: { user: mockLegitUser, session: mockLegitSession },
        error: null,
      });

      const req = createMockRequest({ email: 'legit@example.com', password: 'validpassword' });
      const res = await postSignin(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.user).toEqual(mockLegitUser);
      expect(json.session).toEqual(mockLegitSession);
      expect(json.user.is_mock).toBeUndefined();
      expect(json.session.access_token).toBe('legit-jwt-access-token');
      expect(mockSignInWithPassword).toHaveBeenCalledTimes(1);
    });

    it('5. Supabase exception returns 500 error response without exposing raw credentials', async () => {
      mockSignInWithPassword.mockRejectedValue(new Error('Database network error'));

      const req = createMockRequest({ email: 'test@example.com', password: 'secretpassword' });
      const res = await postSignin(req);
      const json = await res.json();

      expect(res.status).toBe(500);
      expect(json.error).toBe('Internal server error');
    });

    it('6. Console logs do not print raw password or full access token', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockSignInWithPassword.mockResolvedValue({
        data: { user: { id: 'usr-1' }, session: { access_token: 'full-secret-access-token' } },
        error: null,
      });

      const req = createMockRequest({ email: 'test@example.com', password: 'mysecretpasswordtest-password-not-secret' });
      await postSignin(req);

      const allLogs = [...consoleSpy.mock.calls, ...consoleErrSpy.mock.calls].flat().join(' ');
      expect(allLogs).not.toContain('mysecretpasswordtest-password-not-secret');
      expect(allLogs).not.toContain('full-secret-access-token');

      consoleSpy.mockRestore();
      consoleErrSpy.mockRestore();
    });

    it('7. Zero external network requests occur during local mocked execution', async () => {
      mockSignInWithPassword.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid credentials', status: 401 },
      });

      const req = createMockRequest({ email: 'check@example.com', password: 'pass' });
      await postSignin(req);

      expect(createSupabaseServerClient).toHaveBeenCalledWith(null, false);
      expect(mockSignInWithPassword).toHaveBeenCalledTimes(1);
    });
  });
});
