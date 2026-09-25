import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { generateChat } from '@/lib/ai';

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

    if (runError) {
        return NextResponse.json({ error: 'Hiring run not found' }, { status: 404 });
    }

    // 🧠 Check if a professional brief is already cached
    if (run.brief_json && !request.nextUrl.searchParams.get('force')) {
        return NextResponse.json({
            hiring_run: run,
            brief: run.brief_json
        });
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
        
        // 💾 Persist the synthesized brief to the database
        await supabase
            .from('hiring_runs')
            .update({ brief_json: brief })
            .eq('id', id);

    } catch (err) {
        console.error('Brief synthesis failed, using rule-based fallback:', err);
        brief = {
            role_summary: run.job_description?.slice(0, 300).trim() + "..." || `Overview of the ${run.role_title} position at ${run.company}.`,
            explicit_requirements: run.must_haves || [],
            inferred_requirements: run.nice_to_haves || [],
            screening_dimensions: ["Technical Depth", "Core Experience", "Communication", "Culture Fit"],
            verification_focus: [
                `Verified professional history as a ${run.role_title}`,
                "Technical interview screening results",
                "Past project impact verification"
            ],
            missing_info: run.job_description ? [] : ["Detailed job description required"]
        };
    }

    return NextResponse.json({
        hiring_run: run,
        brief: brief
    });

  } catch (err) {
    console.error('Brief fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
