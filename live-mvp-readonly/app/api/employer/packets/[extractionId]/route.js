import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  try {
    const { extractionId } = await params;
    const supabase = await createSupabaseServerClient(request);

    // Fetch the candidate entry (this is the "extraction")
    let { data: extraction, error: extError } = await supabase
      .from('candidates')
      .select(`
        *,
        candidate_profiles (*)
      `)
      .eq('id', extractionId)
      .maybeSingle();

    // Fallback: If not found by candidate-entry ID, try profile ID
    if (!extraction && !extError) {
      const { data: fallback, error: fallbackError } = await supabase
        .from('candidates')
        .select(`
          *,
          candidate_profiles (*)
        `)
        .eq('candidate_id', extractionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      extraction = fallback;
      extError = fallbackError;
    }

    if (extError || !extraction) {
      return NextResponse.json({ error: 'Candidate assessment not found' }, { status: 404 });
    }


    // Fetch the hiring run (the role brief)
    const { data: run, error: runError } = await supabase
      .from('hiring_runs')
      .select('*')
      .eq('id', extraction.hiring_run_id)
      .single();

    // Map to the frontend's expected "extraction" naming
    const mappedExtraction = {
      ...extraction,
      candidate_name: extraction.candidate_profiles?.name,
      current_role: extraction.candidate_profiles?.bio, // Subtitle/headline
      location: extraction.candidate_profiles?.location,
      skills: extraction.candidate_profiles?.skills || []
    };

    // Fetch communication history
    const { data: emails } = await supabase
      .from('scheduled_emails')
      .select('*')
      .eq('candidate_id', extraction.id)

      .order('scheduled_for', { ascending: true });

    return NextResponse.json({
      packet: extraction.decision_packet,
      extraction: mappedExtraction,
      hiring_run: run,
      emails: emails || []
    });

  } catch (err) {
    console.error('Packet Fetch Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
