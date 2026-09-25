import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    
    if (!query) {
      return NextResponse.json({ results: [] });
    }

    const supabase = await createSupabaseServerClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Search Hiring Runs
    const { data: runs, error: runsError } = await supabase
      .from('hiring_runs')
      .select('id, role_title, company, status, created_at')
      .or(`role_title.ilike.%${query}%,company.ilike.%${query}%`)
      .eq('employer_id', user.id)
      .limit(10);

    // 2. Search Candidate Profiles
    const { data: candidates, error: candError } = await supabase
      .from('candidate_profiles')
      .select('id, name, bio, location, linkedin_url')
      .ilike('name', `%${query}%`)
      .limit(10);

    // 3. Format and combine
    const results = [
      ...(runs || []).map(r => ({
        id: r.id,
        type: 'role',
        title: r.role_title,
        subtitle: r.company,
        url: `/employer/brief/${r.id}`,
        status: r.status
      })),
      ...(candidates || []).map(c => ({
        id: c.id,
        type: 'candidate',
        title: c.name,
        subtitle: c.bio,
        url: `/employer/packet/${c.id}`, // Assuming this is the profile view
        location: c.location
      }))
    ];

    return NextResponse.json({ results: results.slice(0, 15) });

  } catch (err) {
    console.error('Search API Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
