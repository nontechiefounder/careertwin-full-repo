import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';
import { generateChat } from '@/lib/ai';

const ALLOWED_EMPLOYER_WRITER_ROLES = ['owner', 'admin', 'recruiter', 'hiring_manager'];

function isValidScore(val) {
    return typeof val === 'number' && Number.isFinite(val) && val >= 0.0 && val <= 1.0;
}

function formatStructuredSummaryResponse(row) {
    return {
        overall_score: row.overall_score ?? row.technical_score,
        summary_text: row.summary_text,
        technical_score: row.technical_score,
        communication_score: row.communication_score,
        strengths: Array.isArray(row.strengths) ? row.strengths : [],
        concerns: Array.isArray(row.concerns) ? row.concerns : [],
        recommended_next_step: row.recommended_next_step || null
    };
}

export async function POST(request, { params }) {
    try {
        const { sessionId } = await params;
        const authRes = await requireUser(request);
        if (authRes.errorResponse) return authRes.errorResponse;
        const { user, supabase } = authRes;

        let adminClient;
        try {
            adminClient = await createSupabaseServerClient(request, true);
        } catch {
            return NextResponse.json({ error: 'SCREENING_PERSISTENCE_UNAVAILABLE' }, { status: 503 });
        }

        // 1. Fetch Session, Answers, and Candidate Profiles
        const { data: session, error: sessErr } = await adminClient
            .from('screening_sessions')
            .select('*, hiring_runs(*), candidate_profiles(email)')
            .eq('id', sessionId)
            .maybeSingle();

        if (sessErr || !session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        // F01 HARDENING: Candidate self-completion or explicitly permitted employer writer role
        let isAuthorized = user.id === session.candidate_id;
        if (!isAuthorized && session.candidate_profiles?.email === user.email) {
            isAuthorized = true;
        }

        if (!isAuthorized && session.hiring_runs?.org_id && supabase) {
            try {
                const mem = await getVerifiedOrgMembership(supabase, user.id, session.hiring_runs.org_id);
                // Auditor and viewer roles are strictly read-only and forbidden from triggering completion/writes
                if (mem && mem.membership_status === 'active' && ALLOWED_EMPLOYER_WRITER_ROLES.includes(mem.membership_role)) {
                    isAuthorized = true;
                }
            } catch (_) {}
        }

        if (!isAuthorized) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // F07 IDEMPOTENCY / REPLAY CHECK: If session is already completed, return existing summary
        if (session.status === 'completed') {
            const { data: existingSummary } = await adminClient
                .from('screening_summaries')
                .select('*')
                .eq('session_id', sessionId)
                .maybeSingle();

            if (existingSummary) {
                return NextResponse.json({
                    success: true,
                    replayed: true,
                    summary: formatStructuredSummaryResponse(existingSummary)
                });
            }
        }

        const { data: qas, error: qasErr } = await adminClient
            .from('screening_answers')
            .select('*')
            .eq('session_id', sessionId);

        if (qasErr || !Array.isArray(qas)) {
            console.error('Failed to load screening answers:', qasErr?.message || 'Malformed screening_answers payload');
            return NextResponse.json(
                { error: 'SCREENING_ANSWERS_UNAVAILABLE', details: 'Failed to load screening answers; no evaluation or completion performed.' },
                { status: 503 }
            );
        }

        // 2. Prepare AI Prompt from validated, non-empty screening answers
        const qaContext = qas
            .filter(qa => qa && typeof qa.answer_text === 'string' && qa.answer_text.trim().length > 0)
            .map(qa => ({
                question_index: qa.question_index,
                answer: qa.answer_text.trim()
            }));

        if (qas.length > 0 && qaContext.length === 0) {
            return NextResponse.json(
                { error: 'SCREENING_ANSWERS_INVALID', details: 'Screening answers are malformed or empty; no evaluation or completion performed.' },
                { status: 422 }
            );
        }

        if (qaContext.length === 0) {
            return NextResponse.json(
                { error: 'INSUFFICIENT_SCREENING_ANSWERS', details: 'Cannot complete screening evaluation without submitted screening answers.' },
                { status: 422 }
            );
        }

        const systemPrompt = "You are a technical screening evaluator for workBYLiNE. Analyze screening responses and provide a structured assessment. Respond with valid JSON only.";
        const userPrompt = `Evaluate this screening session.
Role: ${session.hiring_runs?.role_title || 'Engineering Role'}
Context: ${session.hiring_runs?.job_description || ''}

Questions and Answers:
${JSON.stringify(qaContext, null, 2)}

Return JSON with exactly these fields:
{
  "technical_score": 0.0 to 1.0,
  "communication_score": 0.0 to 1.0,
  "summary_text": "2-3 paragraph assessment",
  "strengths": ["list of strengths"],
  "concerns": ["list of concerns"],
  "recommended_next_step": "what should happen next"
}`;

        // 3. Generate AI Summary (fail closed; never fabricate passing scores)
        let aiSummary;
        try {
            aiSummary = await generateChat(systemPrompt, userPrompt, true);
        } catch (err) {
            console.error('AI Screen Summary failed:', err);
            return NextResponse.json(
                { error: 'SCREENING_EVALUATION_UNAVAILABLE', details: 'AI screening evaluation failed; no fallback scores saved.' },
                { status: 503 }
            );
        }

        // F07 VALIDATION: Validate complete schema and finite [0, 1] ranges
        if (
            !aiSummary ||
            typeof aiSummary !== 'object' ||
            !isValidScore(aiSummary.technical_score) ||
            !isValidScore(aiSummary.communication_score) ||
            typeof aiSummary.summary_text !== 'string' ||
            !aiSummary.summary_text.trim()
        ) {
            return NextResponse.json(
                { error: 'SCREENING_EVALUATION_INVALID', details: 'AI screening evaluation returned incomplete metrics or out-of-range scores.' },
                { status: 502 }
            );
        }

        const strengthsList = Array.isArray(aiSummary.strengths) ? aiSummary.strengths.filter(Boolean) : [];
        const concernsList = Array.isArray(aiSummary.concerns) ? aiSummary.concerns.filter(Boolean) : [];
        const nextStepText = typeof aiSummary.recommended_next_step === 'string' ? aiSummary.recommended_next_step.trim() : null;

        // F07 PERSISTENCE: Format structured strengths, concerns, and next steps into the stored summary
        let enrichedSummaryText = aiSummary.summary_text.trim();
        if (strengthsList.length > 0) {
            enrichedSummaryText += '\n\nKey Strengths:\n' + strengthsList.map(s => `- ${s}`).join('\n');
        }
        if (concernsList.length > 0) {
            enrichedSummaryText += '\n\nAreas of Concern:\n' + concernsList.map(c => `- ${c}`).join('\n');
        }
        if (nextStepText) {
            enrichedSummaryText += `\n\nRecommended Next Step:\n${nextStepText}`;
        }

        const technicalScore = Number(aiSummary.technical_score.toFixed(3));
        const communicationScore = Number(aiSummary.communication_score.toFixed(3));

        // 4. Transactional, Concurrency-Safe Completion via Row-Locked RPC
        const { data: rpcResult, error: rpcError } = await adminClient.rpc('complete_screening_session_transactional', {
            p_session_id: sessionId,
            p_summary_text: enrichedSummaryText,
            p_technical_score: technicalScore,
            p_communication_score: communicationScore,
            p_strengths: strengthsList,
            p_concerns: concernsList,
            p_recommended_next_step: nextStepText
        });

        if (rpcError || !rpcResult?.summary) {
            console.error('Transactional screening completion failed:', rpcError?.message || 'Empty RPC response');
            return NextResponse.json({ error: 'Failed to finalize screening session transactionally' }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            replayed: Boolean(rpcResult.replayed),
            summary: formatStructuredSummaryResponse(rpcResult.summary)
        });

    } catch (err) {
        console.error('Session complete error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
