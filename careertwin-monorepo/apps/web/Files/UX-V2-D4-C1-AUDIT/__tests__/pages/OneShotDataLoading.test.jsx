import { render, screen, waitFor, act } from '@testing-library/react';
import { Suspense } from 'react';
import ProofProfilePage from '@/app/candidate/proof-profile/[candidateId]/page';
import CandidateScreenPage from '@/app/candidate/screen/[sessionId]/page';
import DecisionPacketPage from '@/app/employer/packet/[extractionId]/page';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
  usePathname: vi.fn().mockReturnValue('/employer/packet/packet-test-password-not-secret'),
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// ── 1. Proof Profile Page Suite ──────────────────────────────────
describe('One-Shot Data Loading Effects (ProofProfilePage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRouter.mockReturnValue({ push: vi.fn() });
    useAuth.mockReturnValue({ user: { id: 'cand-1' }, logout: vi.fn() });

    api.get.mockImplementation(async (url) => {
      if (url.includes('cand-test-password-not-secret')) {
        return {
          data: {
            candidate: { id: 'cand-test-password-not-secret', name: 'Jane Doe', location: 'Remote', target_roles: ['Engineer'] },
            proof_profile: null,
          },
        };
      }
      if (url.includes('cand-456')) {
        return {
          data: {
            candidate: { id: 'cand-456', name: 'John Smith', location: 'NY', target_roles: ['Designer'] },
            proof_profile: { summary: 'Established proof', proof_completeness: 0.95, proof_strength: 0.9 },
          },
        };
      }
      if (url.includes('cand-789')) {
        return {
          data: {
            candidate: { id: 'cand-789', name: 'Alice Walker', location: 'SF', target_roles: ['Product'] },
            proof_profile: { summary: 'Existing proof', proof_completeness: 0.88, proof_strength: 0.85 },
          },
        };
      }
      return { data: {} };
    });

    api.post.mockResolvedValue({ data: { message: 'Generated' } });
  });

  const renderPage = async (candidateId) => {
    const paramsPromise = Promise.resolve({ candidateId });
    let result;
    await act(async () => {
      result = render(
        <Suspense fallback={<div>Loading...</div>}>
          <ProofProfilePage params={paramsPromise} />
        </Suspense>
      );
    });
    return result;
  };

  it('makes initial data fetch request exactly once on mount', async () => {
    await renderPage('cand-456');

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/candidate/proof-profile/cand-456');
    });

    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('does not re-fetch when rerendered with the same candidateId', async () => {
    const paramsPromise = Promise.resolve({ candidateId: 'cand-456' });
    let res;
    await act(async () => {
      res = render(
        <Suspense fallback={<div>Loading...</div>}>
          <ProofProfilePage params={paramsPromise} />
        </Suspense>
      );
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/candidate/proof-profile/cand-456');
    });
    expect(api.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      res.rerender(
        <Suspense fallback={<div>Loading...</div>}>
          <ProofProfilePage params={paramsPromise} />
        </Suspense>
      );
    });

    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('triggers a new fetch request when candidateId changes', async () => {
    const params1 = Promise.resolve({ candidateId: 'cand-456' });
    let res;
    await act(async () => {
      res = render(
        <Suspense fallback={<div>Loading...</div>}>
          <ProofProfilePage params={params1} />
        </Suspense>
      );
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/candidate/proof-profile/cand-456');
    });
    expect(api.get).toHaveBeenCalledTimes(1);

    const params2 = Promise.resolve({ candidateId: 'cand-789' });
    await act(async () => {
      res.rerender(
        <Suspense fallback={<div>Loading...</div>}>
          <ProofProfilePage params={params2} />
        </Suspense>
      );
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/candidate/proof-profile/cand-789');
    });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('auto-generation remains single-shot under the ref guard', async () => {
    await renderPage('cand-test-password-not-secret');

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/candidate/proof-profile/cand-test-password-not-secret');
    });

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/candidate/proof-profile/cand-test-password-not-secret/generate');
    });

    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it('contacts zero external provider endpoints', async () => {
    await renderPage('cand-456');

    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    });

    const calls = api.get.mock.calls;
    calls.forEach(([url]) => {
      expect(url.startsWith('/candidate/proof-profile/')).toBe(true);
      expect(url.includes('supabase.co')).toBe(false);
      expect(url.includes('googleapis.com')).toBe(false);
    });
  });
});

