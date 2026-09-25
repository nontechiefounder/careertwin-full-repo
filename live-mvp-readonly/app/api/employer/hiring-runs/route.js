import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const supabase = await createSupabaseServerClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: runs, error } = await supabase
      .from('hiring_runs')
      .select('*')
      .eq('employer_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(runs);

  } catch (err) {
    console.error('Hiring runs fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const supabase = await createSupabaseServerClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    
    // Validate required fields
    if (!body.role_title) {
      return NextResponse.json({ error: 'Role title is required' }, { status: 400 });
    }

    const newRun = {
      employer_id: user.id,
      role_title: body.role_title,
      company: body.company || user.user_metadata?.company || 'Company',
      location: body.location || '',
      company_stage: body.company_stage || 'seed',
      job_description: body.job_description || '',
      must_haves: body.must_haves || [],
      nice_to_haves: body.nice_to_haves || [],
      disqualifiers: body.disqualifiers || [],
      hiring_notes: body.hiring_notes || '',
      status: body.status || 'active',
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('hiring_runs')
      .insert([newRun])
      .select()
      .single();

    if (error) {
      console.error('Hiring run creation error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ...data,
      hiring_run_id: data.id // Ensure frontend compatibility
    });

  } catch (err) {
    console.error('Hiring run creation unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
