import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const supabase = await createSupabaseServerClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Try to fetch profile from profiles table
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      // Return Supabase user metadata as fallback if profiles table fails
      return NextResponse.json({
        id: user.id,
        email: user.email,
        role: user.user_metadata?.role || 'employer',
        name: user.user_metadata?.name || 'User',
        company: user.user_metadata?.company || null,
        is_fallback: true
      });
    }

    return NextResponse.json(profile);
  } catch (err) {
    console.error('Auth check error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
