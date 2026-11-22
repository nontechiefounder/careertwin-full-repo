import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';

const ALLOWED_EMPLOYER_ROLES = ['owner', 'admin', 'recruiter', 'hiring_manager'];

export async function POST(request) {
  try {
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    const body = await request.json().catch(() => ({}));
    const { hiring_run_id, candidate, operation_id } = body;

    if (!hiring_run_id || typeof hiring_run_id !== 'string') {
      return NextResponse.json({ error: 'hiring_run_id is required', code: 'MISSING_HIRING_RUN' }, { status: 400 });
    }

    if (!candidate || typeof candidate !== 'object') {
      return NextResponse.json({ error: 'candidate payload is required', code: 'MISSING_CANDIDATE' }, { status: 400 });
    }

    // Verify hiring run and org membership
    const { data: run, error: runError } = await supabase
      .from('hiring_runs')
      .select('id, org_id, role_title')
      .eq('id', hiring_run_id)
      .maybeSingle();

    if (runError || !run) {
      return NextResponse.json({ error: 'Role not found', code: 'ROLE_NOT_FOUND' }, { status: 404 });
    }

    const membership = await getVerifiedOrgMembership(supabase, user.id, run.org_id);
    if (!membership || membership.membership_status !== 'active') {
      return NextResponse.json({ error: 'Forbidden: Inactive or missing organization membership', code: 'FORBIDDEN' }, { status: 403 });
    }

    // Role boundary: Auditors cannot mutate shortlists
    if (membership.membership_role === 'auditor') {
      return NextResponse.json(
        {
          error: 'Auditor accounts have read-only access and cannot add candidates to the shortlist.',
          code: 'AUDITOR_READ_ONLY'
        },
        { status: 403 }
      );
    }

    if (!ALLOWED_EMPLOYER_ROLES.includes(membership.membership_role)) {
      return NextResponse.json({ error: 'Forbidden: Insufficient role permissions to mutate shortlist', code: 'FORBIDDEN' }, { status: 403 });
    }

    const candidateName = candidate.name || 'Unnamed Candidate';
    const linkedinUrl = candidate.linkedin_url || null;
    const providerCandidateId = candidate.id ? String(candidate.id) : (linkedinUrl || null);
    const candidateLocation = candidate.candidate_location || candidate.location || null;
    const candidateHeadline = candidate.headline || null;
    const currentTitle = candidate.current_title || null;
    const currentCompany = candidate.current_employer || null;
    const skills = Array.isArray(candidate.skills) ? candidate.skills : [];
    // Require explicit sourcing provider attribution; never substitute a default provider.
    const ALLOWED_PROVIDERS = ['datavertex', 'coresignal'];
    const rawProvider = candidate.source_provider || candidate.provider;
    if (!rawProvider || !ALLOWED_PROVIDERS.includes(rawProvider)) {
      return NextResponse.json(
        { error: 'Valid source_provider (datavertex or coresignal) is required', code: 'INVALID_SOURCE_PROVIDER' },
        { status: 400 }
      );
    }
    const sourceProvider = rawProvider;

    // Build truthful, unembellished decision packet
    // Explicitly states provider-supplied career data without fabricating PDF provenance or fit scores
    const retrievalTimestamp = new Date().toISOString();
    const decisionPacket = {
      provider: sourceProvider,
      provider_candidate_id: providerCandidateId,
      source_url: linkedinUrl,
      retrieval_timestamp: retrievalTimestamp,
      operation_id: operation_id || `src_add_${Date.now()}`,
      verification_status: 'UNVERIFIED_PROVIDER_PROFILE',
      is_third_party_verified: false,
      evaluation_metrics: {
        decision_readiness: 'NEEDS PROOF',
        proof_status: 'PROVIDER_PROFILE_ONLY',
        summary: 'Candidate profile returned by an external sourcing provider. Unverified provider career record — requires recruiter document upload for proof verification.',
      },
      ledger_revision: 1,
      rubric_version: '1.0',
      career_history: candidate.job_history || [],
      education: candidate.education || [],
      skills: skills,
      languages: candidate.languages || [],
      certifications: candidate.certifications || [],
      headline: candidateHeadline,
      current_title: currentTitle,
      current_employer: currentCompany,
    };

    // Execute atomic shortlist addition via database RPC
    const { data: rpcRows, error: rpcError } = await supabase.rpc(
      'shortlist_candidate_from_provider_transactional',
      {
        p_actor_id: user.id,
        p_hiring_run_id: hiring_run_id,
        p_provider: sourceProvider,
        p_provider_candidate_id: providerCandidateId,
        p_source_url: linkedinUrl,
        p_candidate_name: candidateName,
        p_candidate_location: candidateLocation,
        p_candidate_headline: candidateHeadline || (currentTitle ? `${currentTitle}${currentCompany ? ' at ' + currentCompany : ''}` : null),
        p_skills: skills,
        p_retrieval_timestamp: retrievalTimestamp,
        p_operation_id: operation_id || `src_add_${Date.now()}`,
        p_decision_packet: decisionPacket,
      }
    );

    if (rpcError) {
      console.error('Shortlist RPC database error:', rpcError);
      const isForbidden = rpcError.code === '42501' || rpcError.message?.includes('RPC_FORBIDDEN');
      if (isForbidden) {
        return NextResponse.json(
          { error: rpcError.message || 'Forbidden', code: 'FORBIDDEN' },
          { status: 403 }
        );
      }
      const isMissingRpc =
        rpcError.code === 'PGRST202' ||
        rpcError.message?.includes('schema cache') ||
        (rpcError.message?.includes('function') && rpcError.message?.includes('does not exist'));
      if (isMissingRpc) {
        return NextResponse.json(
          { error: 'Transactional shortlist RPC unavailable', code: 'SHORTLIST_RPC_UNAVAILABLE' },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: 'Failed to add candidate to shortlist', code: 'SHORTLIST_INSERT_FAILED', details: rpcError.message },
        { status: 500 }
      );
    }

    const rpcResult = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
    const isReplayed = Boolean(rpcResult?.replayed);

    return NextResponse.json({
      success: true,
      replayed: isReplayed,
      candidate_id: rpcResult?.candidate_id,
      candidate_profile_id: rpcResult?.candidate_profile_id,
      message: isReplayed
        ? `${candidateName} is already shortlisted for this role.`
        : `${candidateName} added to shortlist successfully.`
    });
  } catch (err) {
    console.error('Shortlist route unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
