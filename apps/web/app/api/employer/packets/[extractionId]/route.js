import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  try {
    // 1. ROUTE AUTHORIZATION FIRST — BEFORE parameter format checks or DB lookups
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    const { extractionId } = await params;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!extractionId || !uuidRegex.test(extractionId)) {
      return NextResponse.json({ error: 'Invalid candidate extraction ID format' }, { status: 400 });
    }

    // Fetch candidate entry
    let { data: extraction, error: extError } = await supabase
      .from('candidates')
      .select('*, candidate_profiles(*), hiring_runs(id, org_id, role_title)')
      .eq('id', extractionId)
      .maybeSingle();

    if (!extraction && !extError) {
      const { data: fallback, error: fallbackError } = await supabase
        .from('candidates')
        .select('*, candidate_profiles(*), hiring_runs(id, org_id, role_title)')
        .eq('candidate_id', extractionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      extraction = fallback;
      extError = fallbackError;
    }

    if (extError || !extraction) {
      return NextResponse.json({ error: 'Candidate assessment not found' }, { status: 404 });
    }

    // 2. VERIFY ACTIVE ORG MEMBERSHIP (Owner, Recruiter, Hiring Manager, Auditor allowed)
    const orgId = extraction.hiring_runs?.org_id;
    const membership = await getVerifiedOrgMembership(supabase, user.id, orgId);
    if (!membership || !['owner', 'admin', 'recruiter', 'hiring_manager', 'auditor'].includes(membership.membership_role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const decisionRationale = extraction.decision_packet?.human_decision?.rationale || extraction.decision_rationale || null;

    const mappedExtraction = {
      ...extraction,
      decision_rationale: decisionRationale,
      candidate_name: extraction.candidate_profiles?.name,
      current_role: extraction.candidate_profiles?.bio,
      location: extraction.candidate_profiles?.location,
      skills: extraction.candidate_profiles?.skills || []
    };

    // 3. ADMIN CLIENT SCOPED RETRIEVAL FOR EMAIL METADATA (Fail-Closed & Tenant-Scoped)
    const targetCandProfileId = extraction.candidate_id || extraction.id;
    let emails = [];
    let emailsStatus = 'ready';
    try {
      const emailClient = await createSupabaseServerClient(request, true);
      const { data: emailData, error: emailErr } = await emailClient
        .from('scheduled_emails')
        .select('*')
        .eq('candidate_id', targetCandProfileId)
        .eq('org_id', orgId)
        .order('scheduled_for', { ascending: true });

      if (emailErr) {
        console.warn("Scheduled emails fetch error:", emailErr.message);
        emailsStatus = 'unavailable';
      } else if (emailData) {
        emails = emailData;
      }
    } catch (e) {
      console.warn("Scheduled emails fetch warning:", e.message);
      emailsStatus = 'unavailable';
    }

    return NextResponse.json({
      packet: extraction.decision_packet,
      extraction: mappedExtraction,
      hiring_run: extraction.hiring_runs,
      emails: emails,
      emails_status: emailsStatus
    });

  } catch (err) {
    console.error('Packet Fetch Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
