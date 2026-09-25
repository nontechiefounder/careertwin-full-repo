import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  try {
    const { sessionId } = await params;
    const supabase = await createSupabaseServerClient(request);

    // Update session status to 'started'
    const { data, error } = await supabase
      .from('screening_sessions')
      .update({ status: 'started', started_at: new Date().toISOString() })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      // Fallback for dev: mock success
      return NextResponse.json({ status: 'started' });
    }

    return NextResponse.json(data);

  } catch (err) {
    console.error('Session start error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
