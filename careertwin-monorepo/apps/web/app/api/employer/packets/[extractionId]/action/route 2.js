import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendGmailEmail } from '@/lib/gmail';
import { sendSMTPEmail } from '@/lib/smtp';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.CAREERTWIN_STAGING_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST(request, { params }) {
  try {
    const { extractionId } = await params;
    const { action } = await request.json();

    // 1. ROUTE AUTHORIZATION FIRST — BEFORE creating or executing service-role client!
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    // Fetch candidate entry using user authorization context
    let { data: extraction, error: fetchError } = await supabase
      .from('candidates')
      .select('id, hiring_runs(org_id)')
      .eq('id', extractionId)
      .maybeSingle();

    if (!extraction && !fetchError) {
      const { data: fallback } = await supabase
        .from('candidates')
        .select('id, hiring_runs(org_id)')
        .eq('candidate_id', extractionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      extraction = fallback;
    }

    if (!extraction) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    // 2. VERIFY ACTIVE EMPLOYER ORG MEMBERSHIP BEFORE ANY SIDE EFFECTS
    const orgId = extraction.hiring_runs?.org_id;
    const membership = await getVerifiedOrgMembership(supabase, user.id, orgId);
    if (!membership || !['owner', 'recruiter'].includes(membership.membership_role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 3. Update candidate status
    let dbStatus = action === 'advance' ? 'shortlisted' : action === 'hold' ? 'hold' : 'rejected';
    
    // Create narrow adminClient ONLY after authentication + org authorization succeed
    const adminClient = getAdminClient();
    const { data: candidate, error: updateError } = await adminClient
      .from('candidates')
      .update({ status: dbStatus })
      .eq('id', extraction.id)
      .select('*, candidate_profiles(*), hiring_runs(*)')
      .single();

    if (updateError) {
      console.error('Status update error:', updateError);
      return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
    }

    // Record auditable human decision activity event with actor identity
    await adminClient.from('activity_events').insert([{
      event_type: dbStatus,
      title: `Human Action: ${action.toUpperCase()}`,
      description: `Candidate status updated to ${dbStatus} by authenticated user ${user.id} (${user.email}).`
    }]);

    // 4. Trigger Email Sequence if Advanced
    if (action === 'advance') {
      await handleAdvanceSequence(adminClient, user.id, candidate);
    }

    return NextResponse.json({ success: true, status: dbStatus });

  } catch (err) {
    console.error('Action error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handleAdvanceSequence(supabase, employerId, candidate) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('gmail_refresh_token, gmail_email, name')
    .eq('id', employerId)
    .single();

  const candidateName = candidate.candidate_profiles?.name || 'there';
  let candidateEmail = candidate.candidate_profiles?.email;
  if (candidateEmail && typeof candidateEmail === 'string' && candidateEmail.startsWith('[')) {
    try {
      const parsed = JSON.parse(candidateEmail);
      if (Array.isArray(parsed)) candidateEmail = parsed[0];
    } catch (e) {}
  }

  const roleTitle = candidate.hiring_runs?.role_title || 'the role';
  const senderName = profile?.name || 'CareerTWiN Team';

  // Strict Fail-Closed Dry-Run Boundary (CTW-IP-098): Unless CAREERTWIN_DRY_RUN_EMAIL is explicitly 'false', all outreach emails are dry_run!
  const isDryRun = process.env.CAREERTWIN_DRY_RUN_EMAIL !== 'false';
  const targetCandidateProfileId = candidate.candidate_id || candidate.id;

  const day0Subject = `Next step for the ${roleTitle} opportunity`;
  const day0Body = `
    <p>Hi ${candidateName},</p>
    <p>Thanks for getting back to us.</p>
    <p>Based on your background, we think you may be a strong fit for the <strong>${roleTitle}</strong> role we’re working on.</p>
    <p>The next step is a short profile setup so we can evaluate your background properly and move you into the active process.</p>
    <p><a href="${process.env.NEXT_PUBLIC_URL}/candidate/onboarding/${candidate.candidate_id}" style="padding: 10px 20px; background: #000; color: #fff; text-decoration: none; border-radius: 5px;">Complete your profile here</a></p>
    <p>It should only take a few minutes.</p>
    <p>Best,<br>${senderName}<br>CareerTWiN</p>
  `;

  let day0Status = 'dry_run';
  let day0Error = 'Dry run active: external candidate email suppressed for pilot safety.';
  
  if (!isDryRun) {
    try {
      if (!candidateEmail) {
        day0Status = 'failed';
        day0Error = 'Candidate has no email address associated with their profile.';
      } else if (profile?.gmail_refresh_token) {
        await sendGmailEmail(profile.gmail_refresh_token, {
          to: candidateEmail,
          subject: day0Subject,
          body: day0Body
        });
        day0Status = 'sent';
        day0Error = null;
      } else if (process.env.SYSTEM_EMAIL_USER) {
        await sendSMTPEmail({
          to: candidateEmail,
          subject: day0Subject,
          body: day0Body,
          fromName: senderName
        });
        day0Status = 'sent_via_system';
        day0Error = null;
      } else {
        day0Status = 'failed';
        day0Error = 'No Gmail connected and no system fallback configured.';
      }
    } catch (err) {
      day0Status = 'failed';
      day0Error = err.message || String(err);
    }
  }

  await supabase.from('scheduled_emails').insert([{
    employer_id: employerId,
    candidate_id: targetCandidateProfileId,
    sequence_day: 0,
    scheduled_for: new Date().toISOString(),
    subject: day0Subject,
    body: day0Body,
    status: day0Status,
    error_details: day0Error,
    sent_at: day0Status.includes('sent') ? new Date().toISOString() : null
  }]);

  const day2Date = new Date();
  day2Date.setDate(day2Date.getDate() + 2);
  
  const day5Date = new Date();
  day5Date.setDate(day5Date.getDate() + 5);

  const onboardingLink = `${process.env.NEXT_PUBLIC_URL}/candidate/onboarding/${candidate.candidate_id}`;

  const scheduledEmails = [
    {
      employer_id: employerId,
      candidate_id: targetCandidateProfileId,
      sequence_day: 2,
      scheduled_for: day2Date.toISOString(),
      subject: `Follow-up: ${roleTitle} opportunity`,
      body: `
        <p>Hi ${candidateName},</p>
        <p>Just checking in to see if you had a chance to look at the overview I sent earlier for the <strong>${roleTitle}</strong> role.</p>
        <p>We're really impressed by your background and would love to have your profile ready for the team to review.</p>
        <p><a href="${onboardingLink}">Continue your profile setup here</a></p>
        <p>Best,<br>${senderName}</p>
      `,
      status: isDryRun ? 'dry_run' : 'pending',
      error_details: isDryRun ? 'Dry run active: external candidate email suppressed for pilot safety.' : null
    },
    {
      employer_id: employerId,
      candidate_id: targetCandidateProfileId,
      sequence_day: 5,
      scheduled_for: day5Date.toISOString(),
      subject: `Final nudge: ${roleTitle} role`,
      body: `
        <p>Hi ${candidateName},</p>
        <p>I'm sending this one last note regarding the <strong>${roleTitle}</strong> role. We're moving into the final review stage and would love to include your profile if you're still interested.</p>
        <p>If you have a moment, you can complete the setup here:</p>
        <p><a href="${onboardingLink}">Complete your profile</a></p>
        <p>Otherwise, feel free to let me know if the timing isn't right.</p>
        <p>Best,<br>${senderName}</p>
      `,
      status: isDryRun ? 'dry_run' : 'pending',
      error_details: isDryRun ? 'Dry run active: external candidate email suppressed for pilot safety.' : null
    }
  ];

  await supabase.from('scheduled_emails').insert(scheduledEmails);
}
