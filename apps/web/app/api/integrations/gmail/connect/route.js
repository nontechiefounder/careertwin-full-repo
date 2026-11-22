import { createGmailOAuthState, getAuthUrl, GMAIL_OAUTH_STATE_COOKIE } from '@/lib/gmail';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return NextResponse.json(
        { error: 'OAuth configuration missing on server' },
        { status: 500 }
      );
    }

    const supabase = await createSupabaseServerClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { state, nonce, maxAgeSeconds } = createGmailOAuthState(user.id);
    const url = getAuthUrl(state);
    const response = NextResponse.json({ url });
    response.cookies.set(GMAIL_OAUTH_STATE_COOKIE, nonce, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api/integrations/gmail/callback',
      maxAge: maxAgeSeconds,
    });
    return response;
  } catch (err) {
    console.error('Gmail connect error:', err);
    return NextResponse.json({ error: 'Failed to generate auth URL' }, { status: 500 });
  }
}
