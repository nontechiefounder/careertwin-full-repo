import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  try {
    const { candidateId } = await params;
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    // Check candidate ownership OR employer access
    let isAuthorized = user.id === candidateId;
    if (!isAuthorized) {
      const { data: candidateRow } = await supabase
        .from('candidates')
        .select('hiring_runs(org_id)')
        .eq('candidate_id', candidateId)
        .maybeSingle();
      
      const orgId = candidateRow?.hiring_runs?.org_id;
      if (orgId) {
        const mem = await getVerifiedOrgMembership(supabase, user.id, orgId);
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

    // Fetch proof profile from DB
    const { data: proof } = await supabase
      .from('proof_profiles')
      .select('*')
      .eq('candidate_id', candidateId)
      .maybeSingle();

    return NextResponse.json({
      candidate: candidate,
      proof_profile: proof || null
    });

  } catch (err) {
    console.error('Proof profile fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
