import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';

const MAX_SEARCH_LENGTH = 100;

/**
 * Strip PostgREST filter-syntax delimiters (commas, parens, quotes, backslashes, asterisks)
 * and escape LIKE wildcards while preserving legitimate punctuation like apostrophes and dots
 * (e.g. "O'Reilly", "Node.js") for double-quoted `.or(...)` operands.
 */
export function sanitizeSearchQuery(rawQuery) {
  if (typeof rawQuery !== 'string') return '';
  const bounded = rawQuery.trim().slice(0, MAX_SEARCH_LENGTH);
  return bounded
    .replace(/[\\,"()*]/g, ' ')
    .replace(/[%_]/g, (ch) => `\\${ch}`)
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawQuery = searchParams.get('q');
    const query = sanitizeSearchQuery(rawQuery);

    if (!query) {
      return NextResponse.json({ results: [] });
    }

    const supabase = await createSupabaseServerClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Search Hiring Runs scoped to the authenticated employer
    // Double backslashes inside PostgREST double-quoted `.or(...)` operands so `\%` and `\_` reach PostgreSQL intact
    const orQuery = query.replace(/\\/g, '\\\\');
    const { data: runs, error: runsError } = await supabase
      .from('hiring_runs')
      .select('id, role_title, company, status, created_at')
      .or(`role_title.ilike."%${orQuery}%",company.ilike."%${orQuery}%"`)
      .eq('employer_id', user.id)
      .limit(10);

    if (runsError) {
      console.error('Search hiring_runs error:', runsError);
      return NextResponse.json({ error: 'Search query failed' }, { status: 500 });
    }

    // 2. Search Candidate Profiles (governed by RLS)
    const { data: candidates, error: candError } = await supabase
      .from('candidate_profiles')
      .select('id, name, bio, location')
      .ilike('name', `%${query}%`)
      .limit(10);

    if (candError) {
      console.error('Search candidate_profiles error:', candError);
      return NextResponse.json({ error: 'Search query failed' }, { status: 500 });
    }

    const results = [
      ...(runs || []).map((r) => ({
        id: r.id,
        type: 'role',
        title: r.role_title,
        subtitle: r.company,
        url: `/employer/brief/${r.id}`,
        status: r.status,
      })),
      ...(candidates || []).map((c) => ({
        id: c.id,
        type: 'candidate',
        title: c.name,
        subtitle: c.bio,
        url: `/employer/packet/${c.id}`,
        location: c.location,
      })),
    ];

    return NextResponse.json({ results: results.slice(0, 15) });
  } catch (err) {
    console.error('Search API Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