// ── 2. Candidate Screen Page Suite ────────────────────────────────
describe('One-Shot Data Loading Effects (CandidateScreenPage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRouter.mockReturnValue({ push: vi.fn() });
    useAuth.mockReturnValue({ user: { id: 'cand-1' }, logout: vi.fn() });

    api.get.mockImplementation(async (url) => {
      return {
        data: {
          session: { id: url.split('/').pop(), status: 'in_progress', questions: [{ id: 'q1', text: 'Sample Q' }] },
          answers: [],
        },
      };
    });
  });

  it('makes initial screening data request exactly once on mount', async () => {
    const paramsPromise = Promise.resolve({ sessionId: 'screen-test-password-not-secret' });
    await act(async () => {
      render(
        <Suspense fallback={<div>Loading...</div>}>
          <CandidateScreenPage params={paramsPromise} />
        </Suspense>
      );
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/candidate/screening-sessions/screen-test-password-not-secret');
    });
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('does not re-fetch screening data when rerendered with the same sessionId', async () => {
    const paramsPromise = Promise.resolve({ sessionId: 'screen-test-password-not-secret' });
    let res;
    await act(async () => {
      res = render(
        <Suspense fallback={<div>Loading...</div>}>
          <CandidateScreenPage params={paramsPromise} />
        </Suspense>
      );
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/candidate/screening-sessions/screen-test-password-not-secret');
    });
    expect(api.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      res.rerender(
        <Suspense fallback={<div>Loading...</div>}>
          <CandidateScreenPage params={paramsPromise} />
        </Suspense>
      );
    });

    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('triggers a new fetch request when sessionId changes', async () => {
    const params1 = Promise.resolve({ sessionId: 'screen-test-password-not-secret' });
    let res;
    await act(async () => {
      res = render(
        <Suspense fallback={<div>Loading...</div>}>
          <CandidateScreenPage params={params1} />
        </Suspense>
      );
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/candidate/screening-sessions/screen-test-password-not-secret');
    });
    expect(api.get).toHaveBeenCalledTimes(1);

    const params2 = Promise.resolve({ sessionId: 'screen-456' });
    await act(async () => {
      res.rerender(
        <Suspense fallback={<div>Loading...</div>}>
          <CandidateScreenPage params={params2} />
        </Suspense>
      );
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/candidate/screening-sessions/screen-456');
    });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('does not submit answers or complete session on load', async () => {
    const paramsPromise = Promise.resolve({ sessionId: 'screen-test-password-not-secret' });
    await act(async () => {
      render(
        <Suspense fallback={<div>Loading...</div>}>
          <CandidateScreenPage params={paramsPromise} />
        </Suspense>
      );
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    });

    expect(api.post).not.toHaveBeenCalled();
  });

  it('contacts zero external provider endpoints during screening load', async () => {
    const paramsPromise = Promise.resolve({ sessionId: 'screen-test-password-not-secret' });
    await act(async () => {
      render(
        <Suspense fallback={<div>Loading...</div>}>
          <CandidateScreenPage params={paramsPromise} />
        </Suspense>
      );
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    });

    api.get.mock.calls.forEach(([url]) => {
      expect(url.startsWith('/candidate/screening-sessions/')).toBe(true);
      expect(url.includes('supabase.co')).toBe(false);
      expect(url.includes('googleapis.com')).toBe(false);
    });
  });
});

// ── 3. Decision Packet Page Suite ──────────────────────────────────
describe('One-Shot Data Loading Effects (DecisionPacketPage)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRouter.mockReturnValue({ push: vi.fn() });
    useAuth.mockReturnValue({ user: { id: 'emp-1' }, logout: vi.fn() });

    api.get.mockImplementation(async (url) => {
      return {
        data: {
          packet: { id: 'pkt-1', summary: 'Sample Packet', verified_claims: [] },
          extraction: { candidate_name: 'Test Candidate' },
        },
      };
    });
  });

  it('makes initial packet request starting with /employer/packets/packet-test-password-not-secret', async () => {
    const paramsPromise = Promise.resolve({ extractionId: 'packet-test-password-not-secret' });
    await act(async () => {
      render(
        <Suspense fallback={<div>Loading...</div>}>
          <DecisionPacketPage params={paramsPromise} />
        </Suspense>
      );
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    });

    const url = api.get.mock.calls[0][0];
    expect(url.startsWith('/employer/packets/packet-test-password-not-secret')).toBe(true);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('does not re-fetch packet when rerendered with the same extractionId', async () => {
    const paramsPromise = Promise.resolve({ extractionId: 'packet-test-password-not-secret' });
    let res;
    await act(async () => {
      res = render(
        <Suspense fallback={<div>Loading...</div>}>
          <DecisionPacketPage params={paramsPromise} />
        </Suspense>
      );
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    });
    expect(api.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      res.rerender(
        <Suspense fallback={<div>Loading...</div>}>
          <DecisionPacketPage params={paramsPromise} />
        </Suspense>
      );
    });

    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('triggers a new fetch request starting with /employer/packets/packet-456 when extractionId changes', async () => {
    const params1 = Promise.resolve({ extractionId: 'packet-test-password-not-secret' });
    let res;
    await act(async () => {
      res = render(
        <Suspense fallback={<div>Loading...</div>}>
          <DecisionPacketPage params={params1} />
        </Suspense>
      );
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    });
    expect(api.get).toHaveBeenCalledTimes(1);

    const params2 = Promise.resolve({ extractionId: 'packet-456' });
    await act(async () => {
      res.rerender(
        <Suspense fallback={<div>Loading...</div>}>
          <DecisionPacketPage params={params2} />
        </Suspense>
      );
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2);
    });

    const secondUrl = api.get.mock.calls[1][0];
    expect(secondUrl.startsWith('/employer/packets/packet-456')).toBe(true);
  });

  it('contacts zero generate or action POST endpoints during packet load', async () => {
    const paramsPromise = Promise.resolve({ extractionId: 'packet-test-password-not-secret' });
    await act(async () => {
      render(
        <Suspense fallback={<div>Loading...</div>}>
          <DecisionPacketPage params={paramsPromise} />
        </Suspense>
      );
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    });

    expect(api.post).not.toHaveBeenCalled();
  });

  it('contacts zero external provider endpoints during packet load', async () => {
    const paramsPromise = Promise.resolve({ extractionId: 'packet-test-password-not-secret' });
    await act(async () => {
      render(
        <Suspense fallback={<div>Loading...</div>}>
          <DecisionPacketPage params={paramsPromise} />
        </Suspense>
      );
    });

    await waitFor(() => {
      expect(api.get).toHaveBeenCalled();
    });

    api.get.mock.calls.forEach(([url]) => {
      expect(url.startsWith('/employer/packets/')).toBe(true);
      expect(url.includes('supabase.co')).toBe(false);
      expect(url.includes('googleapis.com')).toBe(false);
    });
  });
});
