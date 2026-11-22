import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuthPage from '@/app/auth/page';
import { useAuth } from '@/lib/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mockCreateSupabaseServerClient = vi.fn();
const mockSendSMTPEmail = vi.fn();
const mockApiPost = vi.fn();
const mockToastInfo = vi.fn();
const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn().mockReturnValue(new URLSearchParams()),
}));

vi.mock('@/lib/supabaseServer', () => ({
  createSupabaseServerClient: (...args) => mockCreateSupabaseServerClient(...args),
}));

vi.mock('@/lib/smtp', () => ({
  sendSMTPEmail: (...args) => mockSendSMTPEmail(...args),
}));

vi.mock('@/lib/api', () => ({
  default: { post: (...args) => mockApiPost(...args) },
}));

vi.mock('sonner', () => ({
  toast: {
    info: (...args) => mockToastInfo(...args),
    success: (...args) => mockToastSuccess(...args),
    error: (...args) => mockToastError(...args),
  },
}));

import { POST as signupPOST } from '@/app/api/auth/signup/route';
import {
  POST as resendPOST,
  createMemoryCooldownStore,
  setResendCooldownStore,
  __resetResendCooldownForTests,
} from '@/app/api/auth/resend-verification/route';

describe('AuthPage & V7 Auth Recovery Controls', () => {
  const mockReplace = vi.fn();
  const origDryRun = process.env.CAREERTWIN_DRY_RUN_EMAIL;
  const origPublicUrl = process.env.NEXT_PUBLIC_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    setResendCooldownStore(createMemoryCooldownStore());
    __resetResendCooldownForTests();
    process.env.CAREERTWIN_DRY_RUN_EMAIL = 'false';
    process.env.NEXT_PUBLIC_URL = 'https://synthetic.example.invalid';
    useSearchParams.mockReturnValue(new URLSearchParams());
    useRouter.mockReturnValue({
      replace: mockReplace,
      push: vi.fn(),
    });
  });

  afterEach(() => {
    process.env.CAREERTWIN_DRY_RUN_EMAIL = origDryRun;
    process.env.NEXT_PUBLIC_URL = origPublicUrl;
  });

  it('redirects to /employer if user is an employer', async () => {
    useAuth.mockReturnValue({ user: { role: 'employer' }, loading: false, login: vi.fn(), register: vi.fn(), loginWithProvider: vi.fn() });
    render(<AuthPage />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/employer');
    });
  });

  it('redirects to /candidate/onboarding if user is a candidate', async () => {
    useAuth.mockReturnValue({ user: { role: 'candidate' }, loading: false, login: vi.fn(), register: vi.fn(), loginWithProvider: vi.fn() });
    render(<AuthPage />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/candidate/onboarding');
    });
  });

  it('shows login form if no user is present without unsubstantiated claims', () => {
    useAuth.mockReturnValue({ user: null, loading: false, login: vi.fn(), register: vi.fn(), loginWithProvider: vi.fn() });
    render(<AuthPage />);
    expect(screen.getByTestId('auth-page')).toBeInTheDocument();
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
    expect(screen.queryByText(/70%/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/GDPR compliant/i)).not.toBeInTheDocument();
  });

  it('R3 & V6-R4: handles sent, failed (503), dry-run, duplicate (400), returned link error (500), and thrown link exception (500 with account_created=true)', async () => {
    // 1. Successful delivery
    mockCreateSupabaseServerClient.mockResolvedValueOnce({
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'a@example.invalid' } }, error: null }),
          generateLink: vi.fn().mockResolvedValue({ data: { properties: { hashed_token: 'secret-token-hash' } }, error: null }),
        },
      },
    });
    mockSendSMTPEmail.mockResolvedValueOnce({ messageId: 'msg-1' });
    const okRes = await signupPOST(new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email: 'a@example.invalid', password: 'Password123!' }),
    }));
    const okBody = await okRes.json();
    expect(okRes.status).toBe(200);
    expect(okBody.delivery_status).toBe('sent');
    expect(okBody.email_sent).toBe(true);
    expect(JSON.stringify(okBody)).not.toContain('secret-token-hash');

    // 2. SMTP failure -> 503
    mockCreateSupabaseServerClient.mockResolvedValueOnce({
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'a@example.invalid' } }, error: null }),
          generateLink: vi.fn().mockResolvedValue({ data: { properties: { hashed_token: 'secret-token-hash' } }, error: null }),
        },
      },
    });
    mockSendSMTPEmail.mockRejectedValueOnce(new Error('SMTP ECONNREFUSED internal-host:587'));
    const failRes = await signupPOST(new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email: 'a@example.invalid', password: 'Password123!' }),
    }));
    const failBody = await failRes.json();
    expect(failRes.status).toBe(503);
    expect(failBody.account_created).toBe(true);
    expect(failBody.delivery_status).toBe('failed');
    expect(failBody.retry_supported).toBe(true);
    expect(failBody.message).not.toMatch(/check your email/i);
    expect(JSON.stringify(failBody)).not.toContain('ECONNREFUSED');

    // 3. Dry-run suppression
    process.env.CAREERTWIN_DRY_RUN_EMAIL = 'true';
    mockCreateSupabaseServerClient.mockResolvedValueOnce({
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'a@example.invalid' } }, error: null }),
          generateLink: vi.fn().mockResolvedValue({ data: { properties: { hashed_token: 'secret-token-hash' } }, error: null }),
        },
      },
    });
    const dryRes = await signupPOST(new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email: 'a@example.invalid', password: 'Password123!' }),
    }));
    const dryBody = await dryRes.json();
    expect(dryRes.status).toBe(200);
    expect(dryBody.delivery_status).toBe('suppressed_dry_run');
    expect(dryBody.email_sent).toBe(false);
    process.env.CAREERTWIN_DRY_RUN_EMAIL = 'false';

    // 4. Returned link error (500) preserves account_created & retry_supported
    mockCreateSupabaseServerClient.mockResolvedValueOnce({
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u2' } }, error: null }),
          generateLink: vi.fn().mockResolvedValue({ data: null, error: { message: 'Link failure' } }),
        },
      },
    });
    const retErrRes = await signupPOST(new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email: 'retfail@example.invalid', password: 'Password123!' }),
    }));
    const retErrBody = await retErrRes.json();
    expect(retErrRes.status).toBe(500);
    expect(retErrBody.account_created).toBe(true);
    expect(retErrBody.delivery_status).toBe('not_attempted');
    expect(retErrBody.retry_supported).toBe(true);

    // 5. V6-R4: Thrown generateLink exception ALSO preserves account_created & retry_supported
    mockCreateSupabaseServerClient.mockResolvedValueOnce({
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u3' } }, error: null }),
          generateLink: vi.fn().mockRejectedValue(new Error('Unexpected network throw')),
        },
      },
    });
    const throwRes = await signupPOST(new Request('http://localhost/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email: 'throw@example.invalid', password: 'Password123!' }),
    }));
    const throwBody = await throwRes.json();
    expect(throwRes.status).toBe(500);
    expect(throwBody.error).toBe('VERIFICATION_LINK_FAILED');
    expect(throwBody.account_created).toBe(true);
    expect(throwBody.delivery_status).toBe('not_attempted');
    expect(throwBody.retry_supported).toBe(true);
  });

  it('V6-R1: admits at most 1 of 8 concurrent resend requests in a single instance and verifies adapter interface', async () => {
    const createUserSpy = vi.fn();
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        admin: {
          createUser: createUserSpy,
          listUsers: vi.fn().mockImplementation(async () => {
            await new Promise((r) => setTimeout(r, 15));
            return {
              data: { users: [{ id: 'u1', email: 'race@example.invalid', email_confirmed_at: null }], nextPage: null },
              error: null,
            };
          }),
          generateLink: vi.fn().mockResolvedValue({ data: { properties: { hashed_token: 'race-hash' } }, error: null }),
        },
      },
    });
    mockSendSMTPEmail.mockResolvedValue({ messageId: 'msg-race' });

    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        resendPOST(new Request('http://localhost/api/auth/resend-verification', {
          method: 'POST',
          body: JSON.stringify({ email: 'race@example.invalid' }),
        }))
      )
    );
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 429)).toHaveLength(7);
    expect(mockSendSMTPEmail).toHaveBeenCalledTimes(1);
    expect(createUserSpy).not.toHaveBeenCalled();

    // Adapter interface check (single process; multi-instance hosting requires external shared store)
    const injectedStore = createMemoryCooldownStore();
    setResendCooldownStore(injectedStore);
    const r1 = await resendPOST(new Request('http://localhost/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'adapter@example.invalid' }),
    }));
    const r2 = await resendPOST(new Request('http://localhost/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'adapter@example.invalid' }),
    }));
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(429);
  });

  it('V6-R2, V7-P1 & V6-R3: paginates past page 20, fails 503 on malformed lookup, and returns identical non-enumerating 200 across success and failure branches', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => ({
      id: `u-${i}`,
      email: `other${i}@example.invalid`,
      email_confirmed_at: null,
    }));

    // 1. Unconfirmed user on page 21 (past old 20-page cap)
    mockCreateSupabaseServerClient.mockResolvedValueOnce({
      auth: {
        admin: {
          listUsers: vi.fn().mockImplementation(async ({ page }) => ({
            data: {
              users: page === 21 ? [{ id: 'p21-user', email: 'page21@example.invalid', email_confirmed_at: null }] : firstPage,
              nextPage: page === 21 ? null : page + 1,
              lastPage: 21,
            },
            error: null,
          })),
          generateLink: vi.fn().mockResolvedValue({ data: { properties: { hashed_token: 'p21-hash' } }, error: null }),
        },
      },
    });
    mockSendSMTPEmail.mockResolvedValueOnce({ messageId: 'msg-p21' });
    const p21Res = await resendPOST(new Request('http://localhost/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'page21@example.invalid' }),
    }));
    expect(p21Res.status).toBe(200);
    expect(mockSendSMTPEmail).toHaveBeenCalledTimes(1);

    // 2. Absent email
    mockCreateSupabaseServerClient.mockResolvedValueOnce({
      auth: { admin: { listUsers: vi.fn().mockResolvedValue({ data: { users: [], nextPage: null }, error: null }) } },
    });
    const absentRes = await resendPOST(new Request('http://localhost/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'absent@example.invalid' }),
    }));

    // 3. Confirmed email
    mockCreateSupabaseServerClient.mockResolvedValueOnce({
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({
            data: { users: [{ id: 'c1', email: 'confirmed@example.invalid', email_confirmed_at: '2026-11-20T00:00:00Z' }], nextPage: null },
            error: null,
          }),
        },
      },
    });
    const confirmedRes = await resendPOST(new Request('http://localhost/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'confirmed@example.invalid' }),
    }));

    // 4. Unconfirmed + SMTP failure -> public response stays identical 200 accepted
    mockCreateSupabaseServerClient.mockResolvedValueOnce({
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({
            data: { users: [{ id: 'u-smtp', email: 'smtpfail@example.invalid', email_confirmed_at: null }], nextPage: null },
            error: null,
          }),
          generateLink: vi.fn().mockResolvedValue({ data: { properties: { hashed_token: 'h' } }, error: null }),
        },
      },
    });
    mockSendSMTPEmail.mockRejectedValueOnce(new Error('SMTP down'));
    const smtpFailRes = await resendPOST(new Request('http://localhost/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'smtpfail@example.invalid' }),
    }));

    // 5. Unconfirmed + thrown generateLink -> public response stays identical 200 accepted
    mockCreateSupabaseServerClient.mockResolvedValueOnce({
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({
            data: { users: [{ id: 'u-link', email: 'linkthrow@example.invalid', email_confirmed_at: null }], nextPage: null },
            error: null,
          }),
          generateLink: vi.fn().mockRejectedValue(new Error('Link throw')),
        },
      },
    });
    const linkThrowRes = await resendPOST(new Request('http://localhost/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'linkthrow@example.invalid' }),
    }));

    // 6. Malformed directory payload -> 503 VERIFICATION_LOOKUP_UNAVAILABLE
    mockCreateSupabaseServerClient.mockResolvedValueOnce({
      auth: { admin: { listUsers: vi.fn().mockResolvedValue({ data: { users: null }, error: null }) } },
    });
    const malformedLookupRes = await resendPOST(new Request('http://localhost/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'malformed@example.invalid' }),
    }));
    expect(malformedLookupRes.status).toBe(503);

    // 7. V8-C2: Malformed optional getUserByEmail payload -> 503 (never treated as absence)
    mockCreateSupabaseServerClient.mockResolvedValueOnce({
      auth: { admin: { getUserByEmail: vi.fn().mockResolvedValue({ data: { unexpected: true }, error: null }) } },
    });
    const malformedDirectRes = await resendPOST(new Request('http://localhost/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'directmalformed@example.invalid' }),
    }));
    expect(malformedDirectRes.status).toBe(503);

    // 8. V8-R2 & V9-R2: Oversized (lastPage: 1001) AND missing-lastPage (nextPage: 2 without lastPage) return uniform 503 on BOTH page-1 match and absent
    const oversizedDir = (emailMatch, extra = { lastPage: 1001 }) => ({
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue({
            data: { users: emailMatch ? [{ id: 'p1', email: emailMatch, email_confirmed_at: null }] : [], nextPage: 2, ...extra },
            error: null,
          }),
        },
      },
    });
    mockCreateSupabaseServerClient.mockResolvedValueOnce(oversizedDir('p1over@example.invalid', { lastPage: 1001 }));
    const overKnown = await resendPOST(new Request('http://localhost/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'p1over@example.invalid' }),
    }));
    mockCreateSupabaseServerClient.mockResolvedValueOnce(oversizedDir(null, { lastPage: 1001 }));
    const overAbsent = await resendPOST(new Request('http://localhost/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'absentover@example.invalid' }),
    }));
    mockCreateSupabaseServerClient.mockResolvedValueOnce(oversizedDir('p1nolast@example.invalid', {}));
    const noLastKnown = await resendPOST(new Request('http://localhost/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'p1nolast@example.invalid' }),
    }));
    mockCreateSupabaseServerClient.mockResolvedValueOnce(oversizedDir(null, {}));
    const noLastAbsent = await resendPOST(new Request('http://localhost/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'absentnolast@example.invalid' }),
    }));
    expect(overKnown.status).toBe(503);
    expect(overAbsent.status).toBe(503);
    expect(noLastKnown.status).toBe(503);
    expect(noLastAbsent.status).toBe(503);

    // 9. V8-R1: Aggregate endpoint directory budget (50 calls) blocks distinct-address amplification with 429
    __resetResendCooldownForTests();
    let totalLookups = 0;
    mockCreateSupabaseServerClient.mockResolvedValue({
      auth: {
        admin: {
          listUsers: vi.fn().mockImplementation(async ({ page }) => {
            totalLookups++;
            return { data: { users: firstPage, nextPage: page + 1, lastPage: 25 }, error: null };
          }),
        },
      },
    });
    const rA = await resendPOST(new Request('http://localhost/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'amp1@example.invalid' }),
    }));
    const rB = await resendPOST(new Request('http://localhost/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'amp2@example.invalid' }),
    }));
    const rC = await resendPOST(new Request('http://localhost/api/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email: 'amp3@example.invalid' }),
    }));
    expect(rA.status).toBe(503);
    expect(rB.status).toBe(503);
    expect(rC.status).toBe(429);
    expect(totalLookups).toBeLessThanOrEqual(50);

    // 10. V8-R3 & V9-R1: Invalid capacity throws, expired keys are pruned, and active keys are NEVER evicted under capacity churn
    expect(() => createMemoryCooldownStore({ maxEntries: 0 })).toThrow(RangeError);
    const store = createMemoryCooldownStore({ maxEntries: 2 });
    const realNow = Date.now;
    let fakeNow = 1_000_000;
    Date.now = () => fakeNow;
    try {
      expect(store.tryReserve('a@example.invalid', 60_000).admitted).toBe(true);
      expect(store.tryReserve('b@example.invalid', 60_000).admitted).toBe(true);
      // C is rejected (capacity full) without evicting active A or B
      const cRes = store.tryReserve('c@example.invalid', 60_000);
      expect(cRes.admitted).toBe(false);
      expect(cRes.capacityLimited).toBe(true);
      // A is still blocked by its active cooldown
      expect(store.tryReserve('a@example.invalid', 60_000).admitted).toBe(false);
      // Advance past expiry -> expired keys are pruned and fresh key succeeds
      fakeNow += 60_001;
      expect(store.tryReserve('fresh@example.invalid', 60_000).admitted).toBe(true);
      expect(store.size()).toBe(1);
    } finally {
      Date.now = realNow;
    }

    const b1 = await p21Res.json();
    const b2 = await absentRes.json();
    const b3 = await confirmedRes.json();
    const b4 = await smtpFailRes.json();
    const b5 = await linkThrowRes.json();
    expect(smtpFailRes.status).toBe(200);
    expect(linkThrowRes.status).toBe(200);
    expect(b1).toEqual(b2);
    expect(b1).toEqual(b3);
    expect(b1).toEqual(b4);
    expect(b1).toEqual(b5);
    expect(b1.delivery_status).toBe('accepted');
  });

  it('R3 UI: renders delivery failure notice and resends verification without re-calling register', async () => {
    useSearchParams.mockReturnValue(new URLSearchParams('tab=register'));
    const err = new Error('Account was created, but we could not send the verification email. Please retry sending the verification email.');
    err.accountCreated = true;
    err.deliveryStatus = 'failed';
    err.retrySupported = true;
    const mockRegister = vi.fn().mockRejectedValueOnce(err);
    useAuth.mockReturnValue({ user: null, loading: false, login: vi.fn(), register: mockRegister, loginWithProvider: vi.fn() });
    mockApiPost.mockResolvedValueOnce({
      data: { delivery_status: 'accepted', message: 'If an unverified account exists for this email, a verification email will be sent.' },
    });

    render(<AuthPage />);
    fireEvent.change(screen.getByTestId('name-input'), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByTestId('email-input'), { target: { value: 'alice@acme.invalid' } });
    fireEvent.change(screen.getByTestId('password-input'), { target: { value: 'Password123!' } });
    fireEvent.click(screen.getByTestId('register-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('signup-delivery-notice').textContent).toContain('could not send the verification email');
    });
    expect(mockToastSuccess).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('resend-verification-btn'));
    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/auth/resend-verification', { email: 'alice@acme.invalid' });
    });
    expect(mockRegister).toHaveBeenCalledTimes(1);
  });
});
