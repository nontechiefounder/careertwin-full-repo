import { vi } from 'vitest';

export const dbSpy = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

export const providerSpy = {
  gemini: vi.fn(),
  docling: vi.fn(),
  sourcing: vi.fn(),
};

export function resetHarnessSpies() {
  dbSpy.select.mockClear();
  dbSpy.insert.mockClear();
  dbSpy.update.mockClear();
  dbSpy.delete.mockClear();
  providerSpy.gemini.mockClear();
  providerSpy.docling.mockClear();
  providerSpy.sourcing.mockClear();
}

export function createMockRequest({ method = 'GET', headers = {}, body = null, url = 'http://localhost/api/test' } = {}) {
  const reqHeaders = new Headers(headers);
  return {
    method,
    headers: reqHeaders,
    url,
    json: async () => body || {},
  };
}
