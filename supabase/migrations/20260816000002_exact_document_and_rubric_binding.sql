-- ==============================================================================
-- Migration 20260816000002: Exact Document and Approved Rubric Binding (CTW-V2-DEMO-CORE-07)
-- 1. Binds packet persistence strictly to evaluated document identity and verified hashes
-- 2. Enforces explicit persisted rubric approval and strict version consistency
-- 3. Preserves human decision history and marks re-review required when evidence or rubric changes
-- 4. Guarantees atomic claim ledger revision allocation under concurrent transactions
-- ==============================================================================

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
    v_expected_norm_hash TEXT;
    v_expected_file_hash TEXT;
    v_fit_score DOUBLE PRECISION;
    v_doc_id_text TEXT;
    v_doc_uuid UUID;
    v_is_approved BOOLEAN;
    v_approved_version TEXT;
    v_approved_by UUID;
    v_approved_at TIMESTAMPTZ;
    v_evaluated_rubric_ver TEXT;
    v_ref_item JSONB;
    v_existing_decision JSONB;
    v_prev_rev INTEGER;
    v_prev_rubric TEXT;
    v_prev_doc_id TEXT;
BEGIN
    -- Transaction-level advisory lock on (candidate_profile, hiring_run)
    PERFORM pg_advisory_xact_lock(hashtext('claim_ledger_' || p_candidate_profile_id::text || '_' || p_hiring_run_id::text));

    -- 1. Validate Candidate Exists and Row-Lock Target Candidate Record
    SELECT c.id, c.candidate_id, c.hiring_run_id, c.fit_score, c.decision_packet 
    INTO v_cand_rec
    FROM public.candidates c
    WHERE c.id = p_candidate_id 
    FOR UPDATE;

    IF v_cand_rec.id IS NULL THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Candidate record % does not exist', p_candidate_id;
    END IF;

    -- 2. Validate Candidate Profile Identity Coupling
    IF v_cand_rec.candidate_id IS DISTINCT FROM p_candidate_profile_id THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Candidate profile identity mismatch (expected %, received %)', v_cand_rec.candidate_id, p_candidate_profile_id;
    END IF;

    -- 3. Validate Hiring Run Coupling
    IF v_cand_rec.hiring_run_id IS DISTINCT FROM p_hiring_run_id THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Candidate hiring run mismatch (expected %, received %)', v_cand_rec.hiring_run_id, p_hiring_run_id;
    END IF;

    -- 4. Validate Organization Tenant & Row-Lock Hiring Run (Serializing Rubric Approvals)
    SELECT hr.id, hr.org_id, hr.brief_json
    INTO v_run_rec
    FROM public.hiring_runs hr
    WHERE hr.id = p_hiring_run_id
    FOR UPDATE;

    IF v_run_rec.id IS NULL OR v_run_rec.org_id IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Organization tenant mismatch for hiring run % (expected %, received %)', p_hiring_run_id, v_run_rec.org_id, p_org_id;
    END IF;

    -- 5. Enforce Explicit Persisted Rubric Approval and Version Consistency (CORE-07 Req 4)
    v_is_approved := COALESCE((v_run_rec.brief_json->>'contract_approved')::boolean, false);
    IF v_is_approved IS NOT TRUE THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Rubric has not been explicitly approved for hiring run %', p_hiring_run_id;
    END IF;

    v_approved_version := COALESCE(
        v_run_rec.brief_json->>'approved_rubric_version',
        v_run_rec.brief_json->>'contract_version'
    );
    
    BEGIN
        v_approved_by := (v_run_rec.brief_json->>'approved_by')::uuid;
    EXCEPTION WHEN OTHERS THEN
        v_approved_by := NULL;
    END;

    BEGIN
        v_approved_at := (v_run_rec.brief_json->>'approved_at')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
        v_approved_at := NULL;
    END;

    IF v_approved_version IS NULL OR v_approved_by IS NULL OR v_approved_at IS NULL THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Incomplete rubric approval metadata (version, approver, or timestamp missing) on hiring run %', p_hiring_run_id;
    END IF;

    v_evaluated_rubric_ver := p_evaluation_output->>'rubric_version';
    IF v_evaluated_rubric_ver IS NULL OR v_evaluated_rubric_ver IS DISTINCT FROM v_approved_version THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Evaluated rubric version (%) does not match currently approved rubric version (%)', v_evaluated_rubric_ver, v_approved_version;
    END IF;

    -- 6. Bind Packet Writes to the EXACT Evaluated Document (CORE-07 Req 3)
    v_doc_id_text := p_evaluation_output->>'candidate_document_id';

    IF v_doc_id_text IS NOT NULL AND v_doc_id_text != '' AND v_doc_id_text != 'null' THEN
        -- Document-backed evaluation: must resolve exact document record
        BEGIN
            v_doc_uuid := v_doc_id_text::uuid;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Malformed candidate_document_id %', v_doc_id_text;
        END;

        SELECT cd.id, cd.candidate_id, cd.org_id, cd.hiring_run_id, cd.file_sha256, cd.normalized_text_sha256, cd.parser_name, cd.filename
        INTO v_doc_rec
        FROM public.candidate_documents cd
        WHERE cd.id = v_doc_uuid;

        IF v_doc_rec.id IS NULL THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Evaluated document % does not exist', v_doc_id_text;
        END IF;

        IF v_doc_rec.candidate_id IS DISTINCT FROM p_candidate_profile_id THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Evaluated document candidate mismatch (expected %, found %)', p_candidate_profile_id, v_doc_rec.candidate_id;
        END IF;

        IF v_doc_rec.org_id IS DISTINCT FROM p_org_id THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Evaluated document organization tenant mismatch (expected %, found %)', p_org_id, v_doc_rec.org_id;
        END IF;

        IF v_doc_rec.hiring_run_id IS NOT NULL AND v_doc_rec.hiring_run_id IS DISTINCT FROM p_hiring_run_id THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Evaluated document hiring run mismatch (expected %, found %)', p_hiring_run_id, v_doc_rec.hiring_run_id;
        END IF;

        -- Verify Normalized Text SHA-256 Hash Integrity
        v_expected_norm_hash := p_evaluation_output->>'normalized_text_sha256';
        IF v_expected_norm_hash IS NULL OR v_doc_rec.normalized_text_sha256 IS NULL OR v_doc_rec.normalized_text_sha256 IS DISTINCT FROM v_expected_norm_hash THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Normalized text hash mismatch (doc: %, eval: %)', v_doc_rec.normalized_text_sha256, v_expected_norm_hash;
        END IF;

        -- Verify Physical File Hash if provided
        v_expected_file_hash := p_evaluation_output->>'file_sha256';
        IF v_expected_file_hash IS NOT NULL AND (v_doc_rec.file_sha256 IS NULL OR v_doc_rec.file_sha256 IS DISTINCT FROM v_expected_file_hash) THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: File hash mismatch (doc: %, eval: %)', v_doc_rec.file_sha256, v_expected_file_hash;
        END IF;

        -- Validate Evidence References Point Exclusively to Evaluated Document
        IF p_evidence_refs IS NOT NULL AND jsonb_typeof(p_evidence_refs) = 'array' THEN
            FOR v_ref_item IN SELECT * FROM jsonb_array_elements(p_evidence_refs) LOOP
                IF (v_ref_item->>'document_id') IS DISTINCT FROM v_doc_rec.id::text THEN
                    RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Evidence reference % points to foreign document % (expected %)', v_ref_item->>'id', v_ref_item->>'document_id', v_doc_rec.id;
                END IF;
            END LOOP;
        END IF;
    ELSE
        -- Insufficient-evidence / unassessed evaluation: must NOT contain fabricated evidence spans
        IF p_evidence_refs IS NOT NULL AND jsonb_typeof(p_evidence_refs) = 'array' AND jsonb_array_length(p_evidence_refs) > 0 THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Evidence references provided without evaluated candidate document';
        END IF;
    END IF;

    -- 7. Atomically calculate next revision for (candidate_id, hiring_run_id)
    SELECT COALESCE(MAX(cl.revision), 0) + 1 INTO v_next_rev
    FROM public.claim_ledgers cl
    WHERE cl.candidate_id = p_candidate_profile_id
      AND cl.hiring_run_id = p_hiring_run_id;

    -- 8. Insert claim_ledgers row
    INSERT INTO public.claim_ledgers (
        candidate_id,
        hiring_run_id,
        org_id,
        revision,
        evidence_refs,
        claims,
        claim_edges,
        evaluation_output
    )
    VALUES (
        p_candidate_profile_id,
        p_hiring_run_id,
        p_org_id,
        v_next_rev,
        COALESCE(p_evidence_refs, '[]'::jsonb),
        COALESCE(p_claims, '[]'::jsonb),
        COALESCE(p_claim_edges, '[]'::jsonb),
        COALESCE(p_evaluation_output, '{}'::jsonb)
    )
    RETURNING id, public.claim_ledgers.created_at INTO v_ledger_id, v_created_at;

    -- Extract fit_score safely (keeps unassessed evaluations as NULL)
    IF p_evaluation_output->>'fit_score' IS NOT NULL AND p_evaluation_output->>'fit_score' != 'null' THEN
        v_fit_score := (p_evaluation_output->>'fit_score')::double precision;
    ELSE
        v_fit_score := NULL;
    END IF;

    -- 9. Construct enriched decision packet containing exact provenance
    v_packet := jsonb_build_object(
        'spec_version', COALESCE(p_evaluation_output->>'spec_version', '1.0.0-kernel'),
        'ledger_id', v_ledger_id,
        'ledger_revision', v_next_rev,
        'evaluation_version', COALESCE(p_evaluation_output->>'spec_version', '1.0.0-kernel'),
        'rubric_version', v_approved_version,
        'role_version', v_approved_version,
        'evaluation_timestamp', COALESCE(p_evaluation_output->>'evaluated_at', p_evaluation_output->>'evaluation_timestamp', to_char(v_created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
        'candidate_document_id', CASE WHEN v_doc_rec.id IS NOT NULL THEN v_doc_rec.id ELSE NULL END,
        'filename', CASE WHEN v_doc_rec.filename IS NOT NULL THEN v_doc_rec.filename ELSE NULL END,
        'file_sha256', CASE WHEN v_doc_rec.file_sha256 IS NOT NULL THEN v_doc_rec.file_sha256 ELSE NULL END,
        'normalized_text_sha256', CASE WHEN v_doc_rec.normalized_text_sha256 IS NOT NULL THEN v_doc_rec.normalized_text_sha256 ELSE NULL END,
        'parser_name', CASE WHEN v_doc_rec.parser_name IS NOT NULL THEN v_doc_rec.parser_name ELSE NULL END,
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

    -- 10. Human Decision History Preservation & Re-Review Flagging (CORE-07 Req 5)
    IF v_cand_rec.decision_packet IS NOT NULL AND v_cand_rec.decision_packet->'human_decision' IS NOT NULL THEN
        v_existing_decision := v_cand_rec.decision_packet->'human_decision';
        v_prev_rev := (v_existing_decision->>'reviewed_ledger_revision')::integer;
        v_prev_rubric := v_existing_decision->>'reviewed_rubric_version';
        v_prev_doc_id := v_existing_decision->>'reviewed_document_id';

        -- If evidence revision, rubric version, or document has changed, mark re-review required
        IF v_prev_rev IS NOT NULL AND (
            v_prev_rev < v_next_rev OR
            (v_prev_rubric IS NOT NULL AND v_prev_rubric IS DISTINCT FROM v_approved_version) OR
            (v_prev_doc_id IS NOT NULL AND (v_doc_rec.id IS NULL OR v_prev_doc_id IS DISTINCT FROM v_doc_rec.id::text))
        ) THEN
            v_existing_decision := jsonb_set(v_existing_decision, '{requires_re_review}', 'true'::jsonb);
            v_existing_decision := jsonb_set(v_existing_decision, '{re_review_reason}', to_jsonb('Packet updated to revision ' || v_next_rev::text || ' under rubric ' || v_approved_version || '. Review previous decision.'));
        END IF;

        v_packet := jsonb_set(v_packet, '{human_decision}', v_existing_decision);
    END IF;

    -- 11. Atomically update candidates table
    UPDATE public.candidates
    SET 
        fit_score = v_fit_score,
        decision_packet = v_packet
    WHERE id = p_candidate_id;

    RETURN QUERY SELECT v_ledger_id, v_next_rev, v_created_at, v_packet;
END;
$$;

-- Strict Execution Grants: Service Role ONLY
REVOKE EXECUTE ON FUNCTION public.allocate_claim_ledger_revision_and_persist(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.allocate_claim_ledger_revision_and_persist(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.allocate_claim_ledger_revision_and_persist(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_claim_ledger_revision_and_persist(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, UUID) TO service_role;
