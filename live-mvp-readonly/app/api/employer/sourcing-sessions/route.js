import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { runSourcingAgent } from '@/lib/sourcing/agent';

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { hiring_run_id } = await request.json();

    if (!hiring_run_id) {
        return NextResponse.json({ error: 'hiring_run_id is required' }, { status: 400 });
    }

    // 1. Fetch current budget status
    const { data: run } = await supabase
        .from('hiring_runs')
        .select('crustdata_credits_spent')
        .eq('id', hiring_run_id)
        .single();

    const creditsSpent = run?.crustdata_credits_spent || 0;

    // 2. Create the session
    const newSession = {
        employer_id: user.id,
        hiring_run_id: hiring_run_id,
        status: 'active',
        created_at: new Date().toISOString()
    };

    const { data: session, error: sessError } = await supabase
        .from('sourcing_sessions')
        .insert([newSession])
        .select()
        .single();

    if (sessError) {
        return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    // 🚀 3. Trigger the Autonomous Agent
    // Only trigger if creditsSpent < 3 (leaving room for exactly one search)
    if (creditsSpent < 3) {
        await supabase
            .from('hiring_runs')
            .update({ sourcing_status: 'searching' })
            .eq('id', hiring_run_id);
            
        // Trigger as "fire and forget" or semi-awaited for events
        runSourcingAgent(supabase, session.id, hiring_run_id).catch(console.error);
    }

    return NextResponse.json({
        ...session,
        session_id: session.id
    });

  } catch (err) {
    console.error('Sourcing session creation error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
