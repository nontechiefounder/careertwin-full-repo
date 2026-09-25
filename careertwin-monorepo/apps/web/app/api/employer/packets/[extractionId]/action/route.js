import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { sendGmailEmail } from '@/lib/gmail';
import { sendSMTPEmail } from '@/lib/smtp';

export async function POST(request, { params }) {
  try {
    const { extractionId } = await params;
    const { action } = await request.json();
    const supabase = await createSupabaseServerClient(request);
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Fetch the candidate entry first (with fallback support)
    let { data: extraction, error: fetchError } = await supabase
      .from('candidates')
      .select('id')
      .eq('id', extractionId)
      .maybeSingle();

    if (!extraction && !fetchError) {
      const { data: fallback } = await supabase
        .from('candidates')
        .select('id')
        .eq('candidate_id', extractionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      extraction = fallback;
    }

    if (!extraction) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    // 2. Update candidate status using the confirmed ID
    let dbStatus = action === 'advance' ? 'shortlisted' : action === 'hold' ? 'hold' : 'rejected';
    
    const { data: candidate, error: updateError } = await supabase
      .from('candidates')
      .update({ status: dbStatus })
      .eq('id', extraction.id)
      .select('*, candidate_profiles(*), hiring_runs(*)')
      .single();


    if (updateError) {
      console.error('Status update error:', updateError);
      return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
    }

    // 2. Trigger Email Sequence if Advanced
    if (action === 'advance') {
      await handleAdvanceSequence(supabase, user.id, candidate);
    }

    return NextResponse.json({ success: true, status: dbStatus });

  } catch (err) {
    console.error('Action error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handleAdvanceSequence(supabase, employerId, candidate) {
  // Fetch employer's profile to check for Gmail integration
  const { data: profile } = await supabase
    .from('profiles')
    .select('gmail_refresh_token, gmail_email, name')
    .eq('id', employerId)
    .single();

  const candidateName = candidate.candidate_profiles?.name || 'there';
  let candidateEmail = candidate.candidate_profiles?.email;
  // Handle stringified JSON arrays like '["email@example.com"]'
  if (candidateEmail && typeof candidateEmail === 'string' && candidateEmail.startsWith('[')) {
    try {
      const parsed = JSON.parse(candidateEmail);
      if (Array.isArray(parsed)) candidateEmail = parsed[0];
    } catch (e) {}
  }

  const roleTitle = candidate.hiring_runs?.role_title || 'the role';
  const senderName = profile?.name || 'CareerTWiN Team';

  // Day 0 Email Template (Outreach 01 - Intro / Candidate Outcome 01)


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

  // Send Day 0 Email
  let day0Status = 'failed';
  let day0Error = null;
  
  try {
    if (!candidateEmail) {
      day0Status = 'failed';
      day0Error = 'Candidate has no email address associated with their profile.';
      console.log(`[Email] ${day0Error}`);
    } else if (profile?.gmail_refresh_token) {
      const res = await sendGmailEmail(profile.gmail_refresh_token, {
        to: candidateEmail,
        subject: day0Subject,
        body: day0Body
      });
      day0Status = 'sent';
      console.log(`[Email] Day 0 sent via User Gmail to ${candidateEmail}`);
    } else if (process.env.SYSTEM_EMAIL_USER) {

      const info = await sendSMTPEmail({
        to: candidateEmail,
        subject: day0Subject,
        body: day0Body,
        fromName: senderName
      });
      day0Status = 'sent_via_system';
      console.log(`[Email] Day 0 sent via System SMTP to ${candidateEmail}`);
    } else {
      day0Status = 'pending_manual';
      day0Error = 'No Gmail connected and no system fallback configured.';
      console.log(`[Email] ${day0Error}`);
    }
  } catch (err) {
    day0Status = 'failed';
    day0Error = err.message || String(err);
    console.error('[Email] Failed to send Day 0 email:', err);
  }

  // Record Day 0 in history
  await supabase.from('scheduled_emails').insert([{
    employer_id: employerId,
    candidate_id: candidate.id,
    sequence_day: 0,
    scheduled_for: new Date().toISOString(),
    subject: day0Subject,
    body: day0Body,
    status: day0Status,
    error_details: day0Error,
    sent_at: day0Status.includes('sent') ? new Date().toISOString() : null
  }]);


  // 3. Schedule Day 2 and Day 5
  const day2Date = new Date();
  day2Date.setDate(day2Date.getDate() + 2);
  
  const day5Date = new Date();
  day5Date.setDate(day5Date.getDate() + 5);

  const onboardingLink = `${process.env.NEXT_PUBLIC_URL}/candidate/onboarding/${candidate.candidate_id}`;

  const scheduledEmails = [
    {
      employer_id: employerId,
      candidate_id: candidate.id,
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
      status: 'pending'
    },
    {
      employer_id: employerId,
      candidate_id: candidate.id,
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
      status: 'pending'
    }
  ];

  await supabase.from('scheduled_emails').insert(scheduledEmails);
}
