import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function GET(request, { params }) {
  try {
    const { roleId } = await params;
    const supabase = await createSupabaseServerClient(request);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch the hiring run details
    const { data: run, error: runError } = await supabase
      .from('hiring_runs')
      .select('*')
      .eq('id', roleId)
      .single();

    if (runError) {
      console.error('Run fetch error:', runError);
      return NextResponse.json({ error: 'Role not found' }, { status: 404 });
    }

    // Fetch candidates (extractions) for this run with their full profiles
    const { data: extractions, error: extError } = await supabase
      .from('candidates')
      .select('*, candidate_profiles(*)')
      .eq('hiring_run_id', roleId);

    if (extError) {
      console.error('Extractions fetch error:', extError);
    }

    return NextResponse.json({
      hiring_run: run,
      extractions: extractions || [],
      total_scanned: run.candidates_count || 0 // Using the real database count now
    });

  } catch (err) {
    console.error('Shortlist fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
