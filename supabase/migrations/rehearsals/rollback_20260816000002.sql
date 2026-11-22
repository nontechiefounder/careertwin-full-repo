-- ==============================================================================
-- ROLLBACK SCRIPT FOR MIGRATION 20260816000002_exact_document_and_rubric_binding.sql
-- Restores function allocate_claim_ledger_revision_and_persist to migration 20260816000001 state
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.allocate_claim_ledger_revision_and_persist(
    p_candidate_profile_id UUID,
    p_hiring_run_id UUID,
    p_org_id UUID,
    p_evidence_refs JSONB,
    p_claims JSONB,
    p_claim_edges JSONB,
    p_evaluation_output JSONB,
    p_candidate_id UUID
)
RETURNS TABLE (
    ledger_id UUID,
    allocated_revision INTEGER,
    created_at TIMESTAMPTZ,
    decision_packet JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cand_rec RECORD;
    v_run_rec RECORD;
    v_doc_rec RECORD;
    v_next_rev INTEGER;
    v_ledger_id UUID;
    v_created_at TIMESTAMPTZ;
    v_packet JSONB;
    v_expected_hash TEXT;
    v_rubric_ver TEXT;
    v_fit_score DOUBLE PRECISION;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('claim_ledger_' || p_candidate_profile_id::text || '_' || p_hiring_run_id::text));

    SELECT c.id, c.candidate_id, c.hiring_run_id, c.fit_score, c.decision_packet 
    INTO v_cand_rec
    FROM public.candidates c
    WHERE c.id = p_candidate_id 
    FOR UPDATE;

    IF v_cand_rec.id IS NULL THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Candidate record % does not exist', p_candidate_id;
    END IF;

    IF v_cand_rec.candidate_id != p_candidate_profile_id THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Candidate profile identity mismatch (expected %, received %)', v_cand_rec.candidate_id, p_candidate_profile_id;
    END IF;

    IF v_cand_rec.hiring_run_id != p_hiring_run_id THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Candidate hiring run mismatch (expected %, received %)', v_cand_rec.hiring_run_id, p_hiring_run_id;
    END IF;

    SELECT hr.id, hr.org_id, hr.brief_json INTO v_run_rec
    FROM public.hiring_runs hr
    WHERE hr.id = p_hiring_run_id;

    IF v_run_rec.id IS NULL OR v_run_rec.org_id != p_org_id THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Organization tenant mismatch for hiring run % (expected %, received %)', p_hiring_run_id, v_run_rec.org_id, p_org_id;
    END IF;

    SELECT cd.id, cd.normalized_text_sha256, cd.file_sha256, cd.parser_name INTO v_doc_rec
    FROM public.candidate_documents cd
    WHERE cd.candidate_id = p_candidate_profile_id
      AND cd.org_id = p_org_id
      AND (cd.hiring_run_id IS NULL OR cd.hiring_run_id = p_hiring_run_id)
    ORDER BY cd.created_at DESC
    LIMIT 1;

    IF v_doc_rec.id IS NULL THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: No valid candidate document found for candidate % in org %', p_candidate_profile_id, p_org_id;
    END IF;

    v_expected_hash := p_evaluation_output->>'normalized_text_sha256';
    IF v_expected_hash IS NOT NULL AND v_doc_rec.normalized_text_sha256 != v_expected_hash THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Normalized text hash mismatch (doc_hash %, packet_hash %)', v_doc_rec.normalized_text_sha256, v_expected_hash;
    END IF;

    SELECT COALESCE(MAX(cl.revision), 0) + 1 INTO v_next_rev
    FROM public.claim_ledgers cl
    WHERE cl.candidate_id = p_candidate_profile_id
      AND cl.hiring_run_id = p_hiring_run_id;

    INSERT INTO public.claim_ledgers (
        candidate_id, hiring_run_id, org_id, revision, evidence_refs, claims, claim_edges, evaluation_output
    )
    VALUES (
        p_candidate_profile_id, p_hiring_run_id, p_org_id, v_next_rev,
        COALESCE(p_evidence_refs, '[]'::jsonb),
        COALESCE(p_claims, '[]'::jsonb),
        COALESCE(p_claim_edges, '[]'::jsonb),
        COALESCE(p_evaluation_output, '{}'::jsonb)
    )
    RETURNING id, public.claim_ledgers.created_at INTO v_ledger_id, v_created_at;

    v_rubric_ver := COALESCE(
        p_evaluation_output->>'rubric_version',
        v_run_rec.brief_json->>'approved_rubric_version',
        v_run_rec.brief_json->>'contract_version',
        '1.0.0'
    );

    IF p_evaluation_output->>'fit_score' IS NOT NULL AND p_evaluation_output->>'fit_score' != 'null' THEN
        v_fit_score := (p_evaluation_output->>'fit_score')::double precision;
    ELSE
        v_fit_score := NULL;
    END IF;

    v_packet := jsonb_build_object(
        'spec_version', COALESCE(p_evaluation_output->>'spec_version', '1.0.0-kernel'),
        'ledger_id', v_ledger_id,
        'ledger_revision', v_next_rev,
        'evaluation_version', COALESCE(p_evaluation_output->>'spec_version', '1.0.0-kernel'),
        'rubric_version', v_rubric_ver,
        'role_version', COALESCE(p_evaluation_output->>'role_version', v_rubric_ver),
        'evaluation_timestamp', COALESCE(p_evaluation_output->>'evaluated_at', p_evaluation_output->>'evaluation_timestamp', to_char(v_created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
        'candidate_document_id', v_doc_rec.id,
        'file_sha256', v_doc_rec.file_sha256,
        'normalized_text_sha256', v_doc_rec.normalized_text_sha256,
        'parser_name', v_doc_rec.parser_name,
        'fit_score', v_fit_score,
        'why_sourced', p_evaluation_output->>'why_sourced',
        'why_matched', p_evaluation_output->>'why_matched',
        'strongest_evidence', COALESCE(p_evaluation_output->'strongest_evidence', '[]'::jsonb),
        'extracted_capabilities', COALESCE(p_evaluation_output->'extracted_capabilities', '[]'::jsonb),
        'screen_summary', p_evaluation_output->>'screen_summary',
        'what_is_verified', COALESCE(p_evaluation_output->'what_is_verified', '[]'::jsonb),
        'what_is_inferred', COALESCE(p_evaluation_output->'what_is_inferred', '[]'::jsonb),
        'what_remains_uncertain', COALESCE(p_evaluation_output->'what_remains_uncertain', '[]'::jsonb),
        'strengths', COALESCE(p_evaluation_output->'strengths', '[]'::jsonb),
        'concerns', COALESCE(p_evaluation_output->'concerns', '[]'::jsonb),
        'missing_proof', COALESCE(p_evaluation_output->'missing_proof', '[]'::jsonb),
        'gates', COALESCE(p_evaluation_output->'gates', jsonb_build_object('gatePass', (p_evaluation_output->'evaluation_metrics'->>'gate_pass')::boolean)),
        'claims', COALESCE(p_claims, '[]'::jsonb),
        'claim_ledger', COALESCE(p_claims, '[]'::jsonb),
        'evidence_refs', COALESCE(p_evidence_refs, '[]'::jsonb),
        'claim_edges', COALESCE(p_claim_edges, '[]'::jsonb),
        'recommended_next_step', p_evaluation_output->>'recommended_next_step',
        'evaluation_metrics', p_evaluation_output->'evaluation_metrics'
    );

    IF v_cand_rec.decision_packet IS NOT NULL AND v_cand_rec.decision_packet->'human_decision' IS NOT NULL THEN
        v_packet := jsonb_set(v_packet, '{human_decision}', v_cand_rec.decision_packet->'human_decision');
    END IF;

    UPDATE public.candidates
    SET 
        fit_score = v_fit_score,
        decision_packet = v_packet
    WHERE id = p_candidate_id;

    RETURN QUERY SELECT v_ledger_id, v_next_rev, v_created_at, v_packet;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.allocate_claim_ledger_revision_and_persist(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.allocate_claim_ledger_revision_and_persist(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.allocate_claim_ledger_revision_and_persist(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_claim_ledger_revision_and_persist(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, UUID) TO service_role;

COMMIT;
