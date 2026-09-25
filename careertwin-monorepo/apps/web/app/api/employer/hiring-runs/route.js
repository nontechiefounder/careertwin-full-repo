import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_STATUSES = ['draft', 'active', 'paused', 'completed', 'archived'];
const ALLOWED_EMPLOYER_ROLES = ['owner', 'admin', 'recruiter', 'hiring_manager'];

function validateArrayItems(arr, maxItems = 50, maxLen = 300, fieldName = 'array') {
  if (!Array.isArray(arr)) {
    return `${fieldName} must be an array`;
  }
  if (arr.length > maxItems) {
    return `${fieldName} exceeds maximum allowed item count of ${maxItems}`;
  }
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (typeof item !== 'string') {
      return `Each item in ${fieldName} must be a valid string`;
    }
    if (item.trim().length > maxLen) {
      return `Items in ${fieldName} exceed maximum length of ${maxLen} characters`;
    }
  }
  return null;
}

export function evaluateProofContractReadiness(runData) {
  const hasTitle = Boolean(runData?.role_title && typeof runData.role_title === 'string' && runData.role_title.trim().length > 0);
  const hasSummaryOrDesc = Boolean(
    (runData?.role_summary && typeof runData.role_summary === 'string' && runData.role_summary.trim().length >= 10) ||
    (runData?.job_description && typeof runData.job_description === 'string' && runData.job_description.trim().length >= 10)
  );
  const hasMustHaves = Boolean(
    (Array.isArray(runData?.must_haves) && runData.must_haves.length > 0) ||
    (Array.isArray(runData?.explicit_requirements) && runData.explicit_requirements.length > 0)
  );

  return {
    isComplete: hasTitle && hasSummaryOrDesc && hasMustHaves,
    missingFields: [
      !hasTitle && 'role_title',
      !hasSummaryOrDesc && 'job_description',
      !hasMustHaves && 'must_haves'
    ].filter(Boolean)
  };
}

