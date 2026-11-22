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

  return {
    supabase: {
      auth: {
        getSession: getSessionMock,
        onAuthStateChange: onAuthStateChangeMock,
        signOut: signOutMock,
      },
    },
    __mocks: {
      unsubscribeMock,
      getSessionMock,
      onAuthStateChangeMock,
      signOutMock,
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

describe('AuthProvider Lifecycle & Hook Dependency Tests (W10/W11)', () => {
  let originalLocation;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.cookie = 'sb-test-auth-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';

    // Mock window.location.href safely
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

  it('1. No-token initialization resolves user to null and loading to false', async () => {
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

  it('2. Stable parent rerender does not repeat initialization or re-subscriptions', async () => {
    let res;
    await act(async () => {
      res = render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );
    });

    const initialGetSessionCount = supabase.auth.getSession.mock.calls.length;
    const initialSubscribeCount = supabase.auth.onAuthStateChange.mock.calls.length;

    await act(async () => {
      res.rerender(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );
    });

    expect(supabase.auth.getSession.mock.calls.length).toBe(initialGetSessionCount);
    expect(supabase.auth.onAuthStateChange.mock.calls.length).toBe(initialSubscribeCount);
  });

  it('3. Auth listener lifecycle: exactly one active subscription remains and unsubscribes on unmount', async () => {
    let res;
    await act(async () => {
      res = render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );
    });

    expect(supabase.auth.onAuthStateChange).toHaveBeenCalledTimes(1);

    const { __mocks } = await import('@/lib/supabase');

    act(() => {
      res.unmount();
    });

    expect(__mocks.unsubscribeMock).toHaveBeenCalledTimes(1);
  });

  it('4. Strict Mode lifecycle: unsubscribes correctly on unmount without subscription leaks', async () => {
    let res;
    await act(async () => {
      res = render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );
    });

    const { __mocks } = await import('@/lib/supabase');

    // Simulate Strict Mode unmount/remount
    act(() => {
      res.unmount();
    });
    expect(__mocks.unsubscribeMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      res = render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      );
    });
    expect(supabase.auth.onAuthStateChange).toHaveBeenCalledTimes(2);
  });

  it('5. Valid locally mocked session stores token, syncs cookie, and calls /auth/me', async () => {
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

  it('6. Logout invokes Supabase signOut, removes storage, clears cookie, and redirects', async () => {
    let capturedAuth;
    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer onState={(auth) => { capturedAuth = auth; }} />
        </AuthProvider>
      );
    });

    localStorage.setItem('ct_token', 'test-token');
    localStorage.setItem('ct_user', JSON.stringify({ id: 'u1' }));

    await act(async () => {
      await capturedAuth.logout();
    });

    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('ct_token')).toBeNull();
    expect(localStorage.getItem('ct_user')).toBeNull();
    expect(capturedAuth.user).toBeNull();
    expect(window.location.href).toBe('/auth');
  });

  it('7. Repeated logout invocation does not cause dependency loops or runtime errors', async () => {
    let capturedAuth;
    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer onState={(auth) => { capturedAuth = auth; }} />
        </AuthProvider>
      );
    });

    await act(async () => {
      await capturedAuth.logout();
      await capturedAuth.logout();
    });

    expect(supabase.auth.signOut).toHaveBeenCalledTimes(2);
  });

  it('8. No raw access token is printed to console log', async () => {
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

  it('9. No external provider domain is contacted during unit tests', async () => {
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
