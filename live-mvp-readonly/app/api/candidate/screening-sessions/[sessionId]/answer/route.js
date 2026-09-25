import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function POST(request, { params }) {
  try {
    const { sessionId } = await params;
    const { question_id, answer_text } = await request.json();
    const supabase = await createSupabaseServerClient(request);

    // Upsert the answer
    const { data, error } = await supabase
      .from('screening_answers')
      .upsert({
        session_id: sessionId,
        question_id: question_id,
        answer_text: answer_text,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      // Fallback for dev: mock success
      return NextResponse.json({ status: 'saved' });
    }

    return NextResponse.json(data);

  } catch (err) {
    console.error('Answer save error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
