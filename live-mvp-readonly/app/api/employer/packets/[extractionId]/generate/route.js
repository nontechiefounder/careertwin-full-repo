import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { generateChat } from '@/lib/ai';

export async function POST(request, { params }) {
  try {
    const { extractionId } = await params;
    const supabase = await createSupabaseServerClient(request);

    // 1. Fetch Candidate and Role Context
    let { data: extraction, error: extError } = await supabase
      .from('candidates')
      .select('id, fit_score, candidate_profiles(*), hiring_runs(*)')
      .eq('id', extractionId)
      .maybeSingle();

    // Fallback: If not found by candidate-entry ID, try profile ID
    if (!extraction && !extError) {
      const { data: fallback, error: fallbackError } = await supabase
        .from('candidates')
        .select('id, fit_score, candidate_profiles(*), hiring_runs(*)')
        .eq('candidate_id', extractionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      extraction = fallback;
      extError = fallbackError;
    }

    if (extError || !extraction) {
      console.log('Generate API: Candidate not found for ID', extractionId);
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    console.log('Generate API: Found candidate', extraction.id, 'for profile', extraction.candidate_id);

    const { candidate_profiles: profile, hiring_runs: run } = extraction;


    // 2. AI Synthesis Prompt
    const systemPrompt = `You are the CareerTWiN Decision Engine. 
You are performing a Deep Synthesis for a candidate for the role of: "${run.role_title}".

ROLE CONTEXT:
${run.job_description}
MUST HAVES: ${JSON.stringify(run.must_haves)}

CANDIDATE DATA:
Name: ${profile.name}
Headline/Bio: ${profile.bio}
Location: ${profile.location}
Skills: ${JSON.stringify(profile.skills)}
LinkedIn: ${profile.resume_link}

TASK: Generate a "Decision Packet" (Candidate Assessment) as a structured JSON object. 
Distinguish between VERIFIED evidence and INFERRED capabilities.

JSON STRUCTURE:
{
  "why_sourced": "Specific reasoning on why this person was discovered",
  "why_matched": "Why they align with the current filters andJD",
  "strongest_evidence": ["Evidence Item 1 [very high]", "Evidence Item 2 [high]"],
  "extracted_capabilities": ["Skill A (5 years) - verified", "Skill B (2 years) - inferred"],
  "screen_summary": "Overall assessment of their readiness",
  "what_is_verified": ["Specific skill or fact A", "Fact B"],
  "what_is_inferred": ["Predicted proficiency C", "Skill D"],
  "what_remains_uncertain": ["Gap E", "Question F"],
  "strengths": ["Strategic asset A", "Technical win B"],
  "concerns": ["Critical gap C", "Risk factor D"],
  "recommended_next_step": "Exact next action (e.g. Schedule Technical Deep Dive)"
}`;

    const userPrompt = `Synthesize the Decision Packet for ${profile.name} now.`;

    // 3. AI Generation
    console.log('Generate API: Triggering AI generation for', profile.name);
    const packet = await generateChat(systemPrompt, userPrompt, true);
    console.log('Generate API: AI returned packet of size', JSON.stringify(packet).length);
    console.log('Generate API: Full packet content:', JSON.stringify(packet));

    // 4. Update the DB
    console.log('Generate API: Updating database for candidate', extraction.id);
    const supabaseService = await createSupabaseServerClient(request, true); // Use service role for update
    const { count, error: updateError } = await supabaseService
      .from('candidates')
      .update({ decision_packet: packet })
      .eq('id', extraction.id)
      .select('id', { count: 'exact' });

    if (updateError) {
      console.error('Generate API: Update error:', updateError);
      throw updateError;
    }

    console.log('Generate API: Database update successful, rows affected:', count);
    return NextResponse.json(packet);



  } catch (err) {
    console.error('Decision Generation Error:', err);
    return NextResponse.json({ error: 'Failed to generate assessment' }, { status: 500 });
  }
}
