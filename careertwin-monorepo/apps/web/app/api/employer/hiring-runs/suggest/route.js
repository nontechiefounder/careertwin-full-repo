import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { generateChat } from '@/lib/ai';

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { role_title, company, company_stage, job_description, must_haves } = await request.json();

    if (!role_title) {
        return NextResponse.json({ error: 'Role title required' }, { status: 400 });
    }

    // 🧠 Elite AI Suggestion Logic (Claude/Groq with multi-param context)
    const systemPrompt = `You are a world-class Executive Technical Recruiter at CareerTWiN. 
Your goal is to transform minimal hiring signals into high-fidelity, industry-standard job descriptions and requirements.
Focus on:
- Technical depth and stack-specific requirements.
- Cultural alignment based on company stage (${company_stage || 'Series A'}).
- Professional, persuasive, and data-driven language.
- STRICT valid JSON output.`;

    const userPrompt = `Synthesize a comprehensive hiring profile for:
    
- **Role**: ${role_title}
- **Company**: ${company || 'CareerTWiN'}
- **Stage**: ${company_stage || 'Series A/B Startup'}
- **Initial JD/Notes**: ${job_description || 'No detailed JD provided.'}
- **Current Requirements**: ${JSON.stringify(must_haves || [])}

Generate a "premium" response with:
1. A 3-paragraph compelling Job Description. Paragraph 1: Company vision/impact. Paragraph 2: Technical challenges/responsibilities. Paragraph 3: Team culture & growth.
2. 5-7 high-signal "Must Haves" (Technical & Soft Skills).
3. 4-5 "Nice to Haves" (Force-multipliers).
4. 3-4 "Disqualifiers" (Clear deal-breakers).

Return ONLY valid JSON:
{
  "job_description": "...",
  "must_haves": ["...", "..."],
  "nice_to_haves": ["...", "..."],
  "disqualifiers": ["...", "..."]
}`;

    let suggestions;
    try {
      suggestions = await generateChat(systemPrompt, userPrompt, true);
    } catch (err) {
      console.error('AI Suggestion failed, using robust fallback:', err);
      // High-quality fallback if AI is down
      suggestions = {
        job_description: `Join ${company || 'our team'} as a ${role_title}. We are a fast-growing ${company_stage || 'Series A'} company looking for a powerhouse individual to lead our technical initiatives and scale our core infrastructure. You'll work directly with the founding team to solve complex distributed systems challenges and build a product used by thousands of customers globally.\n\nWe pride ourselves on a high-ownership, low-ego culture where technical excellence meets product-driven thinking. If you're ready to make a massive impact in a high-growth environment, we want to hear from you.`,
        must_haves: [
            "Expert-level proficiency in the core technologies required for a " + role_title,
            "Proven track rate of shipping high-impact products in a " + (company_stage || "high-growth") + " environment",
            "Strong system design fundamentals and architectural thinking",
            "Exceptional communication skills and ability to lead across teams"
        ],
        nice_to_haves: [
            "Prior experience at a " + (company_stage || "venture-backed") + " startup",
            "Contributions to open source or technical communities",
            "Experience scaling products from zero to one"
        ],
        disqualifiers: [
            "Lack of hands-on experience with modern production environments",
            "Poor collaborative skills or inability to handle ambiguity",
            "Inability to work within our core timezones/location requirements"
        ]
      };
    }

    return NextResponse.json(suggestions);

  } catch (err) {
    console.error('AI Suggestion error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
