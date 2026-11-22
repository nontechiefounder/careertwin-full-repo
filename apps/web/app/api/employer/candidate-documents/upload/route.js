import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { parseDocument } from '@/lib/parser/documentParser';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 15MB upload limit

export async function POST(request) {
  try {
    // 1. ROUTE AUTHORIZATION FIRST — BEFORE any database or storage writes!
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    const formData = await request.formData();
    const file = formData.get('file');
    const hiringRunId = formData.get('hiring_run_id');
    const candidateIdParam = formData.get('candidate_id');
    const candidateNameParam = formData.get('candidate_name') || 'Candidate Applicant';

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'NO_FILE_UPLOADED', details: 'No file uploaded' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Validate File Size & Supported Format (PDF only; OCR & DOCX not supported)
    if (buffer.length > MAX_FILE_SIZE) {
      return NextResponse.json({
        error: 'FILE_TOO_LARGE',
        details: `Uploaded file exceeds size limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
      }, { status: 413 });
    }

    const filename = file.name || 'document.pdf';
    const mimeType = file.type || 'application/pdf';
    const isPdf = mimeType.includes('pdf') || filename.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      return NextResponse.json({
        error: 'UNSUPPORTED_MEDIA_TYPE',
        details: 'Only PDF documents are supported for ingestion. OCR and DOCX formats are not currently supported.'
      }, { status: 415 });
    }

    // 3. Genuine Parser Execution & Text Extraction
    let parseResult;
    try {
      parseResult = await parseDocument({
        buffer,
        filename,
        mimeType: 'application/pdf'
      });
    } catch (parseErr) {
      console.error('[Document Upload Parse Error]:', parseErr.message);
      return NextResponse.json({
        error: 'PARSER_EXECUTION_FAILURE',
        details: parseErr.message
      }, { status: 422 });
    }

    // 4. Strict Tenant Organization & Hiring Run Resolution (NO SILENT FALLBACKS)
    let orgId = null;
    let hiringRun = null;

    if (hiringRunId) {
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(hiringRunId);
      if (!isValidUUID) {
        return NextResponse.json({
          error: 'INVALID_HIRING_RUN_ID',
          details: `Supplied hiring_run_id ${hiringRunId} is malformed`
        }, { status: 400 });
      }

      const { data: runData, error: runError } = await supabase
        .from('hiring_runs')
        .select('id, org_id, employer_id, status')
        .eq('id', hiringRunId)
        .maybeSingle();

      if (runError || !runData) {
        return NextResponse.json({
          error: 'HIRING_RUN_NOT_FOUND',
          details: `Supplied hiring run ${hiringRunId} does not exist or is inaccessible`
        }, { status: 404 });
      }

      const membership = await getVerifiedOrgMembership(supabase, user.id, runData.org_id);
      if (!membership || !['owner', 'admin', 'recruiter', 'hiring_manager'].includes(membership.membership_role)) {
        return NextResponse.json({
          error: 'FORBIDDEN',
          details: 'User is not an authorized member of the hiring run organization'
        }, { status: 403 });
      }

      hiringRun = runData;
      orgId = runData.org_id;
    } else {
      // If hiring_run_id is omitted, explicit authorized org_id is required
      const explicitOrgId = formData.get('org_id');
      if (!explicitOrgId) {
        return NextResponse.json({
          error: 'HIRING_RUN_REQUIRED',
          details: 'hiring_run_id or explicit authorized org_id is required'
        }, { status: 400 });
      }

      const membership = await getVerifiedOrgMembership(supabase, user.id, explicitOrgId);
      if (!membership || !['owner', 'admin', 'recruiter', 'hiring_manager'].includes(membership.membership_role)) {
        return NextResponse.json({
          error: 'FORBIDDEN',
          details: 'User is not an authorized member of the specified organization'
        }, { status: 403 });
      }
      orgId = explicitOrgId;
    }

    const supabaseService = await createSupabaseServerClient(request, true);

    // 5. Validate Organization Ownership and Permitted Hiring-Run Relationships (C09-02)
    let candidateProfileId = null;
    let candidateRowId = null;

    if (candidateIdParam) {
      const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateIdParam);
      if (!isValidUUID) {
        return NextResponse.json({
          error: 'INVALID_CANDIDATE_ID',
          details: `Supplied candidate identifier ${candidateIdParam} is malformed`
        }, { status: 400 });
      }

      const { data: existingCand } = await supabaseService
        .from('candidates')
        .select('id, candidate_id, hiring_run_id, hiring_runs(id, org_id)')
        .eq('id', candidateIdParam)
        .maybeSingle();

      if (existingCand) {
        // Enforce organization ownership before any storage or DB writes
        const candOrgId = existingCand.hiring_runs?.org_id;
        if (candOrgId && candOrgId !== orgId) {
          return NextResponse.json({
            error: 'FORBIDDEN',
            details: `Candidate record ${candidateIdParam} belongs to a different organization`
          }, { status: 403 });
        }

        if (hiringRunId && existingCand.hiring_run_id !== hiringRunId) {
          return NextResponse.json({
            error: 'CANDIDATE_RUN_MISMATCH',
            details: `Candidate record ${candidateIdParam} belongs to hiring run ${existingCand.hiring_run_id}, not requested run ${hiringRunId}`
          }, { status: 409 });
        }
        candidateRowId = existingCand.id;
        candidateProfileId = existingCand.candidate_id;
      } else {
        const { data: existingProf } = await supabaseService
          .from('candidate_profiles')
          .select('id')
          .eq('id', candidateIdParam)
          .maybeSingle();

        if (!existingProf) {
          return NextResponse.json({
            error: 'CANDIDATE_NOT_FOUND',
            details: `Candidate entity ${candidateIdParam} does not exist`
          }, { status: 404 });
        }

        // Validate organization ownership for direct candidate_profiles ID lookups
        const { data: candLinks } = await supabaseService
          .from('candidates')
          .select('id, hiring_run_id, hiring_runs(id, org_id)')
          .eq('candidate_id', existingProf.id);

        const candInTargetOrg = candLinks?.filter(c => c.hiring_runs?.org_id === orgId) || [];
        const candInOtherOrg = candLinks?.filter(c => c.hiring_runs?.org_id && c.hiring_runs.org_id !== orgId) || [];

        const { data: docLinks } = await supabaseService
          .from('candidate_documents')
          .select('id, org_id')
          .eq('candidate_id', existingProf.id);

        const docInTargetOrg = docLinks?.filter(d => d.org_id === orgId) || [];
        const docInOtherOrg = docLinks?.filter(d => d.org_id && d.org_id !== orgId) || [];

        const hasTargetOrgOwnership = candInTargetOrg.length > 0 || docInTargetOrg.length > 0;
        const hasOtherOrgOwnership = candInOtherOrg.length > 0 || docInOtherOrg.length > 0;

        if (hasOtherOrgOwnership && !hasTargetOrgOwnership) {
          return NextResponse.json({
            error: 'FORBIDDEN',
            details: `Candidate profile ${candidateIdParam} belongs to a different organization`
          }, { status: 403 });
        }

        if (!hasTargetOrgOwnership && candLinks && candLinks.length === 0 && (!docLinks || docLinks.length === 0)) {
          // Profile exists but has no relationship with this org
          return NextResponse.json({
            error: 'FORBIDDEN',
            details: `Candidate profile ${candidateIdParam} has no authorized relationship with organization ${orgId}`
          }, { status: 403 });
        }

        if (hiringRunId) {
          const runMatch = candInTargetOrg.find(c => c.hiring_run_id === hiringRunId);
          if (runMatch) {
            candidateRowId = runMatch.id;
          }
        }
        candidateProfileId = existingProf.id;
      }
    }

    // 6. Original-File Preservation in Private Storage
    const docUuid = crypto.randomUUID();
    const safeFilename = encodeURIComponent(parseResult.filename || 'document.pdf');
    const storagePath = `${orgId}/${hiringRunId || 'unassigned'}/${docUuid}/${safeFilename}`;

    const { error: storageUploadErr } = await supabaseService.storage
      .from('candidate_resumes')
      .upload(storagePath, buffer, {
        contentType: 'application/pdf',
        upsert: false
      });

    if (storageUploadErr) {
      console.error('[Storage Upload Failure]:', storageUploadErr);
      return NextResponse.json({
        error: 'STORAGE_UPLOAD_FAILURE',
        details: storageUploadErr.message
      }, { status: 500 });
    }

    // 7. Resolve or Create Candidate Record Independently of Login Accounts
    // (Customer upload path does NOT create synthetic example.invalid auth users!)
    let createdNewProfile = false;
    let createdNewCandRow = false;

    if (!candidateProfileId) {
      const textLines = parseResult.normalized_text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const headlineMatch = textLines.find(l =>
        l.length < 80 && /(engineer|developer|architect|lead|manager|specialist|analyst|administrator|consultant|sre)/i.test(l)
      ) || textLines[0]?.substring(0, 50) || 'Infrastructure Engineer';
      const cleanHeadline = headlineMatch.replace(/^[\W_]+|[\W_]+$/g, '').trim();

      const { data: newProfile, error: profError } = await supabaseService
        .from('candidate_profiles')
        .insert([{
          name: candidateNameParam || 'Parsed Candidate',
          bio: cleanHeadline || 'Infrastructure Engineer',
          location: 'Parsed from Resume'
        }])
        .select()
        .single();

      if (profError || !newProfile) {
        console.error('[Candidate Profile Creation Error]:', profError);
        // Rollback storage object
        await supabaseService.storage.from('candidate_resumes').remove([storagePath]);
        return NextResponse.json({
          error: 'CANDIDATE_CREATION_FAILURE',
          details: profError?.message || 'Failed to create candidate profile'
        }, { status: 500 });
      }
      candidateProfileId = newProfile.id;
      createdNewProfile = true;
    }

    if (hiringRunId && !candidateRowId) {
      const { data: existingCand } = await supabaseService
        .from('candidates')
        .select('id')
        .eq('hiring_run_id', hiringRunId)
        .eq('candidate_id', candidateProfileId)
        .maybeSingle();

      if (existingCand) {
        candidateRowId = existingCand.id;
      } else {
        const { data: newCand, error: candError } = await supabaseService
          .from('candidates')
          .insert([{
            hiring_run_id: hiringRunId,
            candidate_id: candidateProfileId,
            status: 'new'
          }])
          .select()
          .single();

        if (candError) {
          console.error('[Candidate Row Creation Error]:', candError);
          // Rollback storage & profile
          await supabaseService.storage.from('candidate_resumes').remove([storagePath]);
          if (createdNewProfile) {
            await supabaseService.from('candidate_profiles').delete().eq('id', candidateProfileId);
          }
          return NextResponse.json({
            error: 'CANDIDATE_PERSISTENCE_FAILURE',
            details: candError.message
          }, { status: 500 });
        }
        candidateRowId = newCand.id;
        createdNewCandRow = true;
      }
    }

    // 8. Persist Canonical Parsed Document with Storage Path & Full Provenance Metadata (C09-05)
    const parserMeta = parseResult.parser_metadata || {};
    const pageSpans = parserMeta.page_spans || parseResult.page_spans || [{ page_number: 1, start_char: 0, end_char: parseResult.normalized_text.length }];
    const totalPages = parserMeta.total_pages || parserMeta.page_count || parseResult.total_pages || parseResult.page_count || pageSpans.length || 1;

    const { data: docRecord, error: docError } = await supabaseService
      .from('candidate_documents')
      .insert([{
        id: docUuid,
        candidate_id: candidateProfileId,
        org_id: orgId,
        hiring_run_id: hiringRunId || null,
        filename: parseResult.filename,
        mime_type: 'application/pdf',
        byte_size: buffer.length,
        file_sha256: parseResult.file_sha256,
        normalized_text: parseResult.normalized_text,
        normalized_text_sha256: parseResult.normalized_text_sha256,
        parser_name: parseResult.parser_name || 'pdf-parse@2.4.5',
        storage_path: storagePath,
        parser_metadata: {
          parser_version: parseResult.parser_name || 'pdf-parse@2.4.5',
          page_count: totalPages,
          total_pages: totalPages,
          page_spans: pageSpans,
          char_count: parseResult.normalized_text.length,
          parsed_at: new Date().toISOString()
        }
      }])
      .select()
      .single();

    if (docError) {
      console.error('[Document Persistence Error]:', docError);
      // Clean up storage and created database rows
      await supabaseService.storage.from('candidate_resumes').remove([storagePath]);
      if (createdNewCandRow && candidateRowId) {
        await supabaseService.from('candidates').delete().eq('id', candidateRowId);
      }
      if (createdNewProfile && candidateProfileId) {
        await supabaseService.from('candidate_profiles').delete().eq('id', candidateProfileId);
      }
      return NextResponse.json({
        error: 'DOCUMENT_PERSISTENCE_FAILURE',
        details: docError.message
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      document: docRecord,
      candidate_id: candidateRowId,
      profile_id: candidateProfileId,
      extraction_id: candidateRowId,
      storage_path: storagePath
    });

  } catch (err) {
    console.error('[Document Upload Error]:', err);
    return NextResponse.json({ error: 'Internal server error: ' + err.message }, { status: 500 });
  }
}
