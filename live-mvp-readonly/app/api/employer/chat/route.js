import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message, context } = await request.json();

    // Mock AI Chat Logic
    // In a real scenario, this would call OpenAI/Gemini with the conversation history.
    let reply = "I'm looking into your hiring pipeline now.";
    let suggestions = ["Show me active roles", "Summarize last sourcing run"];
    let steps = [];
    let artifact = null;

    const lowerMsg = message.toLowerCase();

    if (lowerMsg.includes("summary") || lowerMsg.includes("pipeline")) {
      reply = "Here's a quick look at your pipeline. You have **3 active roles** and **12 candidates** waiting for review.";
      steps = [
        { label: "Scanning Hiring Runs", done: true },
        { label: "Aggregating Candidate Counts", done: true },
        { label: "Calculating Pipeline Velocity", active: true }
      ];
      suggestions = ["Show Senior Backend role", "Who is ready to screen?"];
    } else if (lowerMsg.includes("source") || lowerMsg.includes("sourcing")) {
      reply = "I can help you start a new sourcing run. Which role should I focus on?";
      suggestions = ["Senior Backend Engineer", "Product Designer"];
    } else if (lowerMsg.includes("shortlist") || lowerMsg.includes("candidates")) {
      reply = "You have **5 new candidates** in the [Senior Backend Engineer] shortlist. Would you like me to summarize their fit?";
      artifact = {
        title: "Senior Backend Engineer Shortlist",
        type: "SHORTLIST",
        href: context?.active_run_id ? `/employer/shortlist/${context.active_run_id}` : "/employer"
      };
      suggestions = ["Summarize fit", "Send screen links"];
    }

    return NextResponse.json({
      reply,
      steps,
      artifact,
      suggestions,
      show_approve: lowerMsg.includes("plan")
    });

  } catch (err) {
    console.error('Chat error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
