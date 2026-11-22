import { describe, it, expect } from 'vitest';
import { sanitizeRedirectUrl } from '../../lib/safeRedirect';
import { signInviteToken, verifyInviteToken } from '../../app/api/employer/organizations/invite/route';

describe('Safe Redirect & Entry Security Invariants', () => {
  describe('sanitizeRedirectUrl', () => {
    it('allows valid relative application paths', () => {
      expect(sanitizeRedirectUrl('/employer')).toBe('/employer');
      expect(sanitizeRedirectUrl('/employer/packet/ext_123')).toBe('/employer/packet/ext_123');
      expect(sanitizeRedirectUrl('/employer/brief/run_456?tab=criteria')).toBe('/employer/brief/run_456?tab=criteria');
      expect(sanitizeRedirectUrl('/employer/shortlist/run_789?filter=high')).toBe('/employer/shortlist/run_789?filter=high');
      expect(sanitizeRedirectUrl('/auth?invite=token123')).toBe('/auth?invite=token123');
    });

    it('rejects protocol-relative open redirect attacks', () => {
      expect(sanitizeRedirectUrl('//evil.com')).toBe('/employer');
      expect(sanitizeRedirectUrl('///evil.com')).toBe('/employer');
      expect(sanitizeRedirectUrl('////attacker.org/phish')).toBe('/employer');
      expect(sanitizeRedirectUrl('//localhost:8080/steal')).toBe('/employer');
    });

    it('rejects backslash bypasses and encoded backslashes', () => {
      expect(sanitizeRedirectUrl('/\\evil.com')).toBe('/employer');
      expect(sanitizeRedirectUrl('/path\\to\\evil')).toBe('/employer');
      expect(sanitizeRedirectUrl('/%5cevil.com')).toBe('/employer');
      expect(sanitizeRedirectUrl('/%5Cattacker.com')).toBe('/employer');
      expect(sanitizeRedirectUrl('/employer/%5cevil')).toBe('/employer');
    });

    it('rejects encoded protocol-relative slashes (%2F%2F)', () => {
      expect(sanitizeRedirectUrl('/%2f%2fevil.com')).toBe('/employer');
      expect(sanitizeRedirectUrl('/%2F%2Fevil.com')).toBe('/employer');
    });

    it('rejects external absolute URLs with explicit schemes', () => {
      expect(sanitizeRedirectUrl('https://evil.com')).toBe('/employer');
      expect(sanitizeRedirectUrl('http://attacker.org')).toBe('/employer');
      expect(sanitizeRedirectUrl('ftp://files.org')).toBe('/employer');
    });

    it('rejects embedded protocols inside relative-looking paths', () => {
      expect(sanitizeRedirectUrl('/javascript:alert(1)')).toBe('/employer');
      expect(sanitizeRedirectUrl('/data:text/html;base64,PHNjcmlwdD5...')).toBe('/employer');
      expect(sanitizeRedirectUrl('/vbscript:msgbox(1)')).toBe('/employer');
    });

    it('rejects control characters, CR, LF, and null bytes', () => {
      expect(sanitizeRedirectUrl('/employer\r\nSet-Cookie:evil=1')).toBe('/employer');
      expect(sanitizeRedirectUrl('/employer\0admin')).toBe('/employer');
    });

    it('falls back to custom fallback URL when supplied', () => {
      expect(sanitizeRedirectUrl('https://evil.com', '/auth/login')).toBe('/auth/login');
      expect(sanitizeRedirectUrl(null, '/auth/login')).toBe('/auth/login');
      expect(sanitizeRedirectUrl('', '/custom')).toBe('/custom');
    });
  });

  describe('Organization Invitation Security', () => {
    it('signs and verifies valid invitation tokens', () => {
      const payload = {
        org_id: 'org_test_123',
        org_name: 'Acme Systems',
        email: 'engineer@acme.com',
        role: 'recruiter',
        exp: Date.now() + 3600 * 1000 // 1 hour in future
      };

      const token = signInviteToken(payload);
      expect(typeof token).toBe('string');
      expect(token).toContain('.');

      const verified = verifyInviteToken(token);
      expect(verified).not.toBeNull();
      expect(verified.org_id).toBe('org_test_123');
      expect(verified.email).toBe('engineer@acme.com');
      expect(verified.role).toBe('recruiter');
    });

    it('rejects expired invitation tokens', () => {
      const expiredPayload = {
        org_id: 'org_test_123',
        org_name: 'Acme Systems',
        email: 'engineer@acme.com',
        role: 'recruiter',
        exp: Date.now() - 1000 // expired 1s ago
      };

      const token = signInviteToken(expiredPayload);
      const verified = verifyInviteToken(token);
      expect(verified).toBeNull();
    });

    it('rejects tampered invitation tokens', () => {
      const payload = {
        org_id: 'org_test_123',
        org_name: 'Acme Systems',
        email: 'engineer@acme.com',
        role: 'recruiter',
        exp: Date.now() + 3600 * 1000
      };

      const token = signInviteToken(payload);
      const [data, sig] = token.split('.');

      // Tamper with data payload (elevate role to admin)
      const tamperedData = Buffer.from(JSON.stringify({
        ...payload,
        role: 'admin'
      })).toString('base64url');

      const tamperedToken = `${tamperedData}.${sig}`;
      const verified = verifyInviteToken(tamperedToken);
      expect(verified).toBeNull();
    });

    it('rejects malformed tokens safely without crashing', () => {
      expect(verifyInviteToken('')).toBeNull();
      expect(verifyInviteToken(null)).toBeNull();
      expect(verifyInviteToken('invalid-non-dot-token')).toBeNull();
      expect(verifyInviteToken('bad_data.bad_sig')).toBeNull();
    });
  });
});

