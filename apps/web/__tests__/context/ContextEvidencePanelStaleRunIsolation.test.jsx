/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import ContextEvidencePanel from '@/components/context/ContextEvidencePanel';
import api from '@/lib/api';

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('ContextEvidencePanel — Stale Request Cancellation & Run Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Deliberately out-of-order responses across two runs ignore stale run responses', async () => {
    let resolveRunA;
    let resolveRunB;

    const promiseRunA = new Promise((resolve) => {
      resolveRunA = resolve;
    });

    const promiseRunB = new Promise((resolve) => {
      resolveRunB = resolve;
    });

    api.get.mockImplementation((url) => {
      if (url.includes('run_alpha')) return promiseRunA;
      if (url.includes('run_beta')) return promiseRunB;
      return Promise.resolve({ data: { sources: [] } });
    });

    // Mount initially with run_alpha (refresh runs after microtask reset in useEffect)
    const { rerender } = render(<ContextEvidencePanel hiringRunId="run_alpha" />);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('run_alpha'), expect.any(Object));
    });

    // Immediately switch to run_beta while run_alpha request is still in-flight
    rerender(<ContextEvidencePanel hiringRunId="run_beta" />);
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringContaining('run_beta'), expect.any(Object));
    });

    // Fast-resolve run_beta first with beta documents
    await act(async () => {
      resolveRunB({
        data: {
          sources: [
            {
              source_id: 'src_beta_01',
              source_key: 'beta_doc.pdf',
              version: 1,
              state: 'completed',
            },
          ],
        },
      });
    });

    // Verify run_beta's source appears
    await waitFor(() => {
      expect(screen.getByText('beta_doc.pdf')).toBeInTheDocument();
    });

    // Now deliberately resolve the slower/stale run_alpha response out-of-order
    await act(async () => {
      resolveRunA({
        data: {
          sources: [
            {
              source_id: 'src_alpha_01',
              source_key: 'alpha_stale_doc.pdf',
              version: 1,
              state: 'completed',
            },
          ],
        },
      });
    });

    // Assert that alpha_stale_doc.pdf did NOT overwrite run_beta's state
    expect(screen.queryByText('alpha_stale_doc.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('beta_doc.pdf')).toBeInTheDocument();
  });

  it('2. Switching runs immediately clears prior run state, error, and selected items', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        sources: [
          {
            source_id: 'src_alpha_01',
            source_key: 'alpha_doc.pdf',
            version: 1,
            state: 'completed',
          },
        ],
      },
    });

    const { rerender } = render(<ContextEvidencePanel hiringRunId="run_alpha" />);
    await waitFor(() => {
      expect(screen.getByText('alpha_doc.pdf')).toBeInTheDocument();
    });

    // Switch run to run_gamma which returns empty
    api.get.mockResolvedValueOnce({ data: { sources: [] } });
    rerender(<ContextEvidencePanel hiringRunId="run_gamma" />);

    await waitFor(() => {
      expect(screen.queryByText('alpha_doc.pdf')).not.toBeInTheDocument();
      expect(
        screen.getByText(/No document evidence uploaded for this hiring run yet/i)
      ).toBeInTheDocument();
    });
  });
});
