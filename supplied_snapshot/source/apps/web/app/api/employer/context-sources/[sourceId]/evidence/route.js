import { NextResponse } from 'next/server';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';

const ALLOWED_EMPLOYER_ROLES = ['owner', 'admin', 'recruiter', 'member'];

export async function GET(request, { params }) {
  const authRes = await requireUser(request);
  if (authRes.errorResponse) return authRes.errorResponse;
  const { user, supabase } = authRes;

  const { sourceId } = await params;
  if (!sourceId) {
    return NextResponse.json({ error: 'Source ID is required' }, { status: 400 });
  }

  // 1. Fetch source object to verify ownership
  const { data: source, error: srcErr } = await supabase
    .from('context_source_objects')
    .select('*')
    .eq('id', sourceId)
    .single();

  if (srcErr || !source) {
    return NextResponse.json({ error: 'Source object not found', code: 'NOT_FOUND' }, { status: 404 });
  }

  const membership = await getVerifiedOrgMembership(supabase, user.id, source.org_id);
  if (!membership || !ALLOWED_EMPLOYER_ROLES.includes(membership.membership_role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 2. Fetch versions
  const { data: versions } = await supabase
    .from('context_source_versions')
    .select('*')
    .eq('source_id', sourceId)
    .order('version_number', { ascending: false });

  const activeVersion = versions?.find((v) => v.status === 'completed' || v.status === 'partial') || versions?.[0];

  let parsedArtifact = null;
  let evidenceSpans = [];
  let documentResult = null;

  if (activeVersion) {
    // 3. Fetch parsed artifact
    const { data: parsed } = await supabase
      .from('context_parsed_artifacts')
      .select('*')
      .eq('source_version_id', activeVersion.id)
      .single();
    parsedArtifact = parsed;

    // 4. Fetch evidence spans
    if (parsed) {
      const { data: spans } = await supabase
        .from('context_evidence_spans')
        .select('*')
        .eq('parsed_artifact_id', parsed.id)
        .order('start_char', { ascending: true });
      evidenceSpans = spans || [];
    }

    // 5. Fetch document result / coverage
    const { data: docRes } = await supabase
      .from('context_document_results')
      .select('*')
      .eq('source_version_id', activeVersion.id)
      .single();
    documentResult = docRes;
  }

  return NextResponse.json({
    ok: true,
    source,
    active_version: activeVersion,
    versions: versions || [],
    parsed_artifact: parsedArtifact,
    evidence_spans: evidenceSpans,
    document_result: documentResult,
  });
}
