import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';
import { sendGmailEmail } from '@/lib/gmail';
import { sendSMTPEmail } from '@/lib/smtp';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.CAREERTWIN_STAGING_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("FAIL-CLOSED ERROR: SUPABASE_SERVICE_ROLE_KEY is missing.");
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST(request, { params }) {
  try {
    const { extractionId } = await params;

    // 1. ROUTE AUTHORIZATION FIRST — BEFORE any privileged operation!
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    // 2. VALIDATE ACTION STRICT WHITELIST & MANDATORY REVISION/RUBRIC METADATA (C09-01)
    const body = await request.json().catch(() => ({}));
    const {
      action,
      rationale,
      expected_ledger_revision,
      expected_rubric_version,
      pre_evaluation_disposition,
      expected_evaluation_phase,
      expected_status,
      expected_pre_eval_revision
    } = body;
    const VALID_ACTIONS = ['advance', 'hold', 'reject'];

    if (!action || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json({
        error: 'INVALID_ACTION',
        details: `Action must be one of: ${VALID_ACTIONS.join(', ')}`
      }, { status: 400 });
    }

    if (!rationale || typeof rationale !== 'string' || rationale.trim().length === 0) {
      return NextResponse.json({
        error: 'RATIONALE_REQUIRED',
        details: 'A non-empty human decision rationale is required for all candidate actions.'
      }, { status: 400 });
    }

    const isPreEval = pre_evaluation_disposition === true;
    const expectedPreEvalPhase = typeof expected_evaluation_phase === 'string'
      ? expected_evaluation_phase.trim()
      : null;
    const expectedPreEvalStatus = typeof expected_status === 'string'
      ? expected_status.trim()
      : null;
    const expectedPreEvalRev =
      typeof expected_pre_eval_revision === 'number'
        ? expected_pre_eval_revision
        : (expected_pre_eval_revision !== undefined && expected_pre_eval_revision !== null
            ? Number(expected_pre_eval_revision)
            : null);

    const expectedRev = typeof expected_ledger_revision === 'number'
      ? expected_ledger_revision
      : (body.expected_revision !== undefined && body.expected_revision !== null ? Number(body.expected_revision) : null);

    if (isPreEval) {
      if (expectedPreEvalPhase !== 'pre_evaluation') {
        return NextResponse.json({
          error: 'INVALID_PRE_EVAL_CONTRACT',
          details: 'Missing or invalid expected_evaluation_phase. Must equal "pre_evaluation".'
        }, { status: 400 });
      }
      if (!expectedPreEvalStatus || expectedPreEvalStatus.length === 0) {
        return NextResponse.json({
          error: 'INVALID_PRE_EVAL_CONTRACT',
          details: 'Missing or invalid expected_status. Must be a non-empty string matching current candidate state.'
        }, { status: 400 });
      }
      if (expectedPreEvalRev === null || !Number.isInteger(expectedPreEvalRev) || expectedPreEvalRev < 0) {
        return NextResponse.json({
          error: 'INVALID_PRE_EVAL_CONTRACT',
          details: 'Missing or invalid expected_pre_eval_revision. Must be a non-negative integer.'
        }, { status: 400 });
      }
      if (expectedRev !== null && expectedRev !== 0) {
        return NextResponse.json({
          error: 'INVALID_PRE_EVAL_CONTRACT',
          details: 'Pre-evaluation decisions cannot target a positive expected_ledger_revision.'
        }, { status: 400 });
      }
    }

    if (!isPreEval && (expectedRev === null || !Number.isInteger(expectedRev) || expectedRev <= 0)) {
      return NextResponse.json({
        error: 'INVALID_REVISION',
        details: 'Missing or invalid expected_ledger_revision. Must be a positive integer.'
      }, { status: 400 });
    }

    const expectedRubric = typeof expected_rubric_version === 'string'
      ? expected_rubric_version.trim()
      : (typeof body.expected_rubric === 'string' ? body.expected_rubric.trim() : null);

    if (!isPreEval && (!expectedRubric || expectedRubric.length === 0)) {
      return NextResponse.json({
        error: 'INVALID_RUBRIC_VERSION',
        details: 'Missing or invalid expected_rubric_version. Must be a non-empty string.'
      }, { status: 400 });
    }
    // 3. Fetch candidate entry using authenticated user client
    let { data: extraction, error: fetchError } = await supabase
      .from('candidates')
      .select('id, candidate_id, hiring_run_id, status, pre_evaluation_revision, decision_packet, hiring_runs(id, org_id, role_title)')
      .eq('id', extractionId)
      .maybeSingle();

    if (!extraction && !fetchError) {
      const { data: fallback } = await supabase
        .from('candidates')
        .select('id, candidate_id, hiring_run_id, status, pre_evaluation_revision, decision_packet, hiring_runs(id, org_id, role_title)')
        .eq('candidate_id', extractionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      extraction = fallback;
    }

    if (!extraction) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    // Fail-closed on missing current packet metadata (C09-01) unless pre-evaluation / unversioned disposition
    const packet = extraction.decision_packet;
    const hasEvaluatedPacket = Boolean(
      packet &&
      typeof packet === 'object' &&
      Number.isInteger(Number(packet.ledger_revision)) &&
      Number(packet.ledger_revision) > 0 &&
      typeof packet.rubric_version === 'string' &&
      packet.rubric_version.trim().length > 0
    );

    if (isPreEval) {
      if (hasEvaluatedPacket || (packet !== null && packet !== undefined)) {
        return NextResponse.json({
          error: 'REVIEW_REVISION_CONFLICT',
          details: 'An evaluation decision packet was generated concurrently. Refreshing packet before recording decision.',
          requires_refresh: true
        }, { status: 409 });
      }
      const currentPreStatus = typeof extraction.status === 'string' ? extraction.status.trim() : '';
      const currentPreRev = Number.isInteger(Number(extraction.pre_evaluation_revision))
        ? Number(extraction.pre_evaluation_revision)
        : 0;
      if (currentPreStatus !== expectedPreEvalStatus || currentPreRev !== expectedPreEvalRev) {
        return NextResponse.json({
          error: 'REVIEW_REVISION_CONFLICT',
          details: `Pre-evaluation candidate state changed concurrently (expected status='${expectedPreEvalStatus}' rev=${expectedPreEvalRev}, found status='${currentPreStatus}' rev=${currentPreRev}). Refresh before recording decision.`,
          requires_refresh: true
        }, { status: 409 });
      }
    } else {
      if (!packet || typeof packet !== 'object') {
        return NextResponse.json({
          error: 'REVIEW_REVISION_CONFLICT',
          details: 'Candidate decision packet is missing',
          requires_refresh: true
        }, { status: 409 });
      }

      const currentRev = Number(packet.ledger_revision);
      if (!Number.isInteger(currentRev) || currentRev <= 0) {
        return NextResponse.json({
          error: 'REVIEW_REVISION_CONFLICT',
          details: 'Candidate packet lacks valid ledger_revision',
          requires_refresh: true
        }, { status: 409 });
      }

      const currentRubric = typeof packet.rubric_version === 'string' ? packet.rubric_version.trim() : '';
      if (!currentRubric) {
        return NextResponse.json({
          error: 'REVIEW_REVISION_CONFLICT',
          details: 'Candidate packet lacks valid rubric_version',
          requires_refresh: true
        }, { status: 409 });
      }

      if (currentRev !== expectedRev) {
        return NextResponse.json({
          error: 'REVIEW_REVISION_CONFLICT',
          details: `Expected ledger revision ${expectedRev} does not match current packet revision ${currentRev}`,
          requires_refresh: true
        }, { status: 409 });
      }

      if (currentRubric !== expectedRubric) {
        return NextResponse.json({
          error: 'REVIEW_REVISION_CONFLICT',
          details: `Expected rubric version ${expectedRubric} does not match current packet rubric ${currentRubric}`,
          requires_refresh: true
        }, { status: 409 });
      }
    }

    // 4. VERIFY ACTIVE EMPLOYER ORG MEMBERSHIP BEFORE ANY SIDE EFFECTS
    const orgId = extraction.hiring_runs?.org_id;
    const membership = await getVerifiedOrgMembership(supabase, user.id, orgId);
    if (!membership || !['owner', 'recruiter', 'admin', 'hiring_manager'].includes(membership.membership_role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let adminClient;
    try {
      adminClient = getAdminClient();
    } catch (e) {
      return NextResponse.json({
        error: 'PERSISTENCE_UNAVAILABLE',
        details: 'Service-role admin client unavailable for transactional human decision.'
      }, { status: 503 });
    }

    // 5. ATOMIC IN-TRANSACTION HUMAN DECISION MUTATION & AUDIT VIA RPC
    if (typeof adminClient.rpc !== 'function') {
      return NextResponse.json({
        error: 'PERSISTENCE_UNAVAILABLE',
        details: 'Transactional decision RPC client unavailable.'
      }, { status: 503 });
    }

    const { data: rpcRes, error: rpcErr } = isPreEval
      ? await adminClient.rpc('record_pre_evaluation_decision_transactional', {
          p_candidate_id: extraction.id,
          p_actor_id: user.id,
          p_actor_email: user.email || 'reviewer',
          p_org_id: orgId,
          p_action: action,
          p_rationale: rationale.trim(),
          p_expected_status: expectedPreEvalStatus,
          p_expected_pre_eval_revision: expectedPreEvalRev
        })
      : await adminClient.rpc('record_human_decision_transactional', {
          p_candidate_id: extraction.id,
          p_actor_id: user.id,
          p_actor_email: user.email || 'reviewer',
          p_org_id: orgId,
          p_action: action,
          p_rationale: rationale.trim(),
          p_expected_ledger_revision: expectedRev,
          p_expected_rubric_version: expectedRubric
        });

    if (rpcErr) {
      if (rpcErr.message?.includes('REVIEW_REVISION_CONFLICT')) {
        return NextResponse.json({
          error: 'REVIEW_REVISION_CONFLICT',
          details: rpcErr.message,
          requires_refresh: true
        }, { status: 409 });
      }
      if (rpcErr.message?.includes('RPC_AUTHORIZATION_ERROR')) {
        return NextResponse.json({
          error: 'Forbidden',
          details: rpcErr.message
        }, { status: 403 });
      }
      if (rpcErr.message?.includes('RPC_VALIDATION_ERROR') || rpcErr.message?.includes('Invalid action')) {
        return NextResponse.json({
          error: 'INVALID_ACTION',
          details: rpcErr.message
        }, { status: 400 });
      }
      return NextResponse.json({
        error: 'Failed to record decision',
        details: rpcErr.message
      }, { status: 500 });
    }

    const row = Array.isArray(rpcRes) ? rpcRes[0] : rpcRes;
    const updatedStatus = row?.status || (action === 'advance' ? 'shortlisted' : action === 'hold' ? 'hold' : 'rejected');
    const updatedPacket = isPreEval ? (row?.decision_packet ?? null) : row?.decision_packet;

    // 6. Trigger Email Sequence if Advanced (Dry-Run by Default)
    if (action === 'advance') {
      const { data: candFull } = await adminClient
        .from('candidates')
        .select('*, candidate_profiles(*), hiring_runs(*)')
        .eq('id', extraction.id)
        .maybeSingle();

      if (candFull) {
        await handleAdvanceSequence(adminClient, user.id, candFull, orgId);
      }
    }

    return NextResponse.json({
      success: true,
      status: updatedStatus,
      ...(isPreEval ? { pre_evaluation_revision: row?.pre_evaluation_revision ?? (expectedPreEvalRev + 1) } : {}),
      decision_packet: updatedPacket
    });

  } catch (err) {
    console.error('Action error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handleAdvanceSequence(supabase, employerId, candidate, orgId) {
  const targetCandidateProfileId = candidate.candidate_id || candidate.id;
  const targetOrgId = orgId || candidate.hiring_runs?.org_id || null;

  // Inspect existing sequence days for idempotency and recovery after partial sequence creation
  let existingDays = new Set();

  if (typeof supabase.from('scheduled_emails')?.select === 'function') {
    try {
      let emailQuery = supabase
        .from('scheduled_emails')
        .select('id, sequence_day')
        .eq('candidate_id', targetCandidateProfileId);
      if (targetOrgId) {
        emailQuery = emailQuery.eq('org_id', targetOrgId);
      }
      const { data: existingEmails } = await emailQuery;

      if (existingEmails && Array.isArray(existingEmails) && existingEmails.length > 0) {
        existingEmails.forEach(e => {
          if (e && typeof e.sequence_day === 'number') {
            existingDays.add(e.sequence_day);
          } else {
            // Mock or legacy record without explicit sequence_day implies full sequence initiated
            existingDays.add(0);
            existingDays.add(2);
            existingDays.add(5);
          }
        });

        // If all 3 sequence days (0, 2, 5) are already present, suppress duplicate sequence
        if (existingDays.has(0) && existingDays.has(2) && existingDays.has(5)) {
          console.log(`[Email] Sequence already fully initiated for candidate ${targetCandidateProfileId}; suppressing duplicate.`);
          return;
        }
      }
    } catch (e) {
      console.warn('[Email] Existing sequence days inspection notice:', e?.message || e);
    }
  }

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
  const senderName = profile?.name || 'workBYLiNE Team';

  // Strict Fail-Closed Dry-Run Boundary: Disabled by default for demo/test environments!
  // Unless explicitly set to false, ALL outreach emails are dry_run!
  const isDryRun = process.env.CAREERTWIN_DRY_RUN_EMAIL !== 'false';

  const day0Subject = `Next step for the ${roleTitle} opportunity`;
  const day0Body = `
    <p>Hi ${candidateName},</p>
    <p>Thanks for getting back to us.</p>
    <p>Based on your background, we think you may be a strong fit for the <strong>${roleTitle}</strong> role we’re working on.</p>
    <p>The next step is a short profile setup so we can evaluate your background properly and move you into the active process.</p>
    <p><a href="${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/candidate/onboarding/${candidate.candidate_id}" style="padding: 10px 20px; background: #000; color: #fff; text-decoration: none; border-radius: 5px;">Complete your profile here</a></p>
    <p>It should only take a few minutes.</p>
    <p>Best,<br>${senderName}<br>workBYLiNE</p>
  `;

  let day0Status = 'dry_run';
  let day0Error = 'Dry run active: external candidate email suppressed for demo safety.';

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

  // 1. Insert Day 0 if missing
  if (!existingDays.has(0)) {
    const day0Payload = {
      employer_id: employerId,
      candidate_id: targetCandidateProfileId,
      sequence_day: 0,
      scheduled_for: new Date().toISOString(),
      subject: day0Subject,
      body: day0Body,
      status: day0Status,
      error_details: day0Error,
      sent_at: day0Status.includes('sent') ? new Date().toISOString() : null
    };
    if (targetOrgId) day0Payload.org_id = targetOrgId;

    const { error: day0Err } = await supabase.from('scheduled_emails').insert([day0Payload]);

    if (day0Err) {
      if (day0Err.code === '23505' || day0Err.message?.includes('duplicate key') || day0Err.message?.includes('idx_scheduled_emails')) {
        console.log(`[Email] Atomic database constraint prevented duplicate Day 0 sequence for candidate ${targetCandidateProfileId} (code 23505).`);
        return; // Concurrent collision on Day 0: suppress downstream sequence days to avoid racing
      } else {
        console.error('[Email] Failed to insert day 0 scheduled email:', day0Err);
        return;
      }
    }
    existingDays.add(0);
  }

  // 2. Recovery / Completion: Insert missing Day 2 and Day 5
  const day2Date = new Date();
  day2Date.setDate(day2Date.getDate() + 2);
  
  const day5Date = new Date();
  day5Date.setDate(day5Date.getDate() + 5);

  const onboardingLink = `${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/candidate/onboarding/${candidate.candidate_id}`;

  const missingSequences = [];

  if (!existingDays.has(2)) {
    const day2Payload = {
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
      error_details: isDryRun ? 'Dry run active: external candidate email suppressed for demo safety.' : null
    };
    if (targetOrgId) day2Payload.org_id = targetOrgId;
    missingSequences.push(day2Payload);
  }

  if (!existingDays.has(5)) {
    const day5Payload = {
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
      error_details: isDryRun ? 'Dry run active: external candidate email suppressed for demo safety.' : null
    };
    if (targetOrgId) day5Payload.org_id = targetOrgId;
    missingSequences.push(day5Payload);
  }

  if (missingSequences.length > 0) {
    const { error: seqErr } = await supabase.from('scheduled_emails').insert(missingSequences);
    if (seqErr && (seqErr.code === '23505' || seqErr.message?.includes('duplicate key'))) {
      console.log('[Email] Subsequent sequence days already present in database (23505).');
    }
  }
}
