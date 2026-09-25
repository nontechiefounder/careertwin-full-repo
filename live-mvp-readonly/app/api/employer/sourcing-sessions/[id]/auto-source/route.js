import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { runSourcingAgent } from '@/lib/sourcing/agent';

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient(request);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch the session to get the hiring_run_id
    const { data: session, error: sessError } = await supabase
      .from('sourcing_sessions')
      .select('hiring_run_id')
      .eq('id', id)
      .single();

    if (sessError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Trigger the Autonomous Agent
    // We update the status to show the agent is thinking
    await supabase
      .from('hiring_runs')
      .update({ sourcing_status: 'searching' })
      .eq('id', session.hiring_run_id);

    const result = await runSourcingAgent(supabase, id, session.hiring_run_id);

    if (result.error) {
      return NextResponse.json({ error: result.error, message: result.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...result });

  } catch (err) {
    console.error('Auto-source trigger error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
