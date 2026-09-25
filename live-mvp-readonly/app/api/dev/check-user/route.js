import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const supabase = await createSupabaseServerClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return NextResponse.json({
      user_id: user.id,
      email: user.email,
      metadata_role: user.user_metadata?.role,
      profile_role: profile?.role,
      profile: profile
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
