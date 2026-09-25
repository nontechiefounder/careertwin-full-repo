import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient(request);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch the sourcing session with its hiring run
    const { data: session, error: sessionError } = await supabase
      .from('sourcing_sessions')
      .select('*, hiring_runs(*)')
      .eq('id', id)
      .single();

    if (sessionError) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Fetch live activity events for this session
    const { data: events, error: eventsError } = await supabase
      .from('activity_events')
      .select('*')
      .eq('session_id', id)
      .order('timestamp', { ascending: true });

    // Fetch the sourced candidates for this position
    const { data: candidates, error: candidatesError } = await supabase
      .from('candidates')
      .select('*, candidate_profiles(*)')
      .eq('hiring_run_id', session.hiring_run_id);

    return NextResponse.json({
      session: {
        ...session,
        hiring_run_id: session.hiring_runs?.id,
        // An active session is one where the agent is still searching
        agent_running: session.hiring_runs?.sourcing_status === 'searching'
      },
      events: events || [],
      candidates: candidates || [],
      hiring_run: session.hiring_runs
    });

  } catch (err) {
    console.error('Sourcing session fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
