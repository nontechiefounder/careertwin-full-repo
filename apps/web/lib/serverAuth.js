import { createSupabaseServerClient } from './supabaseServer';
import { NextResponse } from 'next/server';

/**
 * Server Request Authentication Contract Helper (Step 4B5.1.1 Hardened)
 */
export async function authenticateServerRequest(request, options = { requireAuth: true }) {
  try {
    const getHeader = (name) => {
      if (!request?.headers) return null;
      if (typeof request.headers.get === 'function') {
        return request.headers.get(name) || request.headers.get(name.toLowerCase());
      }
      const mapVal = request.headers.get ? request.headers.get(name) : request.headers[name] || request.headers[name.toLowerCase()];
      return mapVal || null;
    };

    const authHeader = getHeader('Authorization');
    const cookieHeader = getHeader('cookie');

    let headerToken = null;
    if (authHeader) {
      if (!authHeader.startsWith('Bearer ')) {
        return {
          ok: false,
          status: 401,
          code: 'MALFORMED_AUTHORIZATION',
          message: 'Malformed Authorization header format',
        };
      }
      headerToken = authHeader.slice(7).trim();
      if (!headerToken) {
        return {
          ok: false,
          status: 401,
          code: 'MALFORMED_AUTHORIZATION',
          message: 'Malformed Authorization header format',
        };
      }
    }

    let cookieToken = null;
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)ct_token=([^;]*)/);
      if (match) {
        cookieToken = match[1].trim();
      }
    }

    if (headerToken === 'mock-token' || cookieToken === 'mock-token') {
      return {
        ok: false,
        status: 401,
        code: 'DEPRECATED_SESSION',
        message: 'Deprecated authentication session is rejected',
      };
    }

    if (headerToken && cookieToken && headerToken !== cookieToken) {
      return {
        ok: false,
        status: 401,
        code: 'TOKEN_SOURCE_CONFLICT',
        message: 'Conflicting authentication tokens provided in header and cookie',
      };
    }

    const effectiveToken = headerToken || cookieToken;

    if (!effectiveToken) {
      if (options.requireAuth === false) {
        return {
          ok: true,
          client: null,
          context: null,
        };
      }
      return {
        ok: false,
        status: 401,
        code: 'AUTH_REQUIRED',
        message: 'Authentication token is required',
      };
    }

    const supabase = await createSupabaseServerClient(request, false);
    const { data, error } = await supabase.auth.getUser();

    if (error || !data?.user) {
      return {
        ok: false,
        status: 401,
        code: 'INVALID_SESSION',
        message: 'Invalid or expired authentication session',
      };
    }

    return {
      ok: true,
      context: {
        client: supabase,
        user: {
          id: data.user.id,
          email: data.user.email || null,
        },
        userId: data.user.id,
      },
    };
  } catch (err) {
    return {
      ok: false,
      status: 503,
      code: 'AUTH_PROVIDER_ERROR',
      message: 'Authentication service temporarily unavailable',
    };
  }
}

/**
 * Get authenticated user context from request cookies or Authorization header.
 */
export async function getAuthContext(request) {
  const supabase = await createSupabaseServerClient(request);
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  return { supabase, user, authError };
}

/**
 * Require valid authenticated user session (Returns 401 Unauthorized if unauthenticated).
 */
export async function requireUser(request) {
  const ctx = await getAuthContext(request);
  if (ctx.authError || !ctx.user) {
    return {
      errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      user: null,
      supabase: null
    };
  }
  return { errorResponse: null, user: ctx.user, supabase: ctx.supabase };
}

/**
 * Query server-validated active organization membership from organization_memberships table.
 */
export async function getVerifiedOrgMembership(supabase, userId, orgId) {
  if (!userId || !orgId) return null;
  const { data: membership } = await supabase
    .from('organization_memberships')
    .select('membership_role, membership_status')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .eq('membership_status', 'active')
    .maybeSingle();
  return membership;
}

/**
 * Require active organization membership (Returns 403 Forbidden if not an active org member).
 */
export async function requireActiveOrgMembership(request, orgId, allowedRoles = null) {
  const authRes = await requireUser(request);
  if (authRes.errorResponse) return authRes;

  const { user, supabase } = authRes;
  const membership = await getVerifiedOrgMembership(supabase, user.id, orgId);
  if (!membership) {
    return {
      errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      user: null,
      supabase: null,
      membership: null
    };
  }

  if (allowedRoles && Array.isArray(allowedRoles) && !allowedRoles.includes(membership.membership_role)) {
    return {
      errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      user: null,
      supabase: null,
      membership: null
    };
  }

  return { errorResponse: null, user, supabase, membership };
}
