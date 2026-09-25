import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { 
        session_id, 
        hiring_run_id, 
        candidate_name, 
        current_role, 
        current_company, 
        skills, 
        linkedin_url,
        github_url
    } = body;

    // 1. Create a dummy candidate profile (or link to existing)
    // In a real system, we would parse the LinkedIn/GitHub URL
    const { data: profile, error: profileError } = await supabase
        .from('candidate_profiles')
        .insert([{
            name: candidate_name,
            github_url: github_url,
            location: 'Remote (Injected)',
            bio: `${current_role} at ${current_company}`
        }])
        .select()
        .single();

    if (profileError) {
        console.error('Profile creation error:', profileError);
    }

    // 2. Add to candidates list (Shortlist)
    const { data: candidate, error: candidateError } = await supabase
        .from('candidates')
        .insert([{
            hiring_run_id: hiring_run_id,
            candidate_id: profile?.id,
            fit_score: 0.95, // Manually injected profiles are usually high fit
            status: 'new',
            highlights: skills || []
        }])
        .select()
        .single();

    if (candidateError) {
        console.error('Candidate mapping error:', candidateError);
    }

    // 3. Inject an Activity Event into the live feed
    const { error: eventError } = await supabase
        .from('activity_events')
        .insert([{
            session_id: session_id,
            event_type: 'shortlist',
            title: `Manual Injection: ${candidate_name}`,
            description: `Manually added ${current_role} from ${current_company} to the shortlist.`,
            candidate_name: candidate_name,
            candidate_id: candidate?.id
        }]);

    if (eventError) {
        console.error('Event injection error:', eventError);
    }

    return NextResponse.json({
        success: true,
        candidate_id: candidate?.id,
        profile_id: profile?.id
    });

  } catch (err) {
    console.error('Candidate extraction error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
