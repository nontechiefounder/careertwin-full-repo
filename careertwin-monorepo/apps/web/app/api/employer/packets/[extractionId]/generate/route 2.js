import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';
import { evaluateCandidateTrustPacket } from '@packages/proof-engine';
import { extractMultiSpanEvidenceAndClaims } from '@/lib/evidenceExtractor';
import crypto from 'crypto';

export async function POST(request, { params }) {
  try {
    const { extractionId } = await params;
    
    // 1. ROUTE AUTHORIZATION FIRST — BEFORE creating or executing service-role client!
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    // Fetch Candidate and Role Context using authorized user client
    let { data: extraction, error: extError } = await supabase
      .from('candidates')
      .select('id, candidate_id, fit_score, candidate_profiles(*), hiring_runs(*)')
      .eq('id', extractionId)
      .maybeSingle();

    if (!extraction && !extError) {
      const { data: fallback, error: fallbackError } = await supabase
        .from('candidates')
        .select('id, candidate_id, fit_score, candidate_profiles(*), hiring_runs(*)')
        .eq('candidate_id', extractionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      extraction = fallback;
      extError = fallbackError;
    }

    if (extError || !extraction) {
      return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    }

    // 2. VERIFY ACTIVE ORG MEMBERSHIP
    const orgId = extraction.hiring_runs?.org_id;
    const membership = await getVerifiedOrgMembership(supabase, user.id, orgId);
    if (!membership || !['owner', 'recruiter', 'admin', 'hiring_manager'].includes(membership.membership_role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { candidate_profiles: profile, hiring_runs: run } = extraction;

    // 3. RETRIEVE CANONICAL PERSISTED PARSED DOCUMENT CONTENT (PART 2 FAIL-CLOSED)
    const { data: candDoc, error: candDocError } = await supabase
      .from('candidate_documents')
      .select('*')
      .eq('candidate_id', profile.id)
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (candDocError || !candDoc) {
      // FAIL-CLOSED (Part 2): No fallback to bio or dummy SHA256
      return NextResponse.json({
        error: 'DOCUMENT_EVIDENCE_UNAVAILABLE',
        missing_capability: 'candidate_documents',
        safe_next_action: 'Upload candidate document before packet generation',
        candidate_id: profile.id
      }, { status: 422 });
    }

    // SHA-256 Normalized Text Integrity Verification (Part 2)
    const computedNormSha256 = crypto.createHash('sha256').update(candDoc.normalized_text).digest('hex');
    if (computedNormSha256 !== candDoc.normalized_text_sha256) {
      return NextResponse.json({
        error: 'EVIDENCE_INTEGRITY_FAILURE',
        details: 'Normalized text SHA-256 hash mismatch',
        candidate_id: profile.id
      }, { status: 422 });
    }

    // 4. MULTI-SPAN EVIDENCE & SOURCE-FAITHFUL ATOMIC CLAIM EXTRACTION (PARTS 3, 4, 5, 7, 8)
    const { evidenceRefs, claims: rawClaims } = extractMultiSpanEvidenceAndClaims(candDoc, run);

    // 5. CANONICAL DETERMINISTIC PROOF ENGINE EVALUATION
    const evaluation = evaluateCandidateTrustPacket({
      hiringRun: run,
      rawCandidateData: { ...extraction, ...profile },
      rawClaims,
      allowedEvidenceRefs: evidenceRefs,
      actorId: user.id
    });

    // 6. ASSEMBLE EVALUATION PAYLOAD WITH ALL PART 5 IDENTIFIERS
    const evalPayload = {
      spec_version: evaluation.spec_version,
      candidate_document_id: candDoc.id,
      normalized_text_sha256: candDoc.normalized_text_sha256,
      why_sourced: `Sourced based on matching profile skills for ${run.role_title}.`,
      why_matched: `Candidate aligns with role requirements: ${run.role_title}.`,
      strongest_evidence: evidenceRefs.map(e => `${e.filename} [span offset ${e.source_offset.start_offset}-${e.source_offset.end_offset}]`),
      extracted_capabilities: rawClaims.map(c => c.claim_text),
      screen_summary: `Candidate evaluated as ${evaluation.decision_readiness} with Proof Strength ${evaluation.proof_strength}.`,
      what_is_verified: evaluation.what_is_verified,
      what_is_inferred: evaluation.what_is_inferred,
      what_remains_uncertain: evaluation.what_remains_uncertain,
      strengths: evaluation.what_is_verified.length > 0 ? evaluation.what_is_verified : [rawClaims[0]?.claim_text],
      concerns: evaluation.missing_proof.map(m => m.unproven_requirement),
      missing_proof: evaluation.missing_proof,
      recommended_next_step: evaluation.gate_pass 
        ? "Schedule Technical Deep Dive Interview" 
        : "Request Minimum Missing Proof Artifacts",
      evaluation_metrics: {
        role_fit_distribution: evaluation.role_fit_distribution,
        proof_strength: evaluation.proof_strength,
        proof_coverage: evaluation.proof_coverage,
        uncertainty: evaluation.uncertainty,
        entropy: evaluation.entropy,
        gate_pass: evaluation.gate_pass,
        decision_readiness: evaluation.decision_readiness
      }
    };

    // 7. ATOMIC CONCURRENCY-SAFE REVISION ALLOCATION & PERSISTENCE (PART 1, 2, 3)
    const supabaseService = await createSupabaseServerClient(request, true);

    const { data: rpcRes, error: rpcError } = await supabaseService.rpc('allocate_claim_ledger_revision_and_persist', {
      p_candidate_profile_id: profile.id,
      p_hiring_run_id: run.id,
      p_org_id: orgId,
      p_evidence_refs: evidenceRefs,
      p_claims: rawClaims,
      p_claim_edges: rawClaims.map((c, idx) => ({ claim_id: c.id, evidence_id: evidenceRefs[idx]?.id || evidenceRefs[0].id })),
      p_evaluation_output: evalPayload,
      p_candidate_id: extraction.id
    });

    if (rpcError || !rpcRes || rpcRes.length === 0) {
      console.error("CRITICAL PERSISTENCE ERROR: Atomic Claim Ledger Allocation failed:", rpcError?.message);
      return NextResponse.json({
        error: 'CLAIM_LEDGER_PERSISTENCE_FAILURE',
        details: rpcError?.message || 'Database error during atomic revision allocation'
      }, { status: 500 });
    }

    // Return the exact atomically constructed decision packet for this specific revision transaction
    const allocatedRecord = rpcRes[0];
    return NextResponse.json(allocatedRecord.decision_packet);

  } catch (err) {
    console.error('Decision Generation Error:', err);
    return NextResponse.json({ error: 'Failed to generate assessment' }, { status: 500 });
  }
}
