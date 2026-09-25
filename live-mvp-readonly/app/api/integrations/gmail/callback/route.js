import { getTokens } from '@/lib/gmail';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/employer/integrations?error=${error}`);
  }

  if (!code) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/employer/integrations?error=no_code`);
  }

  try {
    const supabase = await createSupabaseServerClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.error('Session lost during Google callback redirect');
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/auth?error=session_lost`);
    }

    const tokens = await getTokens(code);

    // Save the refresh token to the profiles table
    const updateData = {
      gmail_connected: true,
      gmail_email: tokens.id_token ? JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64').toString()).email : null
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

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/employer/integrations?success=gmail_connected`);

  } catch (err) {
    console.error('Gmail callback error:', err);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_URL}/employer/integrations?error=callback_failed`);
  }
}
