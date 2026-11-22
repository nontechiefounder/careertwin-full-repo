import { NextResponse } from 'next/server';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { getAshbySandboxJobs, importAshbySandboxJob } from '@/lib/integrations/ashby/ashbySandbox';
import { importAshbyLiveJob } from '@/lib/integrations/ashby/ashbyPipeline';
import { ashbyClient } from '@/lib/integrations/ashby/ashbyClient';

const ALLOWED_EMPLOYER_ROLES = ['owner', 'admin', 'recruiter', 'hiring_manager'];

export async function GET(request) {
  try {
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;

    const liveApiStatus = ashbyClient.getConnectionStatus();
    const sandboxJobs = getAshbySandboxJobs();

    return NextResponse.json({
      ok: true,
      provider: "ashby",
      live_api: liveApiStatus,
      synthetic_sandbox: {
        status: "available",
        source_type: "local_synthetic_sandbox_fixture",
        jobs: sandboxJobs
      },
      write_back_supported: false, // Strict contract: read-only intake
      message: liveApiStatus.configured
        ? "Live Ashby API configured."
        : "Live Ashby API is BLOCKED (ASHBY_API_KEY unprovisioned). Local synthetic sandbox fixtures available."
    });
  } catch (err) {
    console.error('[API Ashby GET] Error:', err);
    return NextResponse.json({ error: 'Failed to retrieve Ashby integration status' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    let body = {};
    try {
      body = await request.json();
    } catch (_) {}

    const {
      job_id = "ashby_job_dist_sys_01",
      org_id,
      dry_run = false,
      mode
    } = body;

    if (mode !== "live" && mode !== "synthetic_sandbox") {
      return NextResponse.json({
        error: "INVALID_IMPORT_MODE",
        message: "Explicit mode ('live' or 'synthetic_sandbox' in non-production) is required."
      }, { status: 400 });
    }

    if (mode === "synthetic_sandbox" && process.env.NODE_ENV === "production") {
      return NextResponse.json({
        error: "SANDBOX_DISABLED_IN_PRODUCTION",
        message: "Synthetic sandbox imports are prohibited in production."
      }, { status: 403 });
    }

    if (mode === "live") {
      const liveStatus = ashbyClient.getConnectionStatus();
      if (liveStatus.status === "BLOCKED") {
        return NextResponse.json({
          error: "ASHBY_CREDENTIALS_UNCONFIGURED",
          status: "BLOCKED",
          message: liveStatus.reason,
          safe_next_action: "Provide ASHBY_API_KEY in environment."
        }, { status: 503 });
      }
      if (!job_id) {
        return NextResponse.json({ error: "job_id is required when mode is 'live'." }, { status: 400 });
      }
    }

    // Resolve target organization (fail closed when user lacks active employer membership)
    let targetOrgId = org_id;
    if (targetOrgId) {
      const membership = await getVerifiedOrgMembership(supabase, user.id, targetOrgId);
      if (!membership || membership.membership_status !== 'active' || !ALLOWED_EMPLOYER_ROLES.includes(membership.membership_role)) {
        return NextResponse.json({ error: 'Forbidden: Insufficient organization privileges' }, { status: 403 });
      }
    } else {
      const { data: memberships } = await supabase
        .from('organization_memberships')
        .select('organization_id, membership_role')
        .eq('user_id', user.id)
        .eq('membership_status', 'active')
        .in('membership_role', ALLOWED_EMPLOYER_ROLES);

      if (!memberships || memberships.length === 0) {
        return NextResponse.json({ error: 'Forbidden: No active employer organization membership' }, { status: 403 });
      }
      targetOrgId = memberships[0].organization_id;
    }

    const result = mode === "live"
      ? await importAshbyLiveJob({
          ashbyClient,
          supabase,
          userId: user.id,
          orgId: targetOrgId,
          jobId: job_id,
          dryRun: Boolean(dry_run)
        })
      : await importAshbySandboxJob({
          supabase,
          userId: user.id,
          orgId: targetOrgId,
          jobId: job_id,
          dryRun: Boolean(dry_run)
        });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[API Ashby POST] Import error:', err);
    return NextResponse.json({
      error: 'ASHBY_IMPORT_FAILED',
      message: err.message,
      safe_next_action: 'Verify sandbox job ID or retry.'
    }, { status: 500 });
  }
}
