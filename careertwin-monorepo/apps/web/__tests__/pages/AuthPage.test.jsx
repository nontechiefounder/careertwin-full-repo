import { render, screen, waitFor } from '@testing-library/react';
import AuthPage from '@/app/auth/page';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock useAuth and useRouter
vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}));

describe('AuthPage', () => {
  const mockReplace = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useRouter.mockReturnValue({
      replace: mockReplace,
      push: vi.fn(),
    });
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

  it('shows login form if no user is present', () => {
    useAuth.mockReturnValue({ user: null, loading: false, login: vi.fn(), register: vi.fn(), loginWithProvider: vi.fn() });
    render(<AuthPage />);
    expect(screen.getByTestId('auth-page')).toBeInTheDocument();
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
  });
});
