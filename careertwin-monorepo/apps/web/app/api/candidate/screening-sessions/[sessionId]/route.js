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
            .select('*, candidate_profiles(*), hiring_runs(org_id)')
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
            const mem = await getVerifiedOrgMembership(supabase, user.id, session.hiring_runs.org_id);
            if (mem) isAuthorized = true;
        }

        if (!isAuthorized) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

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
            summary = summaryData;
        }

        const defaultQuestions = [
            { id: "q1", question: "Describe your experience with distributed systems and PostgreSQL.", dimension: "Architecture" }
        ];

        return NextResponse.json({
            session: {
                ...session,
                questions: (session.questions && session.questions.length > 0) ? session.questions : defaultQuestions
            },
            extraction: session.candidate_profiles,
            answers: answers || [],
            summary: summary
        });

    } catch (err) {
        console.error('Screening session fetch error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
