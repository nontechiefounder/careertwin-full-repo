import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';
import { generateChat } from '@/lib/ai';

const ALLOWED_EMPLOYER_ROLES = ['owner', 'admin', 'recruiter', 'hiring_manager'];

export async function POST(request) {
  try {
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    const { org_id, role_title, company, company_stage, job_description, must_haves } = await request.json();

    if (org_id) {
      const membership = await getVerifiedOrgMembership(supabase, user.id, org_id);
      if (!membership || membership.membership_status !== 'active' || !ALLOWED_EMPLOYER_ROLES.includes(membership.membership_role)) {
        return NextResponse.json({ error: 'Forbidden: Insufficient organization privileges' }, { status: 403 });
      }
    } else {
      const { data: memberships, error: memErr } = await supabase
        .from('organization_memberships')
        .select('organization_id, membership_role')
        .eq('user_id', user.id)
        .eq('membership_status', 'active')
        .in('membership_role', ALLOWED_EMPLOYER_ROLES);

      if (memErr || !memberships || memberships.length === 0) {
        return NextResponse.json({ error: 'Forbidden: Active employer organization membership required' }, { status: 403 });
      }
    }

    if (!role_title) {
      return NextResponse.json({ error: 'Role title required' }, { status: 400 });
    }

    const systemPrompt = `You are an Executive Technical Recruiter.
Your goal is to transform minimal hiring signals into clear job descriptions and requirements.
Focus on:
- Technical depth and stack-specific requirements.
- Cultural alignment based on company stage (${company_stage || 'Series A'}).
- STRICT valid JSON output.`;

    const userPrompt = `Synthesize a comprehensive hiring profile for:
    
- **Role**: ${role_title}
- **Company**: ${company || 'the organization'}
- **Stage**: ${company_stage || 'Series A/B Startup'}
- **Initial JD/Notes**: ${job_description || 'No detailed JD provided.'}
- **Current Requirements**: ${JSON.stringify(must_haves || [])}

Generate a concise response with:
1. A 3-paragraph Job Description.
2. 5-7 specific "Must Haves" (Technical & Role Skills).
3. 4-5 "Nice to Haves".
4. 3-4 "Disqualifiers".

Return ONLY valid JSON:
{
  "job_description": "...",
  "must_haves": ["...", "..."],
  "nice_to_haves": ["...", "..."],
  "disqualifiers": ["...", "..."]
}`;

    try {
      const suggestions = await generateChat(systemPrompt, userPrompt, true);
      return NextResponse.json(suggestions);
    } catch (err) {
      console.error('AI Suggestion failed:', err);
      return NextResponse.json(
        { error: 'SUGGESTION_UNAVAILABLE', details: 'AI role suggestion generation failed.' },
        { status: 503 }
      );
    }
  } catch (err) {
    console.error('AI Suggestion error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
