import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';

const ALLOWED_VIEW_ROLES = ['owner', 'admin', 'recruiter', 'hiring_manager', 'auditor'];

export async function GET(request) {
  try {
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    const requestedOrgId = request.nextUrl?.searchParams?.get('org_id');
    let allowedOrgIds = [];

    if (requestedOrgId) {
      const membership = await getVerifiedOrgMembership(supabase, user.id, requestedOrgId);
      if (!membership || membership.membership_status !== 'active' || !ALLOWED_VIEW_ROLES.includes(membership.membership_role)) {
        return NextResponse.json({ error: 'Forbidden: Insufficient organization privileges' }, { status: 403 });
      }
      allowedOrgIds = [requestedOrgId];
    } else {
      const { data: memberships, error: memErr } = await supabase
        .from('organization_memberships')
        .select('organization_id, membership_role')
        .eq('user_id', user.id)
        .eq('membership_status', 'active')
        .in('membership_role', ALLOWED_VIEW_ROLES);

      if (memErr) {
        return NextResponse.json({ error: 'Failed to verify organization memberships' }, { status: 500 });
      }
      if (!memberships || memberships.length === 0) {
        return NextResponse.json({ error: 'Forbidden: Employer organization membership required' }, { status: 403 });
      }
      allowedOrgIds = memberships.map((m) => m.organization_id);
    }

    const { data: runs, error: runsError } = await supabase
      .from('hiring_runs')
      .select('*')
      .in('org_id', allowedOrgIds)
      .order('created_at', { ascending: false });

    if (runsError) {
      return NextResponse.json({ error: 'Failed to load hiring run analytics' }, { status: 500 });
    }

    const runIds = (runs || []).map((r) => r.id);
    let actualCandidates = [];
    if (runIds.length > 0) {
      const { data: candidates, error: candError } = await supabase
        .from('candidates')
        .select('*')
        .in('hiring_run_id', runIds);

      if (candError) {
        return NextResponse.json({ error: 'Failed to load candidate analytics' }, { status: 500 });
      }
      actualCandidates = candidates || [];
    }

    const { data: events, error: eventsError } = await supabase
      .from('activity_events')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(15);

    if (eventsError) {
      return NextResponse.json({ error: 'Failed to load activity analytics' }, { status: 500 });
    }

    // Aggregate statistics
    const active_roles = (runs || []).length;
    const total_candidates = actualCandidates.length;
    const total_shortlisted = actualCandidates.filter(c => c.status === 'shortlisted').length;
    const screens_completed = actualCandidates.filter(c => c.screening_status === 'completed').length;
    const packets_generated = actualCandidates.filter(c => !!c.decision_packet).length;

    // Stage counts
    const stage_counts = actualCandidates.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      summary: {
        active_roles,
        total_candidates,
        total_shortlisted,
        screens_completed,
        packets_generated
      },
      stage_counts,
      runs: (runs || []).map(r => ({
        ...r,
        candidates_count: actualCandidates.filter(c => c.hiring_run_id === r.id).length,
        shortlisted_count: actualCandidates.filter(c => c.hiring_run_id === r.id && c.status === 'shortlisted').length,
        screens_completed: actualCandidates.filter(c => c.hiring_run_id === r.id && c.screening_status === 'completed').length
      })),
      recent_activity: events || []
    });

  } catch (err) {
    console.error('Analytics fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
