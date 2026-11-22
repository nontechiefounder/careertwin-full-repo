import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { searchCandidates } from '@/lib/sourcing';

const ALLOWED_EMPLOYER_ROLES = ['owner', 'admin', 'recruiter', 'hiring_manager'];

export async function POST(request) {
  try {
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    const body = await request.json().catch(() => ({}));
    const { hiring_run_id, search_criteria, free_text_search, jd_search, page_size, start, include_similar_titles, operation_id } = body;

    if (!hiring_run_id || typeof hiring_run_id !== 'string') {
      return NextResponse.json({ error: 'hiring_run_id is required', code: 'MISSING_HIRING_RUN' }, { status: 400 });
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

    // Role boundary: Auditors cannot trigger paid search actions
    if (membership.membership_role === 'auditor') {
      return NextResponse.json(
        {
          error: 'Auditor accounts have read-only access and cannot trigger candidate sourcing or paid search operations.',
          code: 'AUDITOR_READ_ONLY'
        },
        { status: 403 }
      );
    }

    if (!ALLOWED_EMPLOYER_ROLES.includes(membership.membership_role)) {
      return NextResponse.json({ error: 'Forbidden: Insufficient role permissions for candidate sourcing', code: 'FORBIDDEN' }, { status: 403 });
    }

    try {
      const serviceSupabase = await createSupabaseServerClient(request, true);
      const results = await searchCandidates({
        supabase: serviceSupabase,
        org_id: run.org_id,
        hiring_run_id: run.id,
        actor_id: user.id,
        operation_id,
        search_criteria,
        free_text_search,
        jd_search,
        page_size,
        start,
        include_similar_titles,
      });

      return NextResponse.json(results);
    } catch (err) {
      if (err.code === 'DATAVERTEX_UNCONFIGURED' || err.code === 'SOURCING_PROVIDER_UNCONFIGURED') {
        return NextResponse.json(
          {
            error: 'No candidate sourcing provider is configured in this environment, so live candidate searches cannot run.',
            code: 'SOURCING_PROVIDER_UNCONFIGURED'
          },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { error: err.message || 'Candidate search failed', code: err.code || 'SEARCH_FAILED' },
        { status: err.status || 500 }
      );
    }
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
