import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_EMPLOYER_ROLES = ['owner', 'admin', 'recruiter', 'hiring_manager'];

export async function POST(request) {
  try {
    // 1. Fail-closed authentication
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const { hiring_run_id } = body || {};

    if (!hiring_run_id || typeof hiring_run_id !== 'string' || !UUID_REGEX.test(hiring_run_id)) {
      return NextResponse.json({ error: 'hiring_run_id must be a valid UUID' }, { status: 400 });
    }

    // 2. Fetch the hiring run to resolve org context
    const { data: run, error: runError } = await supabase
      .from('hiring_runs')
      .select('id, org_id, status')
      .eq('id', hiring_run_id)
      .single();

    if (runError || !run) {
      return NextResponse.json({ error: 'Hiring run not found' }, { status: 404 });
    }

    // 3. Verify org membership with role authorization
    const membership = await getVerifiedOrgMembership(supabase, user.id, run.org_id);
    if (!membership || !ALLOWED_EMPLOYER_ROLES.includes(membership.membership_role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 4. Private-pilot operating model (Part 3): Autonomous external sourcing via API
    //    is not active. Do not manufacture an unbacked DB session row with unproven status.
    //    Return a non-persistent capability-limited response describing founder-assisted handoff.
    return NextResponse.json({
      hiring_run_id,
      sourcing_status: 'founder_assisted_handoff',
      capability_active: false,
      operator_notice:
        'Autonomous external sourcing is not active in this pilot. Candidate document ingestion is founder-assisted via approved operational handoff.',
      safe_next_action:
        'Contact your pilot administrator through approved channels to initiate candidate document transfer.',
    });

  } catch (err) {
    console.error('Sourcing session unexpected error:', err);
    return NextResponse.json(
      {
        error: 'SOURCING_SESSION_CREATION_FAILED',
        safe_next_action: 'Retry later or contact your pilot administrator.',
      },
      { status: 500 }
    );
  }
}


