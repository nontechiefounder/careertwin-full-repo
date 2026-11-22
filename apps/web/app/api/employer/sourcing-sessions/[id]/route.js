import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';

const ALLOWED_VIEW_ROLES = ['owner', 'admin', 'recruiter', 'hiring_manager', 'auditor'];

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient(request);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch the sourcing session with its hiring run
    let session = null;
    const { data: bySessionId } = await supabase
      .from('sourcing_sessions')
      .select('*, hiring_runs(*)')
      .eq('id', id)
      .maybeSingle();

    if (bySessionId) {
      session = bySessionId;
    } else {
      // Check if id is a hiring_run_id directly
      const { data: run } = await supabase
        .from('hiring_runs')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (run) {
        let { data: existingSession } = await supabase
          .from('sourcing_sessions')
          .select('*, hiring_runs(*)')
          .eq('hiring_run_id', id)
          .maybeSingle();

        if (!existingSession) {
          const { data: newSession } = await supabase
            .from('sourcing_sessions')
            .insert([{ hiring_run_id: id, employer_id: user.id }])
            .select('*, hiring_runs(*)')
            .maybeSingle();
          existingSession = newSession || { id, hiring_run_id: id, hiring_runs: run };
        }
        session = existingSession;
      }
    }

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const orgId = session.hiring_runs?.org_id;
    if (!orgId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const membership = await getVerifiedOrgMembership(supabase, user.id, orgId);
    if (!membership || !ALLOWED_VIEW_ROLES.includes(membership.membership_role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch live activity events for this session using server client
    const adminSupabase = await createSupabaseServerClient(request, true);
    const sessionIds = Array.from(new Set([session.id, id].filter(Boolean)));
    const { data: events, error: eventsError } = await adminSupabase
      .from('activity_events')
      .select('*')
      .in('session_id', sessionIds)
      .order('timestamp', { ascending: true });

    if (eventsError) {
      console.warn('[sourcing session activity_events error]:', eventsError.message);
    }

    // Fetch the sourced candidates for this position
    const { data: candidates, error: candidatesError } = await supabase
      .from('candidates')
      .select('*, candidate_profiles(*)')
      .eq('hiring_run_id', session.hiring_run_id);

    if (candidatesError) {
      console.error('[sourcing session candidates fetch error]:', candidatesError.message);
      return NextResponse.json({
        error: 'Failed to fetch candidates from database',
        detail: candidatesError.message
      }, { status: 500 });
    }

    return NextResponse.json({
      session: {
        ...session,
        hiring_run_id: session.hiring_runs?.id,
        // An active session is one where the agent is still searching
        agent_running: session.hiring_runs?.sourcing_status === 'searching'
      },
      events: events || [],
      events_status: eventsError ? 'unavailable' : 'ready',
      candidates: candidates || [],
      hiring_run: session.hiring_runs
    });

  } catch (err) {
    console.error('Sourcing session fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
