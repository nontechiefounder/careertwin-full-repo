import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import {
  evaluateDeviceSupport,
  stripSensitiveQueryParams,
  buildSafeDestination,
} from '@/lib/deviceSupport';
import DeviceSupportGate from '@/components/DeviceSupportGate';
import { useAuth } from '@/lib/auth';

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
}));

describe('deviceSupport policy helpers & DeviceSupportGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    useAuth.mockReturnValue({
      user: { id: 'u-1', email: 'owner@example.com', role: 'employer' },
      logout: vi.fn(),
    });
  });

  it('strips sensitive credential and token params from destinations', () => {
    expect(
      stripSensitiveQueryParams('?tab=evidence&token=secret123&access_token=abc&invite=inv1&role=lead')
    ).toBe('?tab=evidence&role=lead');
    expect(
      buildSafeDestination('/employer/brief/123', '?access_token=xyz&tab=criteria')
    ).toBe('/employer/brief/123?tab=criteria');
    expect(buildSafeDestination('//evil.com', '?a=1')).toBe('/employer');
  });

  it('blocks portrait phones (375, 390, 430) and landscape phones', () => {
    for (const width of [375, 390, 430]) {
      const res = evaluateDeviceSupport({
        viewportWidth: width,
        viewportHeight: 844,
        screenWidth: width,
        screenHeight: 844,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148',
        maxTouchPoints: 5,
        coarsePointer: true,
      });
      expect(res.supported).toBe(false);
      expect(res.reason).toBe('phone');
    }

    const landscapePhone = evaluateDeviceSupport({
      viewportWidth: 844,
      viewportHeight: 390,
      screenWidth: 844,
      screenHeight: 390,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148',
      maxTouchPoints: 5,
      coarsePointer: true,
    });
    expect(landscapePhone.supported).toBe(false);
    expect(landscapePhone.reason).toBe('phone');
  });

  it('allows iPads >= 768px (including iPadOS desktop Macintosh UA) and gives narrow-ipad guidance < 768px', () => {
    const ipadDesktopUa = evaluateDeviceSupport({
      viewportWidth: 768,
      viewportHeight: 1024,
      screenWidth: 768,
      screenHeight: 1024,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
      coarsePointer: true,
    });
    expect(ipadDesktopUa.supported).toBe(true);
    expect(ipadDesktopUa.isIpad).toBe(true);

    const ipadSplitViewNarrow = evaluateDeviceSupport({
      viewportWidth: 507,
      viewportHeight: 1024,
      screenWidth: 1024,
      screenHeight: 768,
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
      coarsePointer: true,
    });
    expect(ipadSplitViewNarrow.supported).toBe(false);
    expect(ipadSplitViewNarrow.reason).toBe('narrow-ipad');
  });

  it('distinguishes onboarding copy vs returning user copy and preserves unsaved state across resize', () => {
    // 1. Fresh signup phone view
    window.innerWidth = 390;
    window.innerHeight = 844;
    sessionStorage.setItem('isFreshSignUp', 'true');

    render(
      <DeviceSupportGate>
        <input data-testid="workspace-input" defaultValue="" />
      </DeviceSupportGate>
    );

    expect(screen.getByTestId('device-support-heading')).toHaveTextContent('Continue on a larger screen');
    expect(screen.getByTestId('device-support-message')).toHaveTextContent(
      'Your account is ready. To use the workBYLiNE workspace, open it on a desktop, laptop, Mac or iPad.'
    );
    expect(screen.queryByTestId('workspace-input')).toBeNull();

    // 2. Returning user copy (user session changes after clearing isFreshSignUp)
    sessionStorage.removeItem('isFreshSignUp');
    window.innerWidth = 375;
    window.innerHeight = 667;
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(screen.getByTestId('device-support-message')).toHaveTextContent(
      'You’re signed in. To use the workBYLiNE workspace, open it on a desktop, laptop, Mac or iPad.'
    );

    // 3. Resize to desktop -> type unsaved input -> resize narrow desktop -> restore desktop preserves input
    act(() => {
      window.innerWidth = 1280;
      window.innerHeight = 800;
      window.dispatchEvent(new Event('resize'));
    });

    const input = screen.getByTestId('workspace-input');
    fireEvent.change(input, { target: { value: 'unsaved draft notes' } });
    expect(input.value).toBe('unsaved draft notes');

    act(() => {
      window.innerWidth = 640;
      window.innerHeight = 800;
      window.dispatchEvent(new Event('resize'));
    });
    expect(screen.getByTestId('device-support-heading')).toHaveTextContent('Make this window wider');

    act(() => {
      window.innerWidth = 1024;
      window.innerHeight = 768;
      window.dispatchEvent(new Event('resize'));
    });
    expect(screen.getByTestId('workspace-input').value).toBe('unsaved draft notes');
  });
});
