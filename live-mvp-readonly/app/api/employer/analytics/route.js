import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const supabase = await createSupabaseServerClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Attempt to fetch summary analytics from Supabase
    // This assumes tables 'hiring_runs' and 'candidates' exist.
    // We'll wrap in try/catch to return elegant empty/mock data if tables are missing.
    
    // Correct Relational Fetch:
    // 1. Fetch runs for this user (or all if dev)
    const { data: runs, error: runsError } = await supabase
      .from('hiring_runs')
      .select('*')
      .order('created_at', { ascending: false });

    if (runsError) throw runsError;

    // 2. Fetch candidates for THESE specific runs only
    const runIds = runs.map(r => r.id);
    const { data: candidates, error: candError } = await supabase
      .from('candidates')
      .select('*')
      .in('hiring_run_id', runIds);

    if (candError) {
        console.error('Analytics candidate fetch error:', candError);
    }

    // 3. Fetch recent activity from the live agent feed
    const { data: events } = await supabase
      .from('activity_events')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(15);

    const actualCandidates = candidates || [];

    // Aggregate statistics
    const active_roles = runs.length;
    const total_candidates = actualCandidates.length;
    const total_shortlisted = actualCandidates.filter(c => c.status === 'shortlisted').length;
    const screens_completed = actualCandidates.filter(c => c.screening_status === 'completed').length;
    const packets_generated = actualCandidates.filter(c => !!c.decision_packet).length;

    // Stage counts
    const stage_counts = actualCandidates.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      summary: {
        active_roles,
        total_candidates,
        total_shortlisted,
        screens_completed,
        packets_generated
      },
      stage_counts,
      runs: runs.map(r => ({
        ...r,
        candidates_count: actualCandidates.filter(c => c.hiring_run_id === r.id).length,
        shortlisted_count: actualCandidates.filter(c => c.hiring_run_id === r.id && c.status === 'shortlisted').length,
        screens_completed: actualCandidates.filter(c => c.hiring_run_id === r.id && c.screening_status === 'completed').length
      })),
      recent_activity: events || []
    });

  } catch (err) {
    console.warn('Analytics fetch error (likely missing tables):', err.message);
    // Return graceful empty state so dashboard doesn't crash
    return NextResponse.json({
      summary: { active_roles: 0, total_candidates: 0, total_shortlisted: 0, screens_completed: 0, packets_generated: 0 },
      stage_counts: {},
      runs: [],
      recent_activity: []
    });
  }
}
