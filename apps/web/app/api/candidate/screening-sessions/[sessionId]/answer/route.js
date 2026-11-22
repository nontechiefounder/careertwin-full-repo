import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.CAREERTWIN_STAGING_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST(request, { params }) {
  try {
    const { sessionId } = await params;
    const { question_id, question_index, answer_text } = await request.json();
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;
    const adminClient = await createSupabaseServerClient(request, true);

    const { data: session, error: sessErr } = await adminClient
      .from('screening_sessions')
      .select('id, candidate_id, hiring_run_id, hiring_runs(org_id), candidate_profiles(email)')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessErr || !session) {
      return NextResponse.json({ error: 'Screening session not found' }, { status: 404 });
    }

    let isAuthorized = user.id === session.candidate_id;
    if (!isAuthorized && session.candidate_profiles?.email === user.email) {
      isAuthorized = true;
    }
    if (!isAuthorized && session.hiring_runs?.org_id && supabase) {
      try {
        const mem = await getVerifiedOrgMembership(supabase, user.id, session.hiring_runs.org_id);
        if (mem) isAuthorized = true;
      } catch (_) {}
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsedFromId = typeof question_id === 'string' && question_id.startsWith('q')
      ? Math.max(0, parseInt(question_id.slice(1), 10) - 1)
      : 0;
    const qIndex = typeof question_index === 'number' ? question_index : (Number.isNaN(parsedFromId) ? 0 : parsedFromId);

    // Upsert answer handling duplicate session_id, question_index conflict
    const { data, error } = await adminClient
      .from('screening_answers')
      .upsert([{
        session_id: sessionId,
        question_index: qIndex,
        answer_text: answer_text
      }], { onConflict: 'session_id, question_index' })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);

  } catch (err) {
    console.error('Answer save error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
