import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';
import { generateChat } from '@/lib/ai';

function bumpCriteriaVersion(version) {
  const raw = typeof version === 'string' ? version.trim() : '';
  const semverMatch = raw.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (semverMatch) {
    return `${semverMatch[1]}.${Number(semverMatch[2]) + 1}.0`;
  }
  const numMatch = raw.match(/^v?(\d+)$/i);
  if (numMatch) {
    return `${Number(numMatch[1]) + 1}.0.0`;
  }
  return '1.1.0';
}

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const supabase = await createSupabaseServerClient(request);
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }


    // Fetch the hiring run
    const { data: run, error: runError } = await supabase
      .from('hiring_runs')
      .select('*')
      .eq('id', id)
      .single();

    if (runError || !run) {
        return NextResponse.json({ error: 'Hiring run not found' }, { status: 404 });
    }

    const membership = await getVerifiedOrgMembership(supabase, user.id, run.org_id);
    if (!membership || (membership.membership_status && membership.membership_status !== 'active')) {
        return NextResponse.json({ error: 'ACCESS_DENIED' }, { status: 403 });
    }
    const membershipRole = membership.membership_role || 'recruiter';

    // 🧠 Check if a professional brief is already cached or if read-only GET is requested
    if (!request.nextUrl.searchParams.get('force')) {
        const cachedBrief = run.brief_json || {};
        const rawSummary = cachedBrief.role_summary;
        const validSummary = (rawSummary && rawSummary !== 'undefined...' && rawSummary.trim().length >= 10) ? rawSummary : null;
        const descSummary = (run.job_description && run.job_description.trim()) ? run.job_description.slice(0, 300).trim() + "..." : null;
        const fallbackSummary = descSummary || `Overview of the ${run.role_title} position at ${run.company || 'the company'}.`;
        const mergedBrief = {
            role_summary: validSummary || fallbackSummary,
            explicit_requirements: cachedBrief.explicit_requirements || cachedBrief.must_haves || run.must_haves || [],
            inferred_requirements: cachedBrief.inferred_requirements || cachedBrief.nice_to_haves || run.nice_to_haves || [],
            disqualifiers: cachedBrief.disqualifiers || run.disqualifiers || [],
            screening_dimensions: cachedBrief.screening_dimensions || ["Technical Depth", "Core Experience", "Communication", "Culture Fit"],
            verification_focus: cachedBrief.verification_focus || [
                `Verified professional history as a ${run.role_title}`,
                "Technical interview screening results",
                "Past project impact verification"
            ],
            missing_info: cachedBrief.missing_info || (run.job_description ? [] : ["Detailed job description required"]),
            ...cachedBrief
        };
        return NextResponse.json({
            hiring_run: run,
            brief: mergedBrief,
            membership_role: membershipRole
        });
    }

    // Force LLM synthesis requires an active write role (auditors are read-only)
    if (!['owner', 'admin', 'recruiter', 'hiring_manager'].includes(membershipRole)) {
        return NextResponse.json({ error: 'Forbidden: Auditor role cannot trigger brief synthesis' }, { status: 403 });
    }

    // 🧠 AI Brief Synthesis (High-Fidelity)
    const systemPrompt = `You are a world-class Hiring Orchestrator. 
Your task is to synthesize a raw "Hiring Run" into a polished, strategic "Hiring Brief" for the sourcing team.
Focus on professionalizing the input while keeping the core requirements. rephrase any "joke" or casual requirements into high-fidelity recruiter language.
STRICT valid JSON output.`;

    const userPrompt = `Synthesize a professional Hiring Brief for:
- Role: ${run.role_title}
- Company: ${run.company}
- Stage: ${run.company_stage}
- Job Description: ${run.job_description}
- Must Haves: ${JSON.stringify(run.must_haves)}
- Nice to Haves: ${JSON.stringify(run.nice_to_haves)}

Return JSON with exactly these fields:
{
  "role_summary": "Professional 300-400 character summary",
  "explicit_requirements": ["list of explicit technical/role needs"],
  "inferred_requirements": ["list of skills inferred from the context"],
  "screening_dimensions": ["4 key areas to interview for"],
  "verification_focus": ["3 specific things to verify in their history"],
  "missing_info": ["Any critical missing details"]
}`;

    let brief;
    try {
        brief = await generateChat(systemPrompt, userPrompt, true);
    } catch (err) {
        console.error('Brief synthesis failed:', err);
        return NextResponse.json(
            { error: 'BRIEF_SYNTHESIS_UNAVAILABLE', details: 'AI brief synthesis failed; no fallback persisted.' },
            { status: 503 }
        );
    }

    const existingBrief = run.brief_json || {};
    const prevVersion = existingBrief.contract_version || run.rubric_version || run.contract_version || '1.0.0';
    const nextVersion = bumpCriteriaVersion(prevVersion);
    const nowIso = new Date().toISOString();

    const priorHistory = Array.isArray(existingBrief.version_history)
      ? [...existingBrief.version_history]
      : [];

    const hasPriorCriteriaState = Boolean(
      existingBrief.contract_approved !== undefined ||
      existingBrief.approved_rubric_version ||
      existingBrief.role_summary ||
      (Array.isArray(existingBrief.explicit_requirements) && existingBrief.explicit_requirements.length > 0) ||
      (Array.isArray(existingBrief.inferred_requirements) && existingBrief.inferred_requirements.length > 0)
    );

    if (hasPriorCriteriaState) {
      priorHistory.push({
        version: prevVersion,
        archived_at: nowIso,
        archived_by: user.id,
        archive_reason: 'regenerated_criteria',
        contract_approved: Boolean(existingBrief.contract_approved),
        contract_status: existingBrief.contract_status || (existingBrief.contract_approved ? 'approved' : 'draft'),
        approved_by: existingBrief.approved_by || null,
        approved_at: existingBrief.approved_at || null,
        approved_rubric_version: existingBrief.approved_rubric_version || null,
        role_summary: existingBrief.role_summary || null,
        explicit_requirements: existingBrief.explicit_requirements || existingBrief.must_haves || run.must_haves || [],
        inferred_requirements: existingBrief.inferred_requirements || existingBrief.nice_to_haves || run.nice_to_haves || [],
        disqualifiers: existingBrief.disqualifiers || run.disqualifiers || [],
        screening_dimensions: existingBrief.screening_dimensions || [],
        verification_focus: existingBrief.verification_focus || [],
        missing_info: existingBrief.missing_info || [],
      });
    }

    const updatedBrief = {
        ...existingBrief,
        ...brief,
        contract_version: nextVersion,
        contract_approved: false,
        rubric_approved: false,
        contract_status: 'pending_reapproval',
        approved_by: null,
        approved_at: null,
        approved_rubric_version: null,
        previous_approved_rubric_version: existingBrief.approved_rubric_version || null,
        regenerated_at: nowIso,
        regenerated_by: user.id,
        version_history: priorHistory,
    };

    const { error: saveError } = await supabase
        .from('hiring_runs')
        .update({ brief_json: updatedBrief })
        .eq('id', id);

    if (saveError) {
        return NextResponse.json({ error: 'Failed to persist synthesized brief' }, { status: 500 });
    }

    return NextResponse.json({
        hiring_run: { ...run, brief_json: updatedBrief },
        brief: updatedBrief,
        membership_role: membershipRole
    });

  } catch (err) {
    console.error('Brief fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
