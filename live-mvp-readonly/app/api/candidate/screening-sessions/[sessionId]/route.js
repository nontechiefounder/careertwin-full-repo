import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
    try {
        const { sessionId } = await params;
        const supabase = await createSupabaseServerClient(request);

        // Fetch screening session
        const { data: session, error: sessionError } = await supabase
            .from('screening_sessions')
            .select('*, candidates(*)')
            .eq('id', sessionId)
            .single();

        if (sessionError) {
            // Fallback for dev: return mock questions if session doesn't exist
            return NextResponse.json({
                session: {
                    id: sessionId,
                    status: 'not_started',
                    questions: [
                        { id: 'q1', dimension: 'Technical', question: 'Tell us about the most complex technical challenge you solved recently.' },
                        { id: 'q2', dimension: 'Product', question: 'How do you prioritize features when resources are limited?' },
                        { id: 'q3', dimension: 'Culture', question: 'What do you look for in a team culture?' }
                    ]
                },
                extraction: { candidate_name: 'Test Candidate' },
                answers: []
            });
        }

        // Fetch answers
        const { data: answers, error: answerError } = await supabase
            .from('screening_answers')
            .select('*')
            .eq('session_id', sessionId);

        // Fetch summary if completed
        let summary = null;
        if (session.status === 'completed') {
            const { data: summaryData } = await supabase
                .from('screening_summaries')
                .select('*')
                .eq('session_id', sessionId)
                .single();
            summary = summaryData;
        }

        return NextResponse.json({
            session: {
                ...session,
                questions: session.questions || []
            },
            extraction: session.candidates,
            answers: answers || [],
            summary: summary
        });

    } catch (err) {
        console.error('Screening session fetch error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
