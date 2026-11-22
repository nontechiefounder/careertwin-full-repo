/**
 * Safe Redirect URL Validator
 * Protects against open-redirect vulnerabilities, protocol-relative destinations,
 * control character injection, and backslash bypasses.
 */
export function sanitizeRedirectUrl(url, defaultFallback = '/employer') {
  if (!url || typeof url !== 'string') {
    return defaultFallback;
  }

  const trimmed = url.trim();

  // Reject empty or whitespace-only
  if (!trimmed) {
    return defaultFallback;
  }

  // Must begin with a single forward slash
  if (!trimmed.startsWith('/')) {
    return defaultFallback;
  }

  // Reject protocol-relative URLs (e.g., //evil.com or ///evil.com)
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return defaultFallback;
  }

  // Reject backslashes anywhere in the path to prevent browser path-normalization bypasses
  if (trimmed.includes('\\')) {
    return defaultFallback;
  }

  // Reject encoded backslashes or protocol markers (%5C, %2F%2F, etc.)
  if (/%5c/i.test(trimmed) || /%2f%2f/i.test(trimmed)) {
    return defaultFallback;
  }

  // Reject embedded protocol schemes (e.g., /javascript:alert(1), /http://evil.com)
  if (/^\/[a-zA-Z0-9+.-]+:/.test(trimmed)) {
    return defaultFallback;
  }

  // Reject carriage returns, line feeds, null bytes
  if (/[\r\n\0]/.test(trimmed)) {
    return defaultFallback;
  }

  return trimmed;
}

