import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function GET(request, { params }) {
  try {
    const { documentId } = await params;

    // 1. Authenticate user
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    // 2. Fetch candidate document metadata using service client
    const supabaseService = await createSupabaseServerClient(request, true);
    const { data: doc, error: docError } = await supabaseService
      .from('candidate_documents')
      .select('*')
      .eq('id', documentId)
      .maybeSingle();

    if (docError || !doc) {
      return NextResponse.json({
        error: 'DOCUMENT_NOT_FOUND',
        details: `Candidate document ${documentId} does not exist`
      }, { status: 404 });
    }

    // 3. Verify user membership in document.org_id (Tenant Isolation)
    const membership = await getVerifiedOrgMembership(supabase, user.id, doc.org_id);
    if (!membership || !['owner', 'admin', 'recruiter', 'hiring_manager'].includes(membership.membership_role)) {
      return NextResponse.json({
        error: 'FORBIDDEN',
        details: 'Cross-tenant document access denied'
      }, { status: 403 });
    }

    if (!doc.storage_path) {
      return NextResponse.json({
        error: 'STORAGE_REFERENCE_NOT_FOUND',
        details: 'Document has no persisted storage reference'
      }, { status: 404 });
    }

    // 4. Download original bytes from private storage
    const { data: fileBlob, error: downloadErr } = await supabaseService.storage
      .from('candidate_resumes')
      .download(doc.storage_path);

    if (downloadErr || !fileBlob) {
      return NextResponse.json({
        error: 'STORAGE_RETRIEVAL_FAILED',
        details: downloadErr?.message || 'Storage download error'
      }, { status: 500 });
    }

    const buffer = Buffer.from(await fileBlob.arrayBuffer());

    // 5. Verify byte SHA-256 matches persisted file_sha256
    const computedHash = crypto.createHash('sha256').update(buffer).digest('hex');
    if (computedHash !== doc.file_sha256) {
      return NextResponse.json({
        error: 'STORAGE_INTEGRITY_MISMATCH',
        details: `Retrieved bytes SHA-256 (${computedHash}) does not match persisted file_sha256 (${doc.file_sha256})`
      }, { status: 500 });
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': doc.mime_type || 'application/pdf',
        'Content-Disposition': `inline; filename="${encodeURIComponent(doc.filename || 'resume.pdf')}"`,
        'X-File-SHA256': doc.file_sha256,
        'X-Parser-Name': doc.parser_name || 'pdf-parse@2.4.5',
        'Content-Length': buffer.length.toString()
      }
    });

  } catch (err) {
    console.error('[Document Download Error]:', err);
    return NextResponse.json({ error: 'Internal server error: ' + err.message }, { status: 500 });
  }
}
