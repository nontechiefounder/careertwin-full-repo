import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  try {
    const { candidateId } = await params;
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    // Candidate ownership OR active org membership check
    let isAuthorized = user.id === candidateId;
    if (!isAuthorized) {
      const { data: candidateRow } = await supabase
        .from('candidates')
        .select('hiring_runs(org_id)')
        .eq('candidate_id', candidateId)
        .maybeSingle();
      if (candidateRow?.hiring_runs?.org_id) {
        const mem = await getVerifiedOrgMembership(supabase, user.id, candidateRow.hiring_runs.org_id);
        if (mem) isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch candidate profile from DB
    const { data: candidate, error: candError } = await supabase
      .from('candidate_profiles')
      .select('*')
      .eq('id', candidateId)
      .single();

    if (candError || !candidate) {
      return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 });
    }

    // Fetch proof profile
    const { data: proof } = await supabase
      .from('proof_profiles')
      .select('*')
      .eq('candidate_id', candidateId)
      .maybeSingle();

    // Fetch extractions
    const { data: extractions } = await supabase
      .from('candidates')
      .select('*')
      .eq('candidate_id', candidateId);

    // Fetch screening sessions
    const { data: screens } = await supabase
      .from('screening_sessions')
      .select('*, screening_summaries(*)')
      .eq('candidate_id', candidateId);

    const onboardStatus = candidate.name ? 'completed' : 'not_started';
    const proofStatus = proof ? 'completed' : 'not_started';
    const screenStatus = screens?.some(s => s.status === 'completed') ? 'completed' :
      screens?.some(s => s.status === 'started') ? 'active' : 'not_started';

    return NextResponse.json({
      candidate: candidate,
      proof_profile: proof || null,
      extractions: extractions || [],
      screening_sessions: screens?.map(s => ({
        session: { id: s.id, status: s.status },
        summary: s.screening_summaries
      })) || [],
      onboarding_status: onboardStatus,
      proof_status: proofStatus,
      screen_status: screenStatus
    });

  } catch (err) {
    console.error('Candidate status fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
