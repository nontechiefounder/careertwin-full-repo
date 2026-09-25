import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_EMPLOYER_ROLES = ['owner', 'admin', 'recruiter', 'hiring_manager', 'auditor'];
const CANONICAL_ACTIVE_STATUSES = ['active'];

export async function POST(request) {
  try {
    // 1. Authenticate requesting user
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    // 2. Parse request JSON body
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Request body must be a valid object' }, { status: 400 });
    }

    const { message, context } = body;

    // Validate message parameter
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'message must be a non-empty string' }, { status: 400 });
    }

    if (message.length > 2000) {
      return NextResponse.json({ error: 'message exceeds maximum length of 2000 characters' }, { status: 400 });
    }

    // Validate context parameter if present
    if (context !== undefined && (context === null || typeof context !== 'object' || Array.isArray(context))) {
      return NextResponse.json({ error: 'context must be a valid object' }, { status: 400 });
    }

    const reqOrgId = context?.org_id;
    const reqActiveRunId = context?.active_run_id;

    if (reqOrgId && (typeof reqOrgId !== 'string' || !UUID_REGEX.test(reqOrgId))) {
      return NextResponse.json({ error: 'Invalid org_id format' }, { status: 400 });
    }

    if (reqActiveRunId && (typeof reqActiveRunId !== 'string' || !UUID_REGEX.test(reqActiveRunId))) {
      return NextResponse.json({ error: 'Invalid active_run_id format' }, { status: 400 });
    }

    // 3. Resolve Organization Context
    let targetOrgId = reqOrgId;

    if (!targetOrgId) {
      // Query active organization memberships for user
      const { data: memberships, error: memErr } = await supabase
        .from('organization_memberships')
        .select('organization_id, membership_role')
        .eq('user_id', user.id)
        .eq('membership_status', 'active');

      if (memErr) {
        console.error('Authorized organization memberships query failed:', memErr.message);
        return NextResponse.json(
          {
            error: 'CHAT_DATA_UNAVAILABLE',
            safe_next_action: 'Open the relevant CareerTWiN workflow or retry later.'
          },
          { status: 503 }
        );
      }

      const activeMems = Array.isArray(memberships) ? memberships : [];

      if (activeMems.length === 1) {
        targetOrgId = activeMems[0].organization_id;
      } else {
        return NextResponse.json(
          {
            error: 'ORGANIZATION_CONTEXT_REQUIRED',
            safe_next_action: 'Select an organization before using hiring chat.'
          },
          { status: 400 }
        );
      }
    }

    // 4. Verify Active Organization Membership
    const membership = await getVerifiedOrgMembership(supabase, user.id, targetOrgId);
    if (!membership || !ALLOWED_EMPLOYER_ROLES.includes(membership.membership_role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 5. Query Organization Hiring Runs (Scoped strictly to targetOrgId)
    const { data: runs, error: runsErr } = await supabase
      .from('hiring_runs')
      .select('id, role_title, status, created_at, org_id')
      .eq('org_id', targetOrgId)
      .order('created_at', { ascending: false });

    if (runsErr) {
      console.error('Authorized chat hiring_runs query failed:', runsErr.message);
      return NextResponse.json(
        {
          error: 'CHAT_DATA_UNAVAILABLE',
          safe_next_action: 'Open the relevant CareerTWiN workflow or retry later.'
        },
        { status: 503 }
      );
    }

    const orgRuns = Array.isArray(runs) ? runs : [];

    // Validate active_run_id if explicitly provided
    if (reqActiveRunId) {
      const runMatch = orgRuns.find(r => r.id === reqActiveRunId);
      if (!runMatch) {
        return NextResponse.json(
          { error: 'Hiring run not found or does not belong to authorized organization' },
          { status: 404 }
        );
      }
    }

    // Filter canonical active runs (status in CANONICAL_ACTIVE_STATUSES: ['active'])
    const activeRuns = orgRuns.filter(r => CANONICAL_ACTIVE_STATUSES.includes(r.status));

    const trimmedMsg = message.trim();
    const lowerMsg = trimmedMsg.toLowerCase();

    let reply = "";
    let suggestions = [];
    let artifact = null;
    let sources = []; // Empty array until real attributable chat sources exist

    if (lowerMsg.includes("pipeline") || lowerMsg.includes("summary") || lowerMsg.includes("roles")) {
      const activeCount = activeRuns.length;
      const totalCount = orgRuns.length;

      if (activeCount > 0) {
        const roleTitles = activeRuns.map(r => r.role_title || "Untitled Role").slice(0, 3).join(", ");
        reply = `You currently have **${activeCount} active hiring run(s)** in your pipeline: ${roleTitles}. (Total hiring runs for organization: ${totalCount})`;
        suggestions = ["Show candidates", "Open role intake"];
      } else if (totalCount > 0) {
        reply = `You currently have **0 active hiring runs** in your pipeline out of ${totalCount} total run(s). Open role intake to launch a new pipeline.`;
        suggestions = ["Open role intake"];
      } else {
        reply = "You currently have **0 hiring runs** for this organization. Open role intake to get started.";
        suggestions = ["Open role intake"];
      }
    } else if (lowerMsg.includes("shortlist") || lowerMsg.includes("candidate") || lowerMsg.includes("review")) {
      // REQUIRE explicit run ID or an active run. Do NOT fall back to arbitrary inactive runs!
      const targetRun = reqActiveRunId
        ? orgRuns.find(r => r.id === reqActiveRunId)
        : activeRuns[0];

      if (targetRun) {
        // Query candidates for target active run
        const { data: candidates, error: candErr } = await supabase
          .from('candidates')
          .select('id, candidate_id, status, decision_packet')
          .eq('hiring_run_id', targetRun.id);

        if (candErr) {
          console.error('Authorized chat candidates query failed:', candErr.message);
          return NextResponse.json(
            {
              error: 'CHAT_DATA_UNAVAILABLE',
              safe_next_action: 'Open the relevant CareerTWiN workflow or retry later.'
            },
            { status: 503 }
          );
        }

        const runCandidates = Array.isArray(candidates) ? candidates : [];

        if (runCandidates.length > 0) {
          reply = `Found **${runCandidates.length} candidate(s)** associated with the **${targetRun.role_title || 'Role'}** pipeline.`;
          // Neutral artifact type CANDIDATES (never claim it is a proof-ranked shortlist)
          artifact = {
            title: `${targetRun.role_title || 'Active Role'} Candidates`,
            type: "CANDIDATES",
            href: `/employer/shortlist/${targetRun.id}`
          };
          suggestions = ["Give me a summary of my current hiring pipeline"];
        } else {
          reply = `No candidates have been ingested yet for the **${targetRun.role_title || 'Role'}** pipeline.`;
          suggestions = ["Give me a summary of my current hiring pipeline", "Open role intake"];
        }
      } else if (orgRuns.length > 0) {
        reply = "No active hiring run is currently selected. Select an active role or open role intake to start candidate review.";
        suggestions = ["Open role intake"];
      } else {
        reply = "No hiring runs found for this organization. Open role intake to start a candidate pipeline.";
        suggestions = ["Open role intake"];
      }
    } else {
      reply = "This chat cannot answer that request from authorized live data yet. Open the relevant CareerTWiN workflow to review it directly.";
      suggestions = [
        "Give me a summary of my current hiring pipeline",
        "Show candidates",
        "Open role intake"
      ];
    }

    return NextResponse.json({
      reply,
      suggestions,
      artifact,
      sources
    });

  } catch (err) {
    console.error('Chat API Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
