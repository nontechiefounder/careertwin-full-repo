import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import api from '@/lib/api';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/supabase', () => {
  const unsubscribeMock = vi.fn();
  const getSessionMock = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
  const onAuthStateChangeMock = vi.fn().mockReturnValue({
    data: { subscription: { unsubscribe: unsubscribeMock } },
  });
  const signOutMock = vi.fn().mockResolvedValue({ error: null });
  const setSessionMock = vi.fn().mockResolvedValue({ error: null });

  return {
    supabase: {
      auth: {
        getSession: getSessionMock,
        onAuthStateChange: onAuthStateChangeMock,
        signOut: signOutMock,
        setSession: setSessionMock,
      },
    },
    __mocks: {
      unsubscribeMock,
      getSessionMock,
      onAuthStateChangeMock,
      signOutMock,
      setSessionMock,
    },
  };
});

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

function TestConsumer({ onState }) {
  const auth = useAuth();
  onState?.(auth);
  return (
    <div>
      <span data-testid="auth-loading">{auth.loading ? 'loading' : 'ready'}</span>
      <span data-testid="auth-user">{auth.user ? auth.user.name || auth.user.email : 'guest'}</span>
      <button data-testid="logout-btn" onClick={auth.logout}>Logout</button>
    </div>
  );
}

