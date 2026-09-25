import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';

/**
 * Server-originated Screening Session Creation Endpoint.
 * Allows authenticated employer org members to create candidate screening sessions
 * via server-side service-role client (because client INSERT is revoked on screening_sessions table).
 */
export async function POST(request) {
  try {
    // 1. ROUTE AUTHORIZATION FIRST — BEFORE parsing body or creating service-role client!
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    const { hiring_run_id, candidate_id, questions } = await request.json();

    if (!hiring_run_id || !candidate_id) {
      return NextResponse.json({ error: 'hiring_run_id and candidate_id are required' }, { status: 400 });
    }

    // 2. Fetch hiring run using user client to verify organization ownership
    const { data: run, error: runError } = await supabase
      .from('hiring_runs')
      .select('id, org_id')
      .eq('id', hiring_run_id)
      .maybeSingle();

    if (runError || !run) {
      return NextResponse.json({ error: 'Hiring run not found' }, { status: 404 });
    }

    // 3. Verify Active Employer Org Membership (owner or recruiter role required)
    const orgId = run.org_id;
    const membership = await getVerifiedOrgMembership(supabase, user.id, orgId);
    if (!membership || !['owner', 'recruiter'].includes(membership.membership_role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 4. Verify candidate belongs to specified hiring run
    const { data: candidate, error: candError } = await supabase
      .from('candidates')
      .select('id, candidate_id')
      .eq('candidate_id', candidate_id)
      .eq('hiring_run_id', hiring_run_id)
      .maybeSingle();

    if (candError || !candidate) {
      return NextResponse.json({ error: 'Candidate not found in specified hiring run' }, { status: 404 });
    }

    // 5. Create screening session using trusted server service-role client
    const supabaseService = await createSupabaseServerClient(request, true);
    const { data: session, error: insertError } = await supabaseService
      .from('screening_sessions')
      .insert([{
        candidate_id: candidate_id,
        hiring_run_id: hiring_run_id,
        status: 'not_started',
        questions: questions || [],
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (insertError) {
      console.error('Screening session creation error:', insertError);
      return NextResponse.json({ error: 'Failed to create screening session' }, { status: 500 });
    }

    return NextResponse.json({
      ...session,
      session_id: session.id
    }, { status: 201 });

  } catch (err) {
    console.error('Screening session creation unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
