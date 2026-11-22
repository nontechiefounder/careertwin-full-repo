import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { getAccount, getCreditStatus } from '@/lib/sourcing';

const ALLOWED_EMPLOYER_ROLES = ['owner', 'admin', 'recruiter', 'hiring_manager'];

export async function GET(request) {
  try {
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    const url = new URL(request.url);
    const hiringRunId = url.searchParams.get('hiring_run_id');
    const orgIdParam = url.searchParams.get('org_id');

    let targetOrgId = orgIdParam;
    if (!targetOrgId && hiringRunId) {
      const { data: run } = await supabase
        .from('hiring_runs')
        .select('org_id')
        .eq('id', hiringRunId)
        .maybeSingle();
      if (run) targetOrgId = run.org_id;
    }

    let membership = null;
    if (targetOrgId) {
      membership = await getVerifiedOrgMembership(supabase, user.id, targetOrgId);
    } else {
      const { data: firstActive } = await supabase
        .from('organization_memberships')
        .select('organization_id, membership_role, membership_status')
        .eq('user_id', user.id)
        .eq('membership_status', 'active')
        .limit(1)
        .maybeSingle();
      if (firstActive) {
        membership = firstActive;
        targetOrgId = firstActive.organization_id;
      }
    }

    if (!membership || membership.membership_status !== 'active') {
      return NextResponse.json({ error: 'Forbidden: Inactive or missing organization membership', code: 'FORBIDDEN' }, { status: 403 });
    }

    if (membership.membership_role === 'auditor') {
      return NextResponse.json(
        {
          error: 'Auditor accounts have read-only access and cannot access provider sourcing account controls.',
          code: 'AUDITOR_READ_ONLY',
        },
        { status: 403 }
      );
    }

    if (!ALLOWED_EMPLOYER_ROLES.includes(membership.membership_role)) {
      return NextResponse.json({ error: 'Forbidden: Insufficient role permissions for sourcing account', code: 'FORBIDDEN' }, { status: 403 });
    }

    try {
      const serviceSupabase = await createSupabaseServerClient(request, true);
      const account = await getAccount();
      const status = await getCreditStatus(serviceSupabase, targetOrgId);
      return NextResponse.json({
        ...account,
        session_credits_used: status.session_credits_used,
        credit_ceiling: status.credit_ceiling,
        remaining_budget: status.remaining_budget,
      });
    } catch (err) {
      if (err.code === 'DATAVERTEX_UNCONFIGURED' || err.code === 'SOURCING_PROVIDER_UNCONFIGURED') {
        const serviceSupabase = await createSupabaseServerClient(request, true);
        const status = await getCreditStatus(serviceSupabase, targetOrgId);
        return NextResponse.json(
          {
            configured: false,
            error: 'No candidate sourcing provider is configured in this environment.',
            code: 'SOURCING_PROVIDER_UNCONFIGURED',
            session_credits_used: status.session_credits_used,
            credit_ceiling: status.credit_ceiling,
            remaining_budget: status.remaining_budget,
          },
          { status: 200 } // return 200 with configured: false so UI can show honest disabled state
        );
      }
      return NextResponse.json(
        { error: err.message || 'Failed to retrieve account info', code: err.code || 'SOURCING_PROVIDER_ERROR' },
        { status: err.status || 500 }
      );
    }
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
