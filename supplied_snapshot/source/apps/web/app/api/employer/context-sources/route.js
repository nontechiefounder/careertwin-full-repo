import { NextResponse } from 'next/server';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';

const ALLOWED_EMPLOYER_ROLES = ['owner', 'admin', 'recruiter', 'member'];

export async function GET(request) {
  const authRes = await requireUser(request);
  if (authRes.errorResponse) return authRes.errorResponse;
  const { user, supabase } = authRes;

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get('org_id');
  const hiringRunId = searchParams.get('hiring_run_id');

  let targetOrgId = orgId;
  if (!targetOrgId && hiringRunId) {
    const { data: run } = await supabase
      .from('hiring_runs')
      .select('org_id')
      .eq('id', hiringRunId.trim())
      .single();
    if (run) targetOrgId = run.org_id;
  }

  if (!targetOrgId) {
    const { data: memberships } = await supabase
      .from('organization_memberships')
      .select('org_id')
      .eq('user_id', user.id);
    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ error: 'No organization membership found' }, { status: 403 });
    }
    targetOrgId = memberships[0].org_id;
  }

  const membership = await getVerifiedOrgMembership(supabase, user.id, targetOrgId);
  if (!membership || !ALLOWED_EMPLOYER_ROLES.includes(membership.membership_role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch sources with their versions
  const { data: sources, error } = await supabase
    .from('context_source_objects')
    .select(`
      id,
      org_id,
      workspace_id,
      source_uri,
      source_kind,
      confidentiality,
      created_at,
      context_source_versions (
        id,
        version_number,
        original_file_sha256,
        original_mime_type,
        byte_size,
        status,
        effective_time,
        ingested_at
      )
    `)
    .eq('org_id', targetOrgId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Format response with active version and version count
  const formattedSources = (sources || []).map((s) => {
    const versions = (s.context_source_versions || []).sort(
      (a, b) => b.version_number - a.version_number
    );
    const activeVersion = versions.find((v) => v.status === 'completed' || v.status === 'partial') || versions[0] || null;

    return {
      id: s.id,
      source_uri: s.source_uri,
      source_kind: s.source_kind,
      confidentiality: s.confidentiality,
      created_at: s.created_at,
      version_count: versions.length,
      active_version: activeVersion,
      versions,
    };
  });

  return NextResponse.json({
    ok: true,
    sources: formattedSources,
    total_count: formattedSources.length,
  });
}
