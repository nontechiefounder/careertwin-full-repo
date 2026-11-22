import {
  getTokens,
  GMAIL_OAUTH_STATE_COOKIE,
  verifyAndConsumeGmailOAuthState,
} from '@/lib/gmail';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

const ALLOWED_OAUTH_ERRORS = new Set([
  'access_denied',
  'invalid_request',
  'unauthorized_client',
  'unsupported_response_type',
  'invalid_scope',
  'server_error',
  'temporarily_unavailable',
]);

function resolveBaseOrigin(request) {
  const configured = (process.env.NEXT_PUBLIC_URL || '').trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // fall through to request origin
    }
  }
  return new URL(request.url).origin;
}

function buildIntegrationsRedirect(request, params) {
  const target = new URL('/employer/integrations', resolveBaseOrigin(request));
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      target.searchParams.set(k, String(v));
    }
  }
  const response = NextResponse.redirect(target);
  response.cookies.set(GMAIL_OAUTH_STATE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/integrations/gmail/callback',
    maxAge: 0,
  });
  return response;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const rawError = searchParams.get('error');

  if (rawError) {
    const safeError = ALLOWED_OAUTH_ERRORS.has(rawError) ? rawError : 'oauth_error';
    return buildIntegrationsRedirect(request, { error: safeError });
  }

  if (!code) {
    return buildIntegrationsRedirect(request, { error: 'no_code' });
  }

  try {
    const supabase = await createSupabaseServerClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.error('Session lost during Google callback redirect');
      const authTarget = new URL('/auth', resolveBaseOrigin(request));
      authTarget.searchParams.set('error', 'session_lost');
      const res = NextResponse.redirect(authTarget);
      res.cookies.set(GMAIL_OAUTH_STATE_COOKIE, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/api/integrations/gmail/callback',
        maxAge: 0,
      });
      return res;
    }

    const cookieNonce = request.cookies?.get?.(GMAIL_OAUTH_STATE_COOKIE)?.value || null;
    const verification = verifyAndConsumeGmailOAuthState({
      state,
      expectedUserId: user.id,
      cookieNonce,
    });
    if (!verification.ok) {
      return buildIntegrationsRedirect(request, { error: 'invalid_state' });
    }

    const tokens = await getTokens(code);

    // Save the refresh token to the profiles table
    const updateData = {
      gmail_connected: true,
      gmail_email: tokens.id_token
        ? JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64').toString()).email
        : null,
    };

    if (tokens.refresh_token) {
      updateData.gmail_refresh_token = tokens.refresh_token;
    }

    // Use Service Role to bypass RLS for this specific update
    const supabaseAdmin = await createSupabaseServerClient(request, true);
    const { error: dbError } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', user.id);

    if (dbError) throw dbError;

    return buildIntegrationsRedirect(request, { success: 'gmail_connected' });
  } catch (err) {
    console.error('Gmail callback error:', err);
    return buildIntegrationsRedirect(request, { error: 'callback_failed' });
  }
}
