import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const supabase = await createSupabaseServerClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch candidate profile from 'candidate_profiles' table
    // If table doesn't exist, we fallback to user metadata or return null
    const { data: profile, error } = await supabase
      .from('candidate_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is 'no rows'
      console.error('Profile fetch error:', error);
    }

    return NextResponse.json(profile || {
      name: user.user_metadata?.name || '',
      email: user.email || '',
      is_new: true
    });

  } catch (err) {
    console.error('Candidate profile GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    const profileData = {
      id: user.id,
      name: body.name,
      email: body.email,
      github_url: body.github_url,
      resume_link: body.resume_link,
      target_roles: body.target_roles || [],
      location: body.location,
      compensation_min: body.compensation_min,
      compensation_max: body.compensation_max,
      search_urgency: body.search_urgency,
      bio: body.bio,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('candidate_profiles')
      .upsert([profileData])
      .select()
      .single();

    if (error) {
      console.error('Profile save error:', error);
      return NextResponse.json({ error: 'Failed to save candidate profile' }, { status: 500 });
    }

    return NextResponse.json(data);

  } catch (err) {
    console.error('Candidate profile POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
