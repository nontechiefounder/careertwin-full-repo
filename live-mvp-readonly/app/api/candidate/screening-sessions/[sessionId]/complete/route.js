import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import { generateChat } from '@/lib/ai';

export async function POST(request, { params }) {
    try {
        const { sessionId } = await params;
        const supabase = await createSupabaseServerClient(request);

        // 1. Fetch Session, Answers, and Questions
        const { data: session, error: sessErr } = await supabase
            .from('screening_sessions')
            .select('*, hiring_runs(*)')
            .eq('id', sessionId)
            .single();

        const { data: qas, error: qaErr } = await supabase
            .from('screening_answers')
            .select('*, screening_questions(*)')
            .eq('session_id', sessionId);

        if (sessErr || !session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        // 2. Prepare AI Prompt
        const qaContext = qas?.map(qa => ({
            question: qa.screening_questions?.question_text,
            dimension: qa.screening_questions?.dimension,
            answer: qa.answer_text
        })) || [];

        const systemPrompt = "You are a technical screening evaluator for CareerTWiN. Analyze screening responses and provide a structured assessment. Respond with valid JSON only.";
        const userPrompt = `Evaluate this screening session.
Role: ${session.hiring_runs?.role_title || 'Engineering Role'}
Context: ${session.hiring_runs?.job_description || ''}

Questions and Answers:
${JSON.stringify(qaContext, null, 2)}

Return JSON with exactly these fields:
{
  "overall_score": 0.0 to 1.0,
  "strengths": ["list of strengths"],
  "concerns": ["list of concerns"],
  "summary_text": "2-3 paragraph assessment",
  "recommended_next_step": "what should happen next"
}`;

        // 3. Generate AI Summary
        let aiSummary;
        try {
            aiSummary = await generateChat(systemPrompt, userPrompt, true);
        } catch (err) {
            console.error('AI Screen Summary failed, using fallback:', err);
            aiSummary = {
                overall_score: 0.5,
                summary_text: "Screening completed. Manual review recommended due to AI service timeout.",
                strengths: ["Completed all questions"],
                concerns: ["Automated assessment unavailable"],
                recommended_next_step: "Review answers manually in the dashboard."
            };
        }

        const summaryData = {
            ...aiSummary,
            session_id: sessionId,
            created_at: new Date().toISOString()
        };

        // 4. Save and Finish
        await supabase.from('screening_summaries').upsert([summaryData]);
        await supabase.from('screening_sessions')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', sessionId);

        return NextResponse.json({
            success: true,
            summary: summaryData
        });

    } catch (err) {
        console.error('Session complete error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
