import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';
import { runSourcingAgent } from '@/lib/sourcing/agent';

const ALLOWED_WRITE_ROLES = ['owner', 'admin', 'recruiter', 'hiring_manager'];

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    // Fetch the session by session id or hiring_run_id
    let session = null;
    const { data: byId } = await supabase
      .from('sourcing_sessions')
      .select('id, hiring_run_id')
      .eq('id', id)
      .maybeSingle();

    if (byId) {
      session = byId;
    } else {
      const { data: byRunId } = await supabase
        .from('sourcing_sessions')
        .select('id, hiring_run_id')
        .eq('hiring_run_id', id)
        .maybeSingle();
      session = byRunId;
    }

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { data: run, error: runError } = await supabase
      .from('hiring_runs')
      .select('id, org_id')
      .eq('id', session.hiring_run_id)
      .maybeSingle();

    if (runError || !run) {
      return NextResponse.json({ error: 'Hiring run not found' }, { status: 404 });
    }

    const membership = await getVerifiedOrgMembership(supabase, user.id, run.org_id);
    if (!membership || membership.membership_status !== 'active' || !ALLOWED_WRITE_ROLES.includes(membership.membership_role)) {
      return NextResponse.json({ error: 'Forbidden: Insufficient organization privileges' }, { status: 403 });
    }

    let adminSupabase;
    try {
      adminSupabase = await createSupabaseServerClient(request, true);
    } catch {
      return NextResponse.json({ error: 'Service-role client unavailable' }, { status: 503 });
    }

    // Update status only after org membership and write role are verified
    const { error: statusUpdateError } = await adminSupabase
      .from('hiring_runs')
      .update({ sourcing_status: 'searching' })
      .eq('id', session.hiring_run_id);

    if (statusUpdateError) {
      return NextResponse.json({ error: 'Failed to update hiring run sourcing status' }, { status: 500 });
    }

    const result = await runSourcingAgent(adminSupabase, session.id, session.hiring_run_id, user.id);

    if (result.error) {
      return NextResponse.json({ error: result.error, message: result.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...result });

  } catch (err) {
    console.error('Auto-source trigger error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
