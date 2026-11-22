import { describe, test, expect, beforeAll } from 'vitest';
import path from 'path';
import dotenv from 'dotenv';
import { authenticateServerRequest, getVerifiedOrgMembership, requireActiveOrgMembership, requireUser } from '../../lib/serverAuth.js';
import { GET as getAnalytics } from '../../app/api/employer/analytics/route.js';
import { GET as getBrief } from '../../app/api/employer/brief/[id]/route.js';
import { GET as getPacket } from '../../app/api/employer/packets/[extractionId]/route.js';
import { POST as postSourcingSessions } from '../../app/api/employer/sourcing-sessions/route.js';
import { createMockRequest } from './apiAuthorizationTestHarness.js';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const ALPHA_RUN_ID = '11111111-1111-4111-d2c1-111111111111';
const BETA_ORG_ID = '00000000-0000-4000-a000-000000000002';
const STAGING_OWNER_EMAIL = 'd2c.alpha.owner@example.com';
const STAGING_BETA_OWNER_EMAIL = 'd2c.beta.owner@example.com';

describe('Employer Workspace Security Suite (UX-V2-D4-C2)', () => {
  let alphaToken = null;
  let betaToken = null;

  beforeAll(async () => {
    const pwd = process.env.CAREERTWIN_STAGING_TEST_PASSWORD;
    if (!pwd) throw new Error('CAREERTWIN_STAGING_TEST_PASSWORD missing');

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Login Alpha
    const alphaRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({ email: STAGING_OWNER_EMAIL, password: pwd }),
    });
    if (alphaRes.ok) {
      const d = await alphaRes.json();
      alphaToken = d.access_token;
    }

    // Login Beta
    const betaRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey },
      body: JSON.stringify({ email: STAGING_BETA_OWNER_EMAIL, password: pwd }),
    });
    if (betaRes.ok) {
      const d = await betaRes.json();
      betaToken = d.access_token;
    }
  }, 30000);

  // ── Scenario S1: Unauthenticated request fails closed (401) ──
  test('Scenario S1 — Unauthenticated request to /api/employer/analytics returns 401', async () => {
    const req = createMockRequest({ method: 'GET', url: 'http://localhost/api/employer/analytics' });
    const res = await getAnalytics(req);
    expect(res.status).toBe(401);
  });

  // ── Scenario S2: Cross-tenant access to hiring brief returns 403/404 ──
  test('Scenario S2 — Tenant B token accessing Tenant A brief returns 403 or 404', async () => {
    if (!betaToken) throw new Error('FAIL-CLOSED: Beta token not acquired');
    const req = createMockRequest({
      method: 'GET',
      headers: { Authorization: `Bearer ${betaToken}` },
      url: `http://localhost/api/employer/brief/${ALPHA_RUN_ID}`,
    });
    const res = await getBrief(req, { params: { id: ALPHA_RUN_ID } });
    expect([403, 404]).toContain(res.status);
  }, 30000);

  // ── Scenario S3: Cross-tenant access to candidate packet returns 403/404 ──
  test('Scenario S3 — Tenant B token accessing Tenant A packet returns 403 or 404', async () => {
    if (!betaToken) throw new Error('FAIL-CLOSED: Beta token not acquired');
    const req = createMockRequest({
      method: 'GET',
      headers: { Authorization: `Bearer ${betaToken}` },
      url: `http://localhost/api/employer/packets/${ALPHA_RUN_ID}`,
    });
    const res = await getPacket(req, { params: { extractionId: ALPHA_RUN_ID } });
    expect([403, 404]).toContain(res.status);
  }, 30000);

  // ── Scenario S4: Sourcing sessions endpoint requires verified org membership ──
  test('Scenario S4 — Sourcing sessions route requires verified org membership', async () => {
    const req = createMockRequest({
      method: 'POST',
      headers: {},
      url: 'http://localhost/api/employer/sourcing-sessions',
    });
    const res = await postSourcingSessions(req);
    expect([401, 403]).toContain(res.status);
  });

  // ── Scenario S5: Malformed Authorization header returns 401 ──
  test('Scenario S5 — Malformed Authorization header format returns 401', async () => {
    const req = createMockRequest({
      method: 'GET',
      headers: { Authorization: 'Bearer invalid-token-string' },
      url: 'http://localhost/api/employer/analytics',
    });
    const authResult = await authenticateServerRequest(req);
    expect(authResult.ok).toBe(false);
    expect(authResult.status).toBe(401);
  });

  // ── Scenario S6: Deprecated mock-token session is rejected with 401 ──
  test('Scenario S6 — Deprecated mock-token session returns 401 DEPRECATED_SESSION', async () => {
    const req = createMockRequest({
      method: 'GET',
      headers: { Authorization: 'Bearer mock-token' },
      url: 'http://localhost/api/employer/analytics',
    });
    const authResult = await authenticateServerRequest(req);
    expect(authResult.ok).toBe(false);
    expect(authResult.status).toBe(401);
    expect(authResult.code).toBe('DEPRECATED_SESSION');
  });

  // ── Scenario S7: Tenant context verification extracts correct org_id ──
  test('Scenario S7 — Verified org membership extracts user organization context', async () => {
    if (!alphaToken) throw new Error('FAIL-CLOSED: Alpha token not acquired');
    const req = createMockRequest({
      method: 'GET',
      headers: { Authorization: `Bearer ${alphaToken}` },
      url: 'http://localhost/api/employer/analytics',
    });
    const authRes = await requireUser(req);
    expect(authRes.errorResponse).toBeNull();
    expect(authRes.user).toBeTruthy();
    
    const { data: memberships } = await authRes.supabase
      .from('organization_memberships')
      .select('*')
      .eq('user_id', authRes.user.id);

    expect(memberships).toBeTruthy();
    expect(memberships.length).toBeGreaterThan(0);
    expect(memberships[0].membership_status).toBe('active');
    expect(memberships[0].organization_id).toBe('00000000-0000-4000-d2c0-000000000001');
  }, 30000);

  // ── Scenario S8: Cross-tenant org ID mismatch returns 403 ──
  test('Scenario S8 — Cross-tenant org ID mismatch fails org verification', async () => {
    if (!betaToken) throw new Error('FAIL-CLOSED: Beta token not acquired');
    const req = createMockRequest({
      method: 'GET',
      headers: { Authorization: `Bearer ${betaToken}` },
      url: 'http://localhost/api/employer/analytics',
    });
    // Beta user attempting to access Alpha organization ID
    const authResult = await requireActiveOrgMembership(req, '00000000-0000-4000-a000-000000000001');
    expect(authResult.errorResponse).toBeTruthy();
    expect(authResult.errorResponse.status).toBe(403);
  }, 30000);

  // ── Scenario S9: Invalid UUID parameter returns 400 Bad Request or 404 ──
  test('Scenario S9 — Invalid hiring run UUID parameter returns 400 or 404', async () => {
    if (!alphaToken) throw new Error('FAIL-CLOSED: Alpha token not acquired');
    const req = createMockRequest({
      method: 'GET',
      headers: { Authorization: `Bearer ${alphaToken}` },
      url: 'http://localhost/api/employer/brief/not-a-valid-uuid',
    });
    const res = await getBrief(req, { params: { id: 'not-a-valid-uuid' } });
    expect([400, 404]).toContain(res.status);
  }, 30000);

  // ── Scenario S10: Fail-closed when no token or cookie provided ──
  test('Scenario S10 — Fail-closed authentication when headers and cookies are absent', async () => {
    const req = createMockRequest({ method: 'GET', url: 'http://localhost/api/employer/analytics' });
    const authResult = await authenticateServerRequest(req);
    expect(authResult.ok).toBe(false);
    expect(authResult.status).toBe(401);
  });
});
