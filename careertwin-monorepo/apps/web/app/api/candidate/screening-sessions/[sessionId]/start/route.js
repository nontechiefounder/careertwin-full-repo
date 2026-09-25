import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { requireUser } from '@/lib/serverAuth';
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
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user } = authRes;
    const adminClient = await createSupabaseServerClient(request, true);

    const { data: session, error: sessErr } = await adminClient
      .from('screening_sessions')
      .select('id, candidate_id, candidate_profiles(email)')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessErr || !session) {
      return NextResponse.json({ error: 'Screening session not found' }, { status: 404 });
    }

    let isAuthorized = user.id === session.candidate_id;
    if (!isAuthorized && session.candidate_profiles?.email === user.email) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Update session status to 'started'
    const { data, error } = await adminClient
      .from('screening_sessions')
      .update({ status: 'started', started_at: new Date().toISOString() })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);

  } catch (err) {
    console.error('Session start error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
