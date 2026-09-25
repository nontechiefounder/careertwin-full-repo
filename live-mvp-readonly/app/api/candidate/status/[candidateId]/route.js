import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  try {
    const { candidateId } = await params;
    const supabase = await createSupabaseServerClient(request);

    // Fetch candidate
    let { data: candidate, error: candError } = await supabase
      .from('candidate_profiles')
      .select('*')
      .eq('id', candidateId)
      .single();

    if (candError) {
      // Fallback for dev: mock candidate
      candidate = { id: candidateId, name: 'Test Candidate', location: 'San Francisco', target_roles: ['Backend Engineer'] };
    }

    // Fetch proof profile
    let { data: proof } = await supabase
      .from('proof_profiles')
      .select('*')
      .eq('candidate_id', candidateId)
      .single();

    // Fallback for dev: assume generated if it's missing in DB during this phase
    if (!proof) {
      proof = { candidate_id: candidateId, summary: 'Mock summary', proof_strength: 0.75, proof_completeness: 0.82 };
    }

    // Fetch extractions (where this candidate was sourced)
    const { data: extractions } = await supabase
      .from('candidates')
      .select('*')
      .eq('candidate_id', candidateId); // candidate_id link from 'candidates' to 'candidate_profiles'

    // Fetch screening sessions
    const { data: screens } = await supabase
      .from('screening_sessions')
      .select('*, screening_summaries(*)')
      .eq('candidate_id', candidateId);

    // Calculate statuses
    const onboardStatus = candidate.name ? 'completed' : 'not_started';
    const proofStatus = proof ? 'completed' : 'not_started';
    const screenStatus = screens?.some(s => s.status === 'completed') ? 'completed' :
      screens?.some(s => s.status === 'started') ? 'active' : 'not_started';

    return NextResponse.json({
      candidate: candidate,
      proof_profile: proof,
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
