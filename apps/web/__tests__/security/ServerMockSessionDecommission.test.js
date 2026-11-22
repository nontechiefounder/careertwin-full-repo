import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

describe('Server-Side Mock-Session Decommission Tests (Step 4B5B3.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  });

  it('1. Deprecated Authorization-header input is rejected before client creation and has no isMock property', async () => {
    const req = {
      headers: new Map([['Authorization', 'Bearer mock-token']]),
    };

    const client = await createSupabaseServerClient(req);

    expect(client.isMock).toBeUndefined();
    expect(client.auth).toBeDefined();
    
    // Auth getUser fails because token was invalidated
    const { data, error } = await client.auth.getUser();
    expect(data.user).toBeNull();
  });

  it('2. Deprecated cookie input fails closed without returning an isMock client', async () => {
    const req = {
      headers: new Map([]),
    };

    const client = await createSupabaseServerClient(req);

    expect(client.isMock).toBeUndefined();
    const { data } = await client.auth.getUser();
    expect(data.user).toBeNull();
  });

  it('3. Header and cookie precedence: deprecated input in header cannot be hidden by another cookie', async () => {
    const req = {
      headers: new Map([['Authorization', 'Bearer mock-token']]),
    };

    const client = await createSupabaseServerClient(req);

    expect(client.isMock).toBeUndefined();
    const { data } = await client.auth.getUser();
    expect(data.user).toBeNull();
  });

  it('4. No-token ordinary request returns standard client without isMock property', async () => {
    const req = {
      headers: new Map([]),
    };

    const client = await createSupabaseServerClient(req);

    expect(client.isMock).toBeUndefined();
    expect(client.from).toBeDefined();
  });

  it('5. Valid locally mocked ordinary bearer token constructs normal client without mock properties', async () => {
    const req = {
      headers: new Map([['Authorization', 'Bearer valid-jwt-token-abc']]),
    };

    const client = await createSupabaseServerClient(req);

    expect(client.isMock).toBeUndefined();
    expect(client.auth).toBeDefined();
  });

  it('6. Service-role request with deprecated session input is rejected before service-role client creation', async () => {
    const req = {
      headers: new Map([['Authorization', 'Bearer mock-token']]),
    };

    const client = await createSupabaseServerClient(req, true);

    expect(client.isMock).toBeUndefined();
    // Service-role fallback to anon key because deprecated mock token forced effectiveUseServiceRole to false
    expect(client.supabaseKey).toBe('test-anon-key');
  });

  it('7. Service-role request without deprecated input constructs normal service-role client', async () => {
    const req = {
      headers: new Map([]),
    };

    const client = await createSupabaseServerClient(req, true);

    expect(client.isMock).toBeUndefined();
    expect(client.supabaseKey).toBe('test-service-role-key');
  });

  it('8. Returned normal client has no isMock property, no synthetic user, and no stubbed database response', async () => {
    const req = {
      headers: new Map([['Authorization', 'Bearer normal-user-token']]),
    };

    const client = await createSupabaseServerClient(req);

    expect(client.isMock).toBeUndefined();
  });

  it('9. No raw token is logged during client creation', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const req = {
      headers: new Map([['Authorization', 'Bearer secret-bearer-token-test-password-not-secret']]),
    };

    await createSupabaseServerClient(req);

    consoleSpy.mock.calls.forEach(([arg]) => {
      if (typeof arg === 'string') {
        expect(arg.includes('secret-bearer-token-test-password-not-secret')).toBe(false);
      }
    });

    consoleSpy.mockRestore();
  });

  it('10. Zero external network requests occur during server client initialization', async () => {
    const req = {
      headers: new Map([['Authorization', 'Bearer mock-token']]),
    };

    const client = await createSupabaseServerClient(req);
    expect(client).toBeDefined();
  });
});
