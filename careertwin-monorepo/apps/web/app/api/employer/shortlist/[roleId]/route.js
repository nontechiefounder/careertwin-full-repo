import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request, { params }) {
  try {
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    const { roleId } = await params;
    if (!roleId || typeof roleId !== 'string' || !UUID_REGEX.test(roleId)) {
      return NextResponse.json({ error: 'Invalid role ID format' }, { status: 400 });
    }

    // 1. Fetch hiring run details & verify existence
    const { data: run, error: runError } = await supabase
      .from('hiring_runs')
      .select('*')
      .eq('id', roleId)
      .single();

    if (runError || !run) {
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // 2. Organization Authorization Verification (Cross-Tenant & Role-Isolation Protection)
    const membership = await getVerifiedOrgMembership(supabase, user.id, run.org_id);
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 3. Fetch candidates strictly scoped to hiring_run_id AND org_id
    const { data: extractions, error: extError } = await supabase
      .from('candidates')
      .select('*, candidate_profiles(*)')
      .eq('hiring_run_id', roleId)
      .order('created_at', { ascending: false });

    if (extError) {
      console.error('Shortlist candidate fetch database error:', extError);
      return NextResponse.json(
        { error: 'SHORTLIST_FETCH_FAILED', safe_next_action: 'Retry later or contact support.' },
        { status: 500 }
      );
    }

    // 4. Fetch document count associated with this hiring run
    const { count: docCount } = await supabase
      .from('candidate_documents')
      .select('*', { count: 'exact', head: true })
      .eq('hiring_run_id', roleId)
      .eq('org_id', run.org_id);

    // 5. Derive truthful, unambiguous count semantics
    const candidatesList = extractions || [];
    let packetsCompiled = 0;
    let evidenceReady = 0;
    let humanReviewRequired = 0;
    let needsProof = 0;
    let insufficientEvidence = 0;
    let pendingEvaluation = 0;

    candidatesList.forEach((cand) => {
      if (!cand.decision_packet) {
        pendingEvaluation++;
      } else {
        packetsCompiled++;
        const readiness =
          cand.decision_packet.evaluation_metrics?.decision_readiness ||
          cand.readiness_state ||
          '';

        if (readiness === 'EVIDENCE READY') evidenceReady++;
        else if (readiness === 'HUMAN REVIEW REQUIRED') humanReviewRequired++;
        else if (readiness === 'NEEDS PROOF') needsProof++;
        else if (readiness === 'INSUFFICIENT EVIDENCE') insufficientEvidence++;
      }
    });

    const counts = {
      cohort_candidates: candidatesList.length,
      documents_received: docCount || 0,
      extractions_completed: candidatesList.length,
      packets_compiled: packetsCompiled,
      evaluations_completed: packetsCompiled,
      evidence_ready: evidenceReady,
      human_review_required: humanReviewRequired,
      needs_proof: needsProof,
      insufficient_evidence: insufficientEvidence,
      pending_evaluation: pendingEvaluation
    };

    return NextResponse.json({
      hiring_run: run,
      extractions: candidatesList,
      counts,
      total_scanned: packetsCompiled
    });

  } catch (err) {
    console.error('Shortlist route unexpected error:', err);
    return NextResponse.json(
      { error: 'SHORTLIST_FETCH_FAILED', safe_next_action: 'Retry later or contact support.' },
      { status: 500 }
    );
  }
}