export async function GET(request) {
  try {
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    const { searchParams } = new URL(request.url);
    const reqOrgId = searchParams.get('org_id');

    if (reqOrgId) {
      if (!UUID_REGEX.test(reqOrgId)) {
        return NextResponse.json({ error: 'Invalid org_id format' }, { status: 400 });
      }
      const membership = await getVerifiedOrgMembership(supabase, user.id, reqOrgId);
      if (!membership || !ALLOWED_EMPLOYER_ROLES.includes(membership.membership_role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const { data: runs, error } = await supabase
        .from('hiring_runs')
        .select('*')
        .eq('org_id', reqOrgId)
        .order('created_at', { ascending: false });

      if (error) {
        return NextResponse.json(
          { error: 'HIRING_RUNS_FETCH_FAILED', safe_next_action: 'Retry later or contact support.' },
          { status: 500 }
        );
      }
      return NextResponse.json(runs || []);
    }

    // Unify GET authorization by resolving active authorized memberships
    const { data: memberships, error: memErr } = await supabase
      .from('organization_memberships')
      .select('organization_id, membership_role')
      .eq('user_id', user.id)
      .eq('membership_status', 'active')
      .in('membership_role', ALLOWED_EMPLOYER_ROLES);

    if (memErr) {
      return NextResponse.json({ error: 'Database service unavailable' }, { status: 503 });
    }

    const orgIds = (memberships || []).map((m) => m.organization_id);

    if (orgIds.length === 0) {
      return NextResponse.json([]);
    }

    const { data: runs, error } = await supabase
      .from('hiring_runs')
      .select('*')
      .in('org_id', orgIds)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: 'HIRING_RUNS_FETCH_FAILED', safe_next_action: 'Retry later or contact support.' },
        { status: 500 }
      );
    }

    return NextResponse.json(runs || []);
  } catch (err) {
    console.error('Hiring runs GET error:', err);
    return NextResponse.json(
      { error: 'HIRING_RUNS_FETCH_FAILED', safe_next_action: 'Retry later or contact support.' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Request body must be a valid object' }, { status: 400 });
    }

    // Bounded Role Title Validation
    if (!body.role_title || typeof body.role_title !== 'string' || body.role_title.trim() === '') {
      return NextResponse.json({ error: 'Role title is required' }, { status: 400 });
    }
    const trimmedTitle = body.role_title.trim();
    if (trimmedTitle.length > 200) {
      return NextResponse.json({ error: 'Role title exceeds maximum length of 200 characters' }, { status: 400 });
    }

    // Bounded String Length Validation for optional fields
    if (body.company && (typeof body.company !== 'string' || body.company.trim().length > 200)) {
      return NextResponse.json({ error: 'Company name exceeds maximum length of 200 characters' }, { status: 400 });
    }
    if (body.location && (typeof body.location !== 'string' || body.location.trim().length > 200)) {
      return NextResponse.json({ error: 'Location exceeds maximum length of 200 characters' }, { status: 400 });
    }
    if (body.company_stage && (typeof body.company_stage !== 'string' || body.company_stage.trim().length > 100)) {
      return NextResponse.json({ error: 'Company stage exceeds maximum length of 100 characters' }, { status: 400 });
    }
    if (body.job_description && (typeof body.job_description !== 'string' || body.job_description.trim().length > 10000)) {
      return NextResponse.json({ error: 'Job description exceeds maximum length of 10,000 characters' }, { status: 400 });
    }
    if (body.hiring_notes && (typeof body.hiring_notes !== 'string' || body.hiring_notes.trim().length > 5000)) {
      return NextResponse.json({ error: 'Hiring notes exceed maximum length of 5,000 characters' }, { status: 400 });
    }

    // Bounded Array Validation
    if (body.must_haves !== undefined) {
      const err = validateArrayItems(body.must_haves, 50, 300, 'must_haves');
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }
    if (body.nice_to_haves !== undefined) {
      const err = validateArrayItems(body.nice_to_haves, 50, 300, 'nice_to_haves');
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }
    if (body.disqualifiers !== undefined) {
      const err = validateArrayItems(body.disqualifiers, 50, 300, 'disqualifiers');
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }

    // Status Contract Validation & Gating (Part 7: Creation allows draft or active only)
    let initialStatus = 'draft';
    if (body.status !== undefined && body.status !== null) {
      if (typeof body.status !== 'string') {
        return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
      }
      const requestedStatus = body.status.toLowerCase();
      if (['paused', 'completed', 'archived'].includes(requestedStatus)) {
        return NextResponse.json(
          {
            error: 'INVALID_HIRING_RUN_CREATION_STATUS',
            safe_next_action: 'Creation permits draft or active status only. Lifecycle transitions use dedicated operations.'
          },
          { status: 400 }
        );
      }
      if (!ALLOWED_STATUSES.includes(requestedStatus)) {
        return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
      }
      if (requestedStatus === 'active') {
        const readiness = evaluateProofContractReadiness({
          role_title: trimmedTitle,
          job_description: body.job_description,
          must_haves: Array.isArray(body.must_haves) ? body.must_haves.map(s => s.trim()).filter(Boolean) : []
        });
        if (!readiness.isComplete) {
          return NextResponse.json(
            {
              error: `Proof contract is incomplete. Missing required inputs: ${readiness.missingFields.join(', ')}.`
            },
            { status: 400 }
          );
        }
        initialStatus = 'active';
      } else {
        initialStatus = 'draft';
      }
    } else {
      const readiness = evaluateProofContractReadiness({
        role_title: trimmedTitle,
        job_description: body.job_description,
        must_haves: Array.isArray(body.must_haves) ? body.must_haves.map(s => s.trim()).filter(Boolean) : []
      });
      initialStatus = readiness.isComplete ? 'active' : 'draft';
    }

    // Unified Organization Context Resolution & Role Authorization
    let targetOrgId = body.org_id;

    if (targetOrgId) {
      if (typeof targetOrgId !== 'string' || !UUID_REGEX.test(targetOrgId)) {
        return NextResponse.json({ error: 'Invalid org_id format' }, { status: 400 });
      }
      const membership = await getVerifiedOrgMembership(supabase, user.id, targetOrgId);
      if (!membership || !ALLOWED_EMPLOYER_ROLES.includes(membership.membership_role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    } else {
      const { data: memberships, error: memErr } = await supabase
        .from('organization_memberships')
        .select('organization_id, membership_role')
        .eq('user_id', user.id)
        .eq('membership_status', 'active')
        .in('membership_role', ALLOWED_EMPLOYER_ROLES);

      if (memErr) {
        return NextResponse.json({ error: 'Database service unavailable' }, { status: 503 });
      }

      if (!memberships || memberships.length === 0 || memberships.length > 1) {
        return NextResponse.json(
          { error: 'No unambiguous active organization context' },
          { status: 400 }
        );
      }
      targetOrgId = memberships[0].organization_id;
    }

    // Truthful Persistence Object
    const newRun = {
      org_id: targetOrgId,
      employer_id: user.id,
      role_title: trimmedTitle,
      company: body.company && typeof body.company === 'string' && body.company.trim() !== '' ? body.company.trim() : null,
      location: body.location && typeof body.location === 'string' && body.location.trim() !== '' ? body.location.trim() : null,
      company_stage: body.company_stage && typeof body.company_stage === 'string' && body.company_stage.trim() !== '' ? body.company_stage.trim() : null,
      job_description: body.job_description && typeof body.job_description === 'string' ? body.job_description.trim() : '',
      must_haves: Array.isArray(body.must_haves) ? body.must_haves.map(s => s.trim()).filter(Boolean) : [],
      nice_to_haves: Array.isArray(body.nice_to_haves) ? body.nice_to_haves.map(s => s.trim()).filter(Boolean) : [],
      disqualifiers: Array.isArray(body.disqualifiers) ? body.disqualifiers.map(s => s.trim()).filter(Boolean) : [],
      hiring_notes: body.hiring_notes && typeof body.hiring_notes === 'string' ? body.hiring_notes.trim() : '',
      status: initialStatus,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('hiring_runs')
      .insert([newRun])
      .select()
      .single();

    if (error) {
      console.error('Hiring run creation error:', error);
      return NextResponse.json(
        { error: 'HIRING_RUN_CREATION_FAILED', safe_next_action: 'Retry later or contact support.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...data,
      hiring_run_id: data.id
    });

  } catch (err) {
    console.error('Hiring run creation unexpected error:', err);
    return NextResponse.json(
      { error: 'HIRING_RUN_CREATION_FAILED', safe_next_action: 'Retry later or contact support.' },
      { status: 500 }
    );
  }
}
