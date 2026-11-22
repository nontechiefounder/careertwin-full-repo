import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { requireUser, getVerifiedOrgMembership } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';
import { evaluateCandidateTrustPacket } from '@packages/proof-engine';
import { extractMultiSpanEvidenceAndClaims } from '@/lib/evidenceExtractor';
import crypto from 'crypto';

export async function POST(request, { params }) {
    let bodyJson = {};
    try {
      if (typeof request?.clone === 'function') {
        bodyJson = await request.clone().json().catch(() => ({}));
      } else if (typeof request?.json === 'function') {
        bodyJson = await request.json().catch(() => ({}));
      } else if (request?.body && typeof request.body === 'object') {
        bodyJson = request.body;
      }
    } catch (_) {
      bodyJson = {};
    }
  try {
    const { extractionId } = await params;

    // 1. ROUTE AUTHORIZATION FIRST — BEFORE any database or service operations!
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    // 2. Fetch Candidate and Role Context using authorized user client
    let { data: extraction, error: extError } = await supabase
      .from('candidates')
      .select('id, candidate_id, fit_score, decision_packet, candidate_profiles(*), hiring_runs(*)')
      .eq('id', extractionId)
      .maybeSingle();

    // Fallback: If not found by candidate row ID, check profile ID
    if (!extraction && !extError) {
      const { data: fallback, error: fallbackError } = await supabase
        .from('candidates')
        .select('id, candidate_id, fit_score, decision_packet, candidate_profiles(*), hiring_runs(*)')
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

    // 3. VERIFY ACTIVE ORG MEMBERSHIP
    const orgId = extraction.hiring_runs?.org_id;
    const membership = await getVerifiedOrgMembership(supabase, user.id, orgId);
    if (!membership || !['owner', 'recruiter', 'admin', 'hiring_manager'].includes(membership.membership_role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { candidate_profiles: profile, hiring_runs: run } = extraction;

    // 3.B. VERIFY EXPLICIT PERSISTED APPROVAL OF EXACT RUBRIC VERSION (CTW-V2-DEMO-CORE-03)
    const briefJson = run?.brief_json || {};
    const currentRubricVersion = briefJson?.regenerated_at && briefJson?.contract_version
      ? briefJson.contract_version
      : (run?.rubric_version || briefJson?.contract_version || run?.contract_version || '1.0.0');

    // 1. Missing approval check (cannot be inferred from status or requirements)
    if (briefJson.contract_approved === undefined || briefJson.contract_approved === null) {
      return NextResponse.json({
        error: 'UNAPPROVED_PROOF_CONTRACT',
        details: 'The role ProofContract has not been explicitly approved. Review and approve role requirements before generating trust packets.'
      }, { status: 422 });
    }

    // 2. Explicitly false / rejected check
    if (briefJson.contract_approved === false) {
      return NextResponse.json({
        error: 'UNAPPROVED_PROOF_CONTRACT',
        details: 'The role ProofContract has been explicitly rejected or marked unapproved.'
      }, { status: 422 });
    }

    // 3. Missing approver identity or timestamp
    if (!briefJson.approved_by || !briefJson.approved_at) {
      return NextResponse.json({
        error: 'UNAPPROVED_PROOF_CONTRACT',
        details: 'ProofContract approval metadata is incomplete (missing approver or approval timestamp).'
      }, { status: 422 });
    }

    // 4. Stale-version approval check
    const approvedVersion = briefJson.approved_rubric_version || briefJson.contract_version;
    if (approvedVersion && currentRubricVersion && approvedVersion !== currentRubricVersion) {
      return NextResponse.json({
        error: 'STALE_RUBRIC_APPROVAL',
        message: `Rubric approval is stale. Approved version is ${approvedVersion}, but current role rubric version is ${currentRubricVersion}.`,
        details: {
          approved_rubric_version: approvedVersion,
          current_rubric_version: currentRubricVersion,
          required_action: 'Re-approve rubric version prior to generating evaluation packets.'
        }
      }, { status: 422 });
    }

    let contractReqs = [];
    if (Array.isArray(run?.proof_contract?.requirements) && run.proof_contract.requirements.length > 0) {
      contractReqs = run.proof_contract.requirements;
    } else if (Array.isArray(run?.requirements) && run.requirements.length > 0) {
      contractReqs = run.requirements;
    } else if (Array.isArray(run?.must_haves) && run.must_haves.length > 0) {
      contractReqs = run.must_haves;
    } else if (Array.isArray(briefJson.requirements) && briefJson.requirements.length > 0) {
      contractReqs = briefJson.requirements;
    } else if (Array.isArray(briefJson.must_haves) && briefJson.must_haves.length > 0) {
      contractReqs = briefJson.must_haves;
    }

    if (!contractReqs || contractReqs.length === 0) {
      return NextResponse.json({
        error: 'MALFORMED_PROOF_CONTRACT',
        details: 'The role ProofContract has no defined requirements.'
      }, { status: 422 });
    }

    // 4. RETRIEVE CANONICAL PERSISTED PARSED DOCUMENT CONTENT (FAIL-CLOSED)
    let candDoc = null;
    const requestedDocId = bodyJson?.document_id || null;

    if (requestedDocId) {
      const { data: explicitDoc, error: explicitErr } = await supabase
        .from('candidate_documents')
        .select('*')
        .eq('id', requestedDocId)
        .eq('org_id', orgId)
        .maybeSingle();

      if (!explicitErr && explicitDoc) {
        candDoc = explicitDoc;
      } else {
        return NextResponse.json({
          error: 'DOCUMENT_NOT_FOUND',
          details: `Evaluated document ${requestedDocId} does not exist in organization scope`
        }, { status: 404 });
      }
    } else {
      const { data: docData, error: candDocError } = await supabase
        .from('candidate_documents')
        .select('*')
        .eq('candidate_id', profile?.id || extraction.candidate_id)
        .eq('org_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!candDocError && docData) {
        candDoc = docData;
      }
    }

    // SHA-256 Normalized Text Integrity Verification
    if (candDoc) {
      if (candDoc.normalized_text) {
        const computedNormSha256 = crypto.createHash('sha256').update(candDoc.normalized_text).digest('hex');
        if (candDoc.normalized_text_sha256 && computedNormSha256 !== candDoc.normalized_text_sha256) {
          return NextResponse.json({
            error: 'EVIDENCE_INTEGRITY_FAILURE',
            details: 'Normalized text SHA-256 hash mismatch',
            candidate_id: profile?.id || extraction.candidate_id
          }, { status: 422 });
        }
      }
    }

    // 5. MULTI-SPAN EVIDENCE & SOURCE-FAITHFUL ATOMIC CLAIM EXTRACTION
    // If no document exists, produce empty evidence set for genuine unassessed evaluation.
    // candidate_documents holds uploaded/parsed documents without external code provenance verification;
    // omit trustedProvenance so missing or metadata-forged fields never promote claims to VERIFIED.
    const { evidenceRefs, claims: rawClaims, trustedProvenance } = candDoc
      ? extractMultiSpanEvidenceAndClaims(candDoc, run)
      : { evidenceRefs: [], claims: [], trustedProvenance: {} };

    // 6. CANONICAL DETERMINISTIC PROOF ENGINE EVALUATION (ZERO LLM SCORING & ZERO ARBITRARY FALLBACKS)
    // Legacy/model-produced fit_score and proof_strength are stripped out.
    // Scores and readiness are computed strictly from approved requirements and validated evidence.
    const evaluation = evaluateCandidateTrustPacket({
      hiringRun: run,
      rawCandidateData: {
        id: profile?.id || extraction.candidate_id || extraction.id,
        name: profile?.name,
      },
      rawClaims,
      allowedEvidenceRefs: evidenceRefs,
      trustedProvenance,
      actorId: user.id
    });

    // 7. ASSEMBLE DETERMINISTIC DECISION PACKET PAYLOAD WITH VERSIONING & REPRODUCIBILITY
    const activeRubricVersion = approvedVersion || run.brief_json?.approved_rubric_version || run.rubric_approved_version || '1.0.0';
    const evaluatedClaims = Array.isArray(evaluation.claims) ? evaluation.claims : rawClaims;
    const validEvidenceIds = new Set(evidenceRefs.map((e) => e.id));
    const claimEdges = Array.isArray(evaluation.claim_edges)
      ? evaluation.claim_edges.filter((edge) => edge?.claim_id && validEvidenceIds.has(edge?.evidence_id))
      : evaluatedClaims.flatMap((c) =>
          (Array.isArray(c.evidence_ref_ids) ? c.evidence_ref_ids : [])
            .filter((evId) => validEvidenceIds.has(evId))
            .map((evId) => ({ claim_id: c.id, evidence_id: evId }))
        );

    const canonicalFitScore = evaluation.fit_score == null ? null : Number(evaluation.fit_score);
    if (canonicalFitScore != null && (!Number.isFinite(canonicalFitScore) || canonicalFitScore < 0 || canonicalFitScore > 1)) {
      return NextResponse.json(
        { error: `Invalid canonical fit_score from engine (${evaluation.fit_score}); expected [0, 1] or null.` },
        { status: 500 }
      );
    }

    const evalPayload = {
      spec_version: evaluation.spec_version,
      calculation_digest: evaluation.calculation_digest,
      fit_score: canonicalFitScore,
      verified_proof_score: evaluation.verified_proof_score ?? null,
      assertion_alignment_score: evaluation.assertion_alignment_score ?? null,
      evidence_breakdown: evaluation.evidence_breakdown ?? null,
      candidate_document_id: candDoc ? candDoc.id : null,
      filename: candDoc ? candDoc.filename : null,
      file_sha256: candDoc ? candDoc.file_sha256 : null,
      parser_name: candDoc ? (candDoc.parser_name || 'pdf-parse@2.4.5') : null,
      normalized_text_sha256: candDoc ? candDoc.normalized_text_sha256 : null,
      rubric_version: activeRubricVersion,
      role_version: activeRubricVersion,
      approved_rubric_version: activeRubricVersion,
      evidence_revision: candDoc?.normalized_text_sha256 ? candDoc.normalized_text_sha256.substring(0, 12) : 'rev-1',
      evaluation_version: '1.0.0-kernel',
      evaluated_at: evaluation.evaluated_at,
      evaluation_timestamp: evaluation.evaluated_at,
      why_sourced: `Sourced based on verified criteria for ${run.role_title}.`,
      why_matched: `Candidate evaluated against role ProofContract: ${run.role_title}.`,
      strongest_evidence: evidenceRefs.map(e => `${e.filename} [span offset ${e.source_offset.start_offset}-${e.source_offset.end_offset}]`),
      extracted_capabilities: evaluatedClaims.map(c => c.claim_text),
      screen_summary: `Candidate evaluated as ${evaluation.decision_readiness} with Proof Strength ${(evaluation.proof_strength * 100).toFixed(0)}%.`,
      what_is_verified: evaluation.what_is_verified,
      what_is_inferred: evaluation.what_is_inferred,
      what_remains_uncertain: evaluation.what_remains_uncertain,
      strengths: evaluation.what_is_verified.length > 0 ? evaluation.what_is_verified : evaluatedClaims.map(c => c.claim_text).slice(0, 3),
      concerns: evaluation.missing_proof.map(m => m.unproven_requirement),
      missing_proof: evaluation.missing_proof,
      decision_blockers: evaluation.missing_proof,
      gates: evaluation.gates || {
        gatePass: evaluation.gate_pass,
        failedMustHaves: evaluation.failed_must_haves || evaluation.missing_proof.map(m => m.unproven_requirement)
      },
      claims: evaluatedClaims,
      claim_ledger: evaluatedClaims,
      evidence_refs: evidenceRefs,
      claim_edges: claimEdges,
      recommended_next_step: evaluation.gate_pass 
        ? "Schedule Technical Deep Dive Interview" 
        : "Request Minimum Missing Proof Artifacts",
      evaluation_metrics: {
        role_fit_distribution: evaluation.role_fit_distribution,
        role_fit_label: evaluation.role_fit_label,
        verified_proof_score: evaluation.verified_proof_score ?? null,
        assertion_alignment_score: evaluation.assertion_alignment_score ?? null,
        evidence_breakdown: evaluation.evidence_breakdown ?? null,
        proof_strength: evaluation.proof_strength,
        proof_strength_label: evaluation.proof_strength_label,
        proof_coverage: evaluation.proof_coverage,
        uncertainty: evaluation.uncertainty,
        entropy: evaluation.entropy,
        gate_pass: evaluation.gate_pass,
        must_have_gates_passed: evaluation.gate_pass,
        blockers_count: evaluation.missing_proof.length,
        decision_readiness: evaluation.decision_readiness
      }
    };

    // 8. PERSISTENCE: MANDATORY ATOMIC CLAIM LEDGER RPC (FAIL CLOSED ON UNAVAILABILITY)
    let supabaseService;
    try {
      supabaseService = await createSupabaseServerClient(request, true);
    } catch {
      return NextResponse.json(
        { error: 'LEDGER_PERSISTENCE_UNAVAILABLE', details: 'Service-role client unavailable' },
        { status: 503 }
      );
    }

    if (typeof supabaseService?.rpc !== 'function') {
      return NextResponse.json(
        { error: 'LEDGER_PERSISTENCE_UNAVAILABLE', details: 'Atomic ledger RPC client unavailable' },
        { status: 503 }
      );
    }

    const { data: rpcRes, error: rpcError } = await supabaseService.rpc('allocate_claim_ledger_revision_and_persist', {
      p_candidate_profile_id: profile?.id || extraction.candidate_id,
      p_hiring_run_id: run.id,
      p_org_id: orgId,
      p_evidence_refs: evidenceRefs,
      p_claims: evaluatedClaims,
      p_claim_edges: claimEdges,
      p_evaluation_output: evalPayload,
      p_candidate_id: extraction.id
    });

    if (rpcError) {
      if (rpcError.message?.includes("RPC_VALIDATION_ERROR") || rpcError.code === "P0001") {
        return NextResponse.json({
          error: "EVIDENCE_INTEGRITY_FAILURE",
          details: rpcError.message
        }, { status: 422 });
      }
      return NextResponse.json({
        error: "LEDGER_PERSISTENCE_UNAVAILABLE",
        details: rpcError.message || "Atomic claim ledger persistence failed"
      }, { status: 503 });
    }

    if (!rpcRes || rpcRes.length === 0 || !rpcRes[0]?.decision_packet) {
      return NextResponse.json({
        error: "LEDGER_PERSISTENCE_UNAVAILABLE",
        details: "Atomic claim ledger RPC returned empty result"
      }, { status: 503 });
    }

    return NextResponse.json(rpcRes[0].decision_packet);

  } catch (err) {
    console.error('Decision Generation Error:', err);
    return NextResponse.json({ error: 'Failed to generate assessment' }, { status: 500 });
  }
}
