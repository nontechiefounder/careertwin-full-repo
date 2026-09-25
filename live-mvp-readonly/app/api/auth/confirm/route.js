import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = searchParams.get('next') || '/employer';

  if (token_hash && type) {
    const supabase = await createSupabaseServerClient(null, false);

    const { error } = await supabase.auth.verifyOtp({
      token_hash,
      type,
    });

    if (!error) {
      // Redirect to the dashboard or the requested 'next' page
      return NextResponse.redirect(new URL(next, request.url));
    }

    console.error('[Verify API] Verification error:', error);
    // If verification fails, redirect to an error page or auth page with message
    return NextResponse.redirect(new URL(`/auth?error=${encodeURIComponent(error.message)}`, request.url));
  }

  // Return to auth page if parameters are missing
  return NextResponse.redirect(new URL('/auth?error=Missing+verification+parameters', request.url));
}
