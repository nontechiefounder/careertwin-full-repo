import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.CAREERTWIN_STAGING_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("FAIL-CLOSED ERROR: SUPABASE_SERVICE_ROLE_KEY is missing.");
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function GET(request, { params }) {
  try {
    const { extractionId } = await params;

    // 1. ROUTE AUTHORIZATION FIRST
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

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

    const mappedExtraction = {
      ...extraction,
      candidate_name: extraction.candidate_profiles?.name,
      current_role: extraction.candidate_profiles?.bio,
      location: extraction.candidate_profiles?.location,
      skills: extraction.candidate_profiles?.skills || []
    };

    // 3. ADMIN CLIENT SCOPED RETRIEVAL FOR EMAIL METADATA (Fail-Closed)
    const targetCandProfileId = extraction.candidate_id || extraction.id;
    let emails = [];
    try {
      const adminClient = getAdminClient();
      const { data: emailData, error: emailErr } = await adminClient
        .from('scheduled_emails')
        .select('*')
        .eq('candidate_id', targetCandProfileId)
        .order('scheduled_for', { ascending: true });

      if (!emailErr && emailData) {
        emails = emailData;
      }
    } catch (e) {
      console.warn("Scheduled emails fetch warning:", e.message);
    }

    return NextResponse.json({
      packet: extraction.decision_packet,
      extraction: mappedExtraction,
      hiring_run: extraction.hiring_runs,
      emails: emails
    });

  } catch (err) {
    console.error('Packet Fetch Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
