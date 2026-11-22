import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { processOutboxEvent, extractEvidenceSpans } from '@/lib/contextEvidenceWorker';

const ALLOWED_EMPLOYER_ROLES = ['owner', 'admin', 'recruiter', 'member'];
const ALLOWED_SOURCE_KINDS = ['RESUME', 'JOB_DESCRIPTION', 'COMPANY_RESEARCH', 'INTERVIEW_NOTES', 'PORTFOLIO'];

export async function POST(request) {
  // 1. Authenticate employer
  const authRes = await requireUser(request);
  if (authRes.errorResponse) return authRes.errorResponse;
  const { user, supabase } = authRes;

  // 2. Parse request payload (supports JSON or multipart)
  let body;
  try {
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await request.json();
    } else {
      const formData = await request.formData();
      body = {
        org_id: formData.get('org_id'),
        hiring_run_id: formData.get('hiring_run_id'),
        source_uri: formData.get('source_uri') || formData.get('filename'),
        source_kind: formData.get('source_kind') || 'RESUME',
        content: formData.get('content'),
        effective_time: formData.get('effective_time'),
      };
    }
  } catch {
    return NextResponse.json({ error: 'Failed to parse request payload', code: 'INVALID_PAYLOAD' }, { status: 400 });
  }

  const {
    org_id,
    hiring_run_id,
    source_uri,
    source_kind = 'RESUME',
    content,
    effective_time = null,
  } = body || {};

  if (!source_uri || typeof source_uri !== 'string' || !source_uri.trim()) {
    return NextResponse.json({ error: 'source_uri or filename is required', code: 'MISSING_SOURCE_URI' }, { status: 400 });
  }

  if (!ALLOWED_SOURCE_KINDS.includes(source_kind)) {
    return NextResponse.json(
      { error: `Invalid source_kind '${source_kind}'. Allowed: ${ALLOWED_SOURCE_KINDS.join(', ')}`, code: 'INVALID_SOURCE_KIND' },
      { status: 400 }
    );
  }

  // 3. Resolve Organization and verify membership
  let targetOrgId = org_id;
  if (!targetOrgId && hiring_run_id) {
    const { data: run } = await supabase
      .from('hiring_runs')
      .select('org_id')
      .eq('id', hiring_run_id.trim())
      .single();
    if (run) targetOrgId = run.org_id;
  }

  if (!targetOrgId) {
    // Check user's memberships
    const { data: memberships } = await supabase
      .from('organization_memberships')
      .select('org_id, membership_role')
      .eq('user_id', user.id);

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ error: 'No organization membership found for user', code: 'NO_MEMBERSHIP' }, { status: 403 });
    }
    if (memberships.length > 1) {
      return NextResponse.json({ error: 'Ambiguous organization context. Explicit org_id or hiring_run_id required.', code: 'AMBIGUOUS_ORG' }, { status: 400 });
    }
    targetOrgId = memberships[0].org_id;
  }

  const membership = await getVerifiedOrgMembership(supabase, user.id, targetOrgId);
  if (!membership || !ALLOWED_EMPLOYER_ROLES.includes(membership.membership_role)) {
    return NextResponse.json({ error: 'Forbidden: User is not authorized for target organization', code: 'FORBIDDEN' }, { status: 403 });
  }

  // 4. Compute file SHA-256 and byte size
  const rawTextContent = typeof content === 'string' ? content : (content ? String(content) : '');
  const fileSha256 = crypto.createHash('sha256').update(rawTextContent, 'utf-8').digest('hex');
  const byteSize = Buffer.byteLength(rawTextContent, 'utf-8');
  const mimeType = source_uri.endsWith('.pdf') ? 'application/pdf' : 'text/plain';

  const cleanUri = source_uri.trim();
  const workspaceId = `ws_${targetOrgId.slice(0, 8)}`;
  const artifactId = `storage://context_artifacts/${targetOrgId}/${cleanUri}`;
  const idempotencyKey = `idemp_${targetOrgId}_${fileSha256}_${Date.now()}`;

  // 5. Call transactional ingestion RPC (or direct database transaction)
  // Check if RPC exists
  const { data: rpcData, error: rpcErr } = await supabase.rpc(
    'ingest_context_source_version_transactional',
    {
      p_org_id: targetOrgId,
      p_workspace_id: workspaceId,
      p_source_uri: cleanUri,
      p_source_kind: source_kind,
      p_file_sha256: fileSha256,
      p_mime_type: mimeType,
      p_byte_size: byteSize,
      p_original_artifact_id: artifactId,
      p_effective_time: effective_time,
      p_idempotency_key: idempotencyKey,
    }
  );

  let sourceId;
  let versionId;
  let versionNumber;
  let outboxId;
  let isNewSource = true;

  if (rpcErr || !rpcData || rpcData.length === 0) {
    // Fallback: direct atomic tables write in case migration is applying
    // Check if source object exists
    const { data: existingSource } = await supabase
      .from('context_source_objects')
      .select('id')
      .eq('org_id', targetOrgId)
      .eq('source_uri', cleanUri)
      .single();

    if (existingSource) {
      sourceId = existingSource.id;
      isNewSource = false;
      const { data: versions } = await supabase
        .from('context_source_versions')
        .select('version_number')
        .eq('source_id', sourceId)
        .order('version_number', { ascending: false })
        .limit(1);
      versionNumber = (versions?.[0]?.version_number || 0) + 1;

      // Supersede older versions
      await supabase
        .from('context_source_versions')
        .update({ status: 'superseded' })
        .eq('source_id', sourceId)
        .in('status', ['pending', 'running', 'completed']);
    } else {
      const { data: newSrc, error: srcErr } = await supabase
        .from('context_source_objects')
        .insert({
          org_id: targetOrgId,
          workspace_id: workspaceId,
          source_uri: cleanUri,
          source_kind,
        })
        .select('id')
        .single();

      if (srcErr) throw new Error(srcErr.message);
      sourceId = newSrc.id;
      versionNumber = 1;
    }

    const { data: newVer, error: verErr } = await supabase
      .from('context_source_versions')
      .insert({
        source_id: sourceId,
        org_id: targetOrgId,
        version_number: versionNumber,
        original_artifact_id: artifactId,
        original_file_sha256: fileSha256,
        original_mime_type: mimeType,
        byte_size: byteSize,
        effective_time,
        status: 'pending',
      })
      .select('id')
      .single();

    if (verErr) throw new Error(verErr.message);
    versionId = newVer.id;

    const { data: newOutbox } = await supabase
      .from('context_transactional_outbox')
      .insert({
        org_id: targetOrgId,
        event_type: 'SOURCE_VERSION_INGESTED',
        aggregate_type: 'source_version',
        aggregate_id: versionId,
        payload: {
          source_id: sourceId,
          version_id: versionId,
          version_number: versionNumber,
          source_uri: cleanUri,
          file_sha256: fileSha256,
          artifact_id: artifactId,
        },
        idempotency_key: idempotencyKey,
        status: 'pending',
      })
      .select('id')
      .single();

    outboxId = newOutbox?.id;
  } else {
    sourceId = rpcData[0].source_id;
    versionId = rpcData[0].version_id;
    versionNumber = rpcData[0].version_number;
    outboxId = rpcData[0].outbox_id;
    isNewSource = rpcData[0].is_new_source;
  }

  // 6. Execute worker processing for the outbox event
  if (outboxId) {
    const outboxEvent = {
      id: outboxId,
      org_id: targetOrgId,
      payload: {
        source_id: sourceId,
        version_id: versionId,
        version_number: versionNumber,
        artifact_id: artifactId,
      },
      attempts: 0,
      max_attempts: 5,
    };

    // Execute background worker processing immediately for synchronous readiness
    await processOutboxEvent(supabase, outboxEvent);
  }

  return NextResponse.json({
    ok: true,
    source_id: sourceId,
    version_id: versionId,
    version_number: versionNumber,
    is_new_source: isNewSource,
    source_uri: cleanUri,
    file_sha256: fileSha256,
    status: 'completed',
    freshness: versionNumber > 1 ? 'UPDATED_VERSION' : 'INITIAL_VERSION',
  });
}
