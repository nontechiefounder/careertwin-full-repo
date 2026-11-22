import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.CAREERTWIN_STAGING_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function GET(request, { params }) {
    try {
        const { sessionId } = await params;
        const authRes = await requireUser(request);
        if (authRes.errorResponse) return authRes.errorResponse;
        const { user, supabase } = authRes;
        const adminClient = await createSupabaseServerClient(request, true);

        // Fetch screening session using adminClient to resolve foreign key schema correctly
        const { data: session, error: sessionError } = await adminClient
            .from('screening_sessions')
            .select('*, candidate_profiles(*), hiring_runs(id, org_id, role_title, company, must_haves)')
            .eq('id', sessionId)
            .maybeSingle();

        if (sessionError || !session) {
            return NextResponse.json({ error: 'Screening session not found' }, { status: 404 });
        }

        // Validate Candidate Ownership OR Active Employer Org Membership
        let isAuthorized = user.id === session.candidate_id;
        if (!isAuthorized && session.candidate_profiles?.email === user.email) {
            isAuthorized = true;
        }
        if (!isAuthorized) {
            const { data: candProf } = await adminClient
                .from('candidate_profiles')
                .select('id, email')
                .eq('id', session.candidate_id)
                .maybeSingle();
            if (candProf && candProf.email === user.email) {
                isAuthorized = true;
            }
        }
        if (!isAuthorized && session.hiring_runs?.org_id) {
            try {
                const mem = await getVerifiedOrgMembership(supabase, user.id, session.hiring_runs.org_id);
                if (mem) isAuthorized = true;
            } catch (_) {}
        }

        if (!isAuthorized) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Fetch candidate extraction record for packet-grounded questions & navigation back to packet
        let candRow = null;
        try {
            if (session.candidate_id && session.hiring_run_id) {
                const { data: cData } = await adminClient
                    .from('candidates')
                    .select('id, decision_packet, status')
                    .eq('candidate_id', session.candidate_id)
                    .eq('hiring_run_id', session.hiring_run_id)
                    .maybeSingle();
                candRow = cData;
            }
        } catch (_) {}

        // Fetch answers
        const { data: answers } = await adminClient
            .from('screening_answers')
            .select('*')
            .eq('session_id', sessionId);

        // Fetch summary if completed
        let summary = null;
        if (session.status === 'completed') {
            const { data: summaryData } = await adminClient
                .from('screening_summaries')
                .select('*')
                .eq('session_id', sessionId)
                .maybeSingle();
            summary = summaryData ? {
                ...summaryData,
                overall_score: summaryData.overall_score ?? summaryData.technical_score ?? null,
                strengths: Array.isArray(summaryData.strengths) ? summaryData.strengths : [],
                concerns: Array.isArray(summaryData.concerns) ? summaryData.concerns : [],
                recommended_next_step: summaryData.recommended_next_step || null
            } : null;
        }

        // Build role & packet-grounded questions
        const derivedQuestions = [];
        const packetMissing = Array.isArray(candRow?.decision_packet?.missing_proof)
            ? candRow.decision_packet.missing_proof
            : [];
        for (const item of packetMissing.slice(0, 2)) {
            const probe = typeof item === 'object'
                ? (item.interview_probe || (item.unproven_requirement ? `Please share concrete production evidence and metrics for: ${item.unproven_requirement}` : null))
                : String(item);
            if (probe) {
                derivedQuestions.push({
                    id: `q${derivedQuestions.length + 1}`,
                    question: probe,
                    dimension: "Missing Proof Verification"
                });
            }
        }

        const mustHaves = Array.isArray(session.hiring_runs?.must_haves)
            ? session.hiring_runs.must_haves
            : [];
        for (const mh of mustHaves) {
            if (derivedQuestions.length >= 3) break;
            const reqText = typeof mh === 'string' ? mh : (mh?.label || mh?.requirement || '');
            if (reqText) {
                derivedQuestions.push({
                    id: `q${derivedQuestions.length + 1}`,
                    question: `Walk through a production system where you directly owned "${reqText}". What were the key trade-offs and measurable outcomes?`,
                    dimension: "Must-Have Rubric Probe"
                });
            }
        }

        const fallbackQuestions = [
            { id: "q1", question: `Describe your hands-on architecture and production implementation experience relevant to ${session.hiring_runs?.role_title || 'this role'}.`, dimension: "Architecture" },
            { id: "q2", question: "Walk through a complex system reliability, scaling, or product delivery trade-off you owned end-to-end and its measurable outcome.", dimension: "Ownership & Impact" },
            { id: "q3", question: "What technical priorities and verification milestones would you focus on in your first 60 days?", dimension: "Role Execution" }
        ];

        while (derivedQuestions.length < 3) {
            const nextFallback = fallbackQuestions[derivedQuestions.length];
            derivedQuestions.push({
                id: `q${derivedQuestions.length + 1}`,
                question: nextFallback.question,
                dimension: nextFallback.dimension
            });
        }

        return NextResponse.json({
            session: {
                ...session,
                questions: (session.questions && session.questions.length > 0) ? session.questions : derivedQuestions
            },
            extraction: {
                ...(session.candidate_profiles || {}),
                candidate_name: session.candidate_profiles?.name || session.candidate_profiles?.candidate_name || "Candidate",
                extraction_id: candRow?.id || null,
                role_title: session.hiring_runs?.role_title || "Active Role",
                hiring_run_id: session.hiring_run_id
            },
            extraction_id: candRow?.id || null,
            hiring_run_id: session.hiring_run_id,
            role_title: session.hiring_runs?.role_title || "Active Role",
            answers: answers || [],
            summary: summary
        });

    } catch (err) {
        console.error('Screening session fetch error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
