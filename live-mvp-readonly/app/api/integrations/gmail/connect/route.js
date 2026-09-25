import { getAuthUrl } from '@/lib/gmail';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    // DEBUG LOGS
    console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'EXISTS' : 'MISSING');
    console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'EXISTS' : 'MISSING');
    console.log('GOOGLE_REDIRECT_URI:', process.env.GOOGLE_REDIRECT_URI);

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        return NextResponse.json({ 
            error: 'Environment variables missing on server',
            details: 'GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not defined' 
        }, { status: 500 });
    }

    const supabase = await createSupabaseServerClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = getAuthUrl();
    return NextResponse.json({ url });
  } catch (err) {
    console.error('Gmail connect error:', err);
    return NextResponse.json({ error: 'Failed to generate auth URL', details: err.message }, { status: 500 });
  }
}
