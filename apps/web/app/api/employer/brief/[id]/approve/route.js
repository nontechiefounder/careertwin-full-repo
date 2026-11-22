import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';

/**
 * POST /api/employer/brief/[id]/approve
 * Explicitly approves the exact rubric version of a ProofContract.
 * Records the approver identity and timestamp, preventing inferred approvals.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;

    // 1. Authenticate employer
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    // 2. Fetch the hiring run
    const { data: run, error: runError } = await supabase
      .from('hiring_runs')
      .select('*, organizations(*)')
      .eq('id', id)
      .single();

    if (runError || !run) {
      return NextResponse.json({ error: 'Hiring run not found' }, { status: 404 });
    }

    // 3. Verify membership in organization
    const orgId = run.org_id;
    const membership = await getVerifiedOrgMembership(supabase, user.id, orgId);
    if (!membership || !['owner', 'recruiter', 'admin', 'hiring_manager'].includes(membership.membership_role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 4. Determine exact rubric version to approve
    const currentVersion = run.brief_json?.regenerated_at && run.brief_json?.contract_version
      ? run.brief_json.contract_version
      : (run.rubric_version || run.brief_json?.contract_version || run.contract_version || '1.0.0');
    const approvedAt = new Date().toISOString();

    const existingBrief = run.brief_json || {};
    const rawSummary = existingBrief.role_summary;
    const validSummary = (rawSummary && rawSummary !== 'undefined...' && rawSummary.trim().length >= 10) ? rawSummary : null;
    const descSummary = (run.job_description && run.job_description.trim()) ? run.job_description.slice(0, 300).trim() + "..." : null;
    const fallbackSummary = descSummary || `Overview of the ${run.role_title} position at ${run.company || 'the company'}.`;

    const updatedBriefJson = {
      role_summary: validSummary || fallbackSummary,
      explicit_requirements: existingBrief.explicit_requirements || existingBrief.must_haves || run.must_haves || [],
      inferred_requirements: existingBrief.inferred_requirements || existingBrief.nice_to_haves || run.nice_to_haves || [],
      disqualifiers: existingBrief.disqualifiers || run.disqualifiers || [],
      screening_dimensions: existingBrief.screening_dimensions || ["Technical Depth", "Core Experience", "Communication", "Culture Fit"],
      verification_focus: existingBrief.verification_focus || [
        `Verified professional history as a ${run.role_title}`,
        "Technical interview screening results",
        "Past project impact verification"
      ],
      missing_info: existingBrief.missing_info || (run.job_description ? [] : ["Detailed job description required"]),
      ...existingBrief,
      contract_approved: true,
      approved_by: user.id,
      approved_at: approvedAt,
      contract_version: currentVersion,
      approved_rubric_version: currentVersion,
      contract_status: 'approved',
    };

    // 5. Persist explicit approval to database
    const { error: updateError } = await supabase
      .from('hiring_runs')
      .update({
        brief_json: updatedBriefJson
      })
      .eq('id', id);

    if (updateError) {
      console.error('Failed to persist rubric approval:', updateError);
      return NextResponse.json({ error: 'Failed to persist approval' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      contract_approved: true,
      approved_by: user.id,
      approved_at: approvedAt,
      approved_rubric_version: currentVersion,
      hiring_run_id: id
    });
  } catch (err) {
    console.error('Rubric approval error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
