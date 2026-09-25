import { render, screen, act } from '@testing-library/react';
import { Suspense } from 'react';
import SourcingSessionPage from '@/app/employer/sourcing-session/[id]/page';
import { useAuth } from '@/lib/auth';
import { useRouter, usePathname } from 'next/navigation';
import api from '@/lib/api';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn().mockReturnValue('/employer/sourcing-session/source-test-password-not-secret'),
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('Sourcing Session Polling Effects (SourcingSessionPage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    useRouter.mockReturnValue({ push: vi.fn() });
    useAuth.mockReturnValue({ user: { id: 'emp-1' }, logout: vi.fn() });

    api.get.mockImplementation(async (url) => {
      if (url.includes('/employer/sourcing-sessions/')) {
        return {
          data: {
            session: { id: url.split('/').pop(), status: 'active', hiring_run_id: 'run-1', agent_running: true },
            events: [],
            candidates: [],
          },
        };
      }
      if (url.includes('/employer/brief/')) {
        return {
          data: {
            brief: { role_title: 'Senior Backend Engineer' },
          },
        };
      }
      return { data: {} };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderSession = async (id) => {
    const paramsPromise = Promise.resolve({ id });
    let result;
    await act(async () => {
      result = render(
        <Suspense fallback={<div>Loading...</div>}>
          <SourcingSessionPage params={paramsPromise} />
        </Suspense>
      );
    });
    return result;
  };

  it('1. Initial mount with id source-test-password-not-secret makes exactly 1 immediate session GET request', async () => {
    await renderSession('source-test-password-not-secret');

    const sessionCalls = api.get.mock.calls.filter(([url]) => url.startsWith('/employer/sourcing-sessions/'));
    expect(sessionCalls.length).toBe(1);
    expect(sessionCalls[0][0]).toBe('/employer/sourcing-sessions/source-test-password-not-secret');
  });

  it('2. Before 3000ms passes (at 2999ms), 0 polling GET requests occur beyond initial request', async () => {
    await renderSession('source-test-password-not-secret');

    const initialCount = api.get.mock.calls.filter(([url]) => url.startsWith('/employer/sourcing-sessions/')).length;
    expect(initialCount).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(2999);
    });

    const countAt2999 = api.get.mock.calls.filter(([url]) => url.startsWith('/employer/sourcing-sessions/')).length;
    expect(countAt2999).toBe(1);
  });

  it('3. At 3000ms, exactly 1 additional polling GET request occurs', async () => {
    await renderSession('source-test-password-not-secret');

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    const sessionCalls = api.get.mock.calls.filter(([url]) => url.startsWith('/employer/sourcing-sessions/'));
    expect(sessionCalls.length).toBe(2);
  });

  it('4. At 6000ms, exactly 2 additional polling GET requests occur total after initial request', async () => {
    await renderSession('source-test-password-not-secret');

    await act(async () => {
      vi.advanceTimersByTime(6000);
    });

    const sessionCalls = api.get.mock.calls.filter(([url]) => url.startsWith('/employer/sourcing-sessions/'));
    expect(sessionCalls.length).toBe(3); // 1 initial + 2 polls
  });

  it('5. Ordinary rerender with the same id creates no additional interval (rate stays 1 poll per 3000ms)', async () => {
    const paramsPromise = Promise.resolve({ id: 'source-test-password-not-secret' });
    let res;
    await act(async () => {
      res = render(
        <Suspense fallback={<div>Loading...</div>}>
          <SourcingSessionPage params={paramsPromise} />
        </Suspense>
      );
    });

    // Rerender with same props
    await act(async () => {
      res.rerender(
        <Suspense fallback={<div>Loading...</div>}>
          <SourcingSessionPage params={paramsPromise} />
        </Suspense>
      );
    });

    // Advance 3000ms
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    const sessionCalls = api.get.mock.calls.filter(([url]) => url.startsWith('/employer/sourcing-sessions/'));
    expect(sessionCalls.length).toBe(2); // 1 initial + 1 poll at 3000ms (not 2 or 3)
  });

  it('6. Changing id cleans up previous interval, fires 1 immediate GET for new id, and continues single interval', async () => {
    const params1 = Promise.resolve({ id: 'source-test-password-not-secret' });
    let res;
    await act(async () => {
      res = render(
        <Suspense fallback={<div>Loading...</div>}>
          <SourcingSessionPage params={params1} />
        </Suspense>
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    // 1 initial + 1 poll for source-test-password-not-secret = 2 calls
    expect(api.get.mock.calls.filter(([url]) => url.startsWith('/employer/sourcing-sessions/source-test-password-not-secret')).length).toBe(2);

    // Switch id to source-456
    const params2 = Promise.resolve({ id: 'source-456' });
    await act(async () => {
      res.rerender(
        <Suspense fallback={<div>Loading...</div>}>
          <SourcingSessionPage params={params2} />
        </Suspense>
      );
    });

    // Immediate initial GET for source-456
    expect(api.get.mock.calls.filter(([url]) => url.startsWith('/employer/sourcing-sessions/source-456')).length).toBe(1);

    // Advance 3000ms
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    // Exactly 1 new poll for source-456, and 0 new polls for source-test-password-not-secret
    expect(api.get.mock.calls.filter(([url]) => url.startsWith('/employer/sourcing-sessions/source-456')).length).toBe(2);
    expect(api.get.mock.calls.filter(([url]) => url.startsWith('/employer/sourcing-sessions/source-test-password-not-secret')).length).toBe(2);
  });

  it('7. Unmounting component stops polling; advancing timers causes 0 further requests', async () => {
    const paramsPromise = Promise.resolve({ id: 'source-test-password-not-secret' });
    let res;
    await act(async () => {
      res = render(
        <Suspense fallback={<div>Loading...</div>}>
          <SourcingSessionPage params={paramsPromise} />
        </Suspense>
      );
    });

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    const countBeforeUnmount = api.get.mock.calls.filter(([url]) => url.startsWith('/employer/sourcing-sessions/')).length;
    expect(countBeforeUnmount).toBe(2);

    // Unmount component
    act(() => {
      res.unmount();
    });

    // Advance timers by 10 seconds
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    const countAfterUnmount = api.get.mock.calls.filter(([url]) => url.startsWith('/employer/sourcing-sessions/')).length;
    expect(countAfterUnmount).toBe(2); // No new calls post-unmount
  });

  it('8. No auto-source or other POST request occurs during polling', async () => {
    await renderSession('source-test-password-not-secret');

    await act(async () => {
      vi.advanceTimersByTime(9000);
    });

    expect(api.post).not.toHaveBeenCalled();
  });

  it('9. No external provider domain is contacted', async () => {
    await renderSession('source-test-password-not-secret');

    await act(async () => {
      vi.advanceTimersByTime(9000);
    });

    api.get.mock.calls.forEach(([url]) => {
      expect(url.startsWith('/employer/')).toBe(true);
      expect(url.includes('supabase.co')).toBe(false);
      expect(url.includes('googleapis.com')).toBe(false);
      expect(url.includes('crustdata.com')).toBe(false);
    });
  });
});