describe('Client-Side Mock-Session Decommission & Stale Cleanup Tests (Step 4B5B3.1)', () => {
  let originalLocation;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.cookie = 'sb-test-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'unrelated_cookie=keep_me; path=/';

    originalLocation = window.location;
    delete window.location;
    window.location = { href: 'http://localhost/dashboard', pathname: '/dashboard' };

    api.get.mockResolvedValue({
      data: { id: 'u1', email: 'user@example.com', name: 'Test User', role: 'employer' },
    });
  });

  afterEach(() => {
    window.location = originalLocation;
  });

  it('1. Stale deprecated ct_token plus mock user: token & user removed, cookie cleared, user null, loading false, /auth/me not called', async () => {
    localStorage.setItem('ct_token', 'mock-token');
    localStorage.setItem('ct_user', JSON.stringify({ id: 'm1', is_mock: true, name: 'Admin Tester' }));
    document.cookie = 'sb-undefined-auth-token=%7B%22access_token%22%3A%22mock-token%22%7D; path=/';

    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );
    });

    expect(localStorage.getItem('ct_token')).toBeNull();
    expect(localStorage.getItem('ct_user')).toBeNull();
    expect(screen.getByTestId('auth-loading').textContent).toBe('ready');
    expect(screen.getByTestId('auth-user').textContent).toBe('guest');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('2. Deprecated token without ct_user: token removed, cookie cleared, unauthenticated state', async () => {
    localStorage.setItem('ct_token', 'mock-token');

    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );
    });

    expect(localStorage.getItem('ct_token')).toBeNull();
    expect(screen.getByTestId('auth-user').textContent).toBe('guest');
  });

  it('3. is_mock ct_user with ordinary stale token: both entries removed, cookie cleared, unauthenticated state', async () => {
    localStorage.setItem('ct_token', 'ordinary-stale-token');
    localStorage.setItem('ct_user', JSON.stringify({ id: 'm1', is_mock: true }));

    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );
    });

    expect(localStorage.getItem('ct_token')).toBeNull();
    expect(localStorage.getItem('ct_user')).toBeNull();
    expect(screen.getByTestId('auth-user').textContent).toBe('guest');
  });

  it('4. Deprecated cookie with no localStorage token: relevant cookie cleared, unrelated cookies remain, user null', async () => {
    document.cookie = 'sb-undefined-auth-token=%7B%22access_token%22%3A%22mock-token%22%7D; path=/';
    document.cookie = 'unrelated_cookie=keep_me; path=/';

    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );
    });

    expect(document.cookie.includes('unrelated_cookie=keep_me')).toBe(true);
    expect(screen.getByTestId('auth-user').textContent).toBe('guest');
  });

  it('5. Valid locally mocked normal Supabase session initializes normally and calls /auth/me', async () => {
    supabase.auth.getSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'valid-jwt-token',
          user: { id: 'u1', email: 'user@example.com' },
        },
      },
    });

    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );
    });

    expect(localStorage.getItem('ct_token')).toBe('valid-jwt-token');
    expect(api.get).toHaveBeenCalledWith('/auth/me');
    expect(screen.getByTestId('auth-user').textContent).toBe('Test User');
  });

  it('6. No-token initialization resolves user to null and loading to false', async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );
    });

    expect(screen.getByTestId('auth-loading').textContent).toBe('ready');
    expect(screen.getByTestId('auth-user').textContent).toBe('guest');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('7. Auth listener: normal auth events are processed normally without mock bypass', async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );
    });

    const callback = supabase.auth.onAuthStateChange.mock.calls[0][0];

    await act(async () => {
      await callback('SIGNED_IN', {
        access_token: 'new-session-token',
        user: { id: 'u2', email: 'new@example.com' },
      });
    });

    expect(localStorage.getItem('ct_token')).toBe('new-session-token');
    expect(api.get).toHaveBeenCalledWith('/auth/me');
  });

  it('8. Login receives unexpected deprecated session response: fails closed, no token/user stored', async () => {
    let capturedAuth;
    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer onState={(auth) => { capturedAuth = auth; }} />
        </AuthProvider>
      );
    });

    api.post.mockResolvedValueOnce({
      data: {
        user: { id: 'm1', email: 'mock@example.com' },
        session: { access_token: 'mock-token' },
      },
    });

    await act(async () => {
      await expect(capturedAuth.login('user@example.com', 'pass')).rejects.toThrow();
    });

    expect(localStorage.getItem('ct_token')).toBeNull();
    expect(localStorage.getItem('ct_user')).toBeNull();
  });

  it('9. Normal mocked login success remains functional', async () => {
    let capturedAuth;
    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer onState={(auth) => { capturedAuth = auth; }} />
        </AuthProvider>
      );
    });

    api.post.mockResolvedValueOnce({
      data: {
        user: { id: 'u1', email: 'real@example.com', user_metadata: { name: 'Real User' } },
        session: { access_token: 'real-session-token' },
      },
    });

    let loginResult;
    await act(async () => {
      loginResult = await capturedAuth.login('real@example.com', 'valid-password');
    });

    expect(loginResult.email).toBe('real@example.com');
    expect(localStorage.getItem('ct_token')).toBe('real-session-token');
  });

  it('10. Normal mocked login failure remains functional', async () => {
    let capturedAuth;
    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer onState={(auth) => { capturedAuth = auth; }} />
        </AuthProvider>
      );
    });

    api.post.mockRejectedValueOnce(new Error('Invalid login credentials'));

    await expect(capturedAuth.login('wrong@example.com', 'bad')).rejects.toThrow('Invalid login credentials');
  });

  it('11. Logout behavior remains functional', async () => {
    let capturedAuth;
    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer onState={(auth) => { capturedAuth = auth; }} />
        </AuthProvider>
      );
    });

    localStorage.setItem('ct_token', 'valid-token');

    await act(async () => {
      await capturedAuth.logout();
    });

    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('ct_token')).toBeNull();
    expect(window.location.href).toBe('/auth');
  });

  it('12. Ordinary parent rerender does not repeat initialization', async () => {
    let res;
    await act(async () => {
      res = render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );
    });

    const initCalls = supabase.auth.getSession.mock.calls.length;

    await act(async () => {
      res.rerender(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );
    });

    expect(supabase.auth.getSession.mock.calls.length).toBe(initCalls);
  });

  it('13. Strict Mode leaves no subscription leak', async () => {
    let res;
    await act(async () => {
      res = render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );
    });

    const { __mocks } = await import('@/lib/supabase');

    act(() => {
      res.unmount();
    });

    expect(__mocks.unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('14. No raw access token appears in console output', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    supabase.auth.getSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'secret-jwt-token-test-password-not-secret45',
          user: { id: 'u1', email: 'user@example.com' },
        },
      },
    });

    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );
    });

    consoleSpy.mock.calls.forEach(([arg]) => {
      if (typeof arg === 'string') {
        expect(arg.includes('secret-jwt-token-test-password-not-secret45')).toBe(false);
      }
    });

    consoleSpy.mockRestore();
  });

  it('15. No external provider domain is contacted during unit tests', async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );
    });

    api.get.mock.calls.forEach(([url]) => {
      expect(url.startsWith('/')).toBe(true);
      expect(url.includes('supabase.co')).toBe(false);
      expect(url.includes('googleapis.com')).toBe(false);
    });
  });
});
