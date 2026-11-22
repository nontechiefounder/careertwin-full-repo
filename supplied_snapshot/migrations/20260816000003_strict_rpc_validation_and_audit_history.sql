-- ============================================================================
-- MIGRATION: 20260816000003_strict_rpc_validation_and_audit_history.sql
-- CareerTWiN V2 Demo: CTW-V2-DEMO-CORE-08
-- Strictly Hardens allocate_claim_ledger_revision_and_persist:
-- 1. Validates required 64-character hex file_sha256 and normalized_text_sha256 for document-backed packets.
-- 2. Requires explicit approved_rubric_version without contract_version fallback.
-- 3. Consistently validates evaluated rubric version against currently approved rubric version.
-- 4. Rejects incorrectly typed p_claims, p_evidence_refs, and p_claim_edges (must be JSONB arrays with required element structures).
-- 5. Enforces no-document invariant: empty claims/evidence/edges, null fit_score, explicit INSUFFICIENT EVIDENCE.
-- 6. Preserves human decision audit history and flags legacy decisions lacking reviewed revision/version.
-- 7. Restricted execution grants to service_role and postgres owner only.
-- ============================================================================

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
RETURNS TABLE(
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
    v_claim_item JSONB;
    v_edge_item JSONB;
    v_existing_decision JSONB;
    v_prev_rev INTEGER;
    v_prev_rubric TEXT;
    v_prev_doc_id TEXT;
    v_readiness TEXT;
BEGIN
    -- Advisory lock serializes writes per (candidate_profile_id, hiring_run_id)
    PERFORM pg_advisory_xact_lock(hashtext('claim_ledger_' || p_candidate_profile_id::text || '_' || p_hiring_run_id::text));

    -- 1. Validate Target Candidate Exists and Row-Lock Record
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

    -- 4. Validate Organization Tenant & Row-Lock Hiring Run
    SELECT hr.id, hr.org_id, hr.brief_json
    INTO v_run_rec
    FROM public.hiring_runs hr
    WHERE hr.id = p_hiring_run_id
    FOR UPDATE;

    IF v_run_rec.id IS NULL OR v_run_rec.org_id IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Organization tenant mismatch for hiring run % (expected %, received %)', p_hiring_run_id, v_run_rec.org_id, p_org_id;
    END IF;

    -- 5. Enforce Explicit Persisted Rubric Approval and Version Consistency
    v_is_approved := COALESCE((v_run_rec.brief_json->>'contract_approved')::boolean, false);
    IF v_is_approved IS NOT TRUE THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Rubric has not been explicitly approved for hiring run %', p_hiring_run_id;
    END IF;

    -- Require explicit approved_rubric_version without contract_version fallback
    v_approved_version := v_run_rec.brief_json->>'approved_rubric_version';
    IF v_approved_version IS NULL OR v_approved_version = '' OR v_approved_version = 'null' THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Missing explicit approved_rubric_version on hiring run % (contract_version fallback prohibited)', p_hiring_run_id;
    END IF;
    
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

    IF v_approved_by IS NULL OR v_approved_at IS NULL THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Incomplete rubric approval metadata (approver or timestamp missing) on hiring run %', p_hiring_run_id;
    END IF;

    -- Validate evaluated rubric version against currently approved rubric version
    v_evaluated_rubric_ver := p_evaluation_output->>'rubric_version';
    IF v_evaluated_rubric_ver IS NULL OR v_evaluated_rubric_ver IS DISTINCT FROM v_approved_version THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Evaluated rubric version (%) does not match currently approved rubric version (%)', v_evaluated_rubric_ver, v_approved_version;
    END IF;

    -- 6. Strict Input Typing Validation
    IF p_claims IS NULL OR jsonb_typeof(p_claims) != 'array' THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: p_claims must be a valid JSONB array';
    END IF;

    IF p_evidence_refs IS NULL OR jsonb_typeof(p_evidence_refs) != 'array' THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: p_evidence_refs must be a valid JSONB array';
    END IF;

    IF p_claim_edges IS NULL OR jsonb_typeof(p_claim_edges) != 'array' THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: p_claim_edges must be a valid JSONB array';
    END IF;

    -- Validate individual claim element typing
    FOR v_claim_item IN SELECT * FROM jsonb_array_elements(p_claims) LOOP
        IF jsonb_typeof(v_claim_item) != 'object' OR (v_claim_item->>'id') IS NULL OR (v_claim_item->>'claim_text') IS NULL THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Malformed claim in p_claims array: %', v_claim_item;
        END IF;
    END LOOP;

    -- Validate individual evidence reference element typing
    FOR v_ref_item IN SELECT * FROM jsonb_array_elements(p_evidence_refs) LOOP
        IF jsonb_typeof(v_ref_item) != 'object' OR (v_ref_item->>'id') IS NULL OR (v_ref_item->>'document_id') IS NULL THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Malformed evidence reference in p_evidence_refs array: %', v_ref_item;
        END IF;
    END LOOP;

    -- Validate individual claim edge element typing
    FOR v_edge_item IN SELECT * FROM jsonb_array_elements(p_claim_edges) LOOP
        IF jsonb_typeof(v_edge_item) != 'object' OR (v_edge_item->>'claim_id') IS NULL OR (v_edge_item->>'evidence_id') IS NULL THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Malformed edge in p_claim_edges array: %', v_edge_item;
        END IF;
    END LOOP;

    -- 7. Document-Backed vs. No-Document Invariant Enforcement
    v_doc_id_text := p_evaluation_output->>'candidate_document_id';

    IF v_doc_id_text IS NOT NULL AND v_doc_id_text != '' AND v_doc_id_text != 'null' THEN
        -- Case A: Document-Backed Evaluation
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

        -- Validate candidate_documents has valid 64-hex hashes
        IF v_doc_rec.file_sha256 IS NULL OR v_doc_rec.file_sha256 !~ '^[a-f0-9]{64}$' THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Valid 64-character hex file_sha256 required on candidate_documents for document-backed evaluation';
        END IF;

        IF v_doc_rec.normalized_text_sha256 IS NULL OR v_doc_rec.normalized_text_sha256 !~ '^[a-f0-9]{64}$' THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Valid 64-character hex normalized_text_sha256 required on candidate_documents for document-backed evaluation';
        END IF;

        -- If file_sha256 is supplied in evaluation_output, validate 64-hex and verify equality
        v_expected_file_hash := p_evaluation_output->>'file_sha256';
        IF v_expected_file_hash IS NOT NULL THEN
            IF v_expected_file_hash !~ '^[a-f0-9]{64}$' THEN
                RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Valid 64-character hex file_sha256 required for document-backed evaluation';
            END IF;
            IF v_doc_rec.file_sha256 IS DISTINCT FROM v_expected_file_hash THEN
                RAISE EXCEPTION 'RPC_VALIDATION_ERROR: File hash mismatch (doc: %, eval: %)', v_doc_rec.file_sha256, v_expected_file_hash;
            END IF;
        END IF;

        -- Require normalized text hash and verify equality first, then 64-hex validity
        v_expected_norm_hash := p_evaluation_output->>'normalized_text_sha256';
        IF v_expected_norm_hash IS NULL OR v_doc_rec.normalized_text_sha256 IS DISTINCT FROM v_expected_norm_hash THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Normalized text hash mismatch on document % (evaluated: %, actual: %)', v_doc_rec.id, v_expected_norm_hash, v_doc_rec.normalized_text_sha256;
        END IF;

        IF v_expected_norm_hash !~ '^[a-f0-9]{64}$' THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Valid 64-character hex normalized_text_sha256 required for document-backed evaluation';
        END IF;

        -- Validate evidence references point exclusively to evaluated document
        FOR v_ref_item IN SELECT * FROM jsonb_array_elements(p_evidence_refs) LOOP
            IF (v_ref_item->>'document_id') IS DISTINCT FROM v_doc_rec.id::text THEN
                RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Evidence reference % points to foreign document % (expected %)', v_ref_item->>'id', v_ref_item->>'document_id', v_doc_rec.id;
            END IF;
        END LOOP;
    ELSE
        -- Case B: No-Document / Insufficient Evidence Invariant
        IF jsonb_array_length(p_claims) > 0 THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Document-free evaluation must not contain claims';
        END IF;

        IF jsonb_array_length(p_evidence_refs) > 0 THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Document-free evaluation must not contain evidence references';
        END IF;

        IF jsonb_array_length(p_claim_edges) > 0 THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Document-free evaluation must not contain claim edges';
        END IF;

        IF p_evaluation_output->>'fit_score' IS NOT NULL AND p_evaluation_output->>'fit_score' != 'null' THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Document-free evaluation must have null fit score';
        END IF;

        v_readiness := p_evaluation_output->'evaluation_metrics'->>'decision_readiness';
        IF v_readiness IS DISTINCT FROM 'INSUFFICIENT EVIDENCE' THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Document-free evaluation must declare decision_readiness INSUFFICIENT EVIDENCE (got: %)', v_readiness;
        END IF;
    END IF;

    -- 8. Calculate Next Sequential Revision for (candidate_id, hiring_run_id)
    SELECT COALESCE(MAX(cl.revision), 0) + 1 INTO v_next_rev
    FROM public.claim_ledgers cl
    WHERE cl.candidate_id = p_candidate_profile_id
      AND cl.hiring_run_id = p_hiring_run_id;

    -- 9. Insert claim_ledgers Row
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

    -- 10. Extract fit_score Safely
    IF p_evaluation_output->>'fit_score' IS NOT NULL AND p_evaluation_output->>'fit_score' != 'null' THEN
        v_fit_score := (p_evaluation_output->>'fit_score')::double precision;
    ELSE
        v_fit_score := NULL;
    END IF;

    -- 11. Assemble Fully Bound Decision Packet
    v_packet := p_evaluation_output || jsonb_build_object(
        'ledger_id', v_ledger_id,
        'ledger_revision', v_next_rev,
        'claim_ledger_persisted_at', v_created_at,
        'claims', p_claims,
        'evidence_refs', p_evidence_refs,
        'claim_edges', p_claim_edges,
        'rubric_version', v_approved_version,
        'role_version', v_approved_version,
        'approved_rubric_version', v_approved_version,
        'evaluation_timestamp', COALESCE(p_evaluation_output->>'evaluation_timestamp', v_created_at::text)
    );

    -- 12. Human Decision Audit History Preservation
    IF v_cand_rec.decision_packet IS NOT NULL AND (v_cand_rec.decision_packet->'human_decision') IS NOT NULL THEN
        v_existing_decision := v_cand_rec.decision_packet->'human_decision';

        v_prev_rev := NULL;
        IF (v_existing_decision->>'reviewed_ledger_revision') IS NOT NULL THEN
            BEGIN
                v_prev_rev := (v_existing_decision->>'reviewed_ledger_revision')::integer;
            EXCEPTION WHEN OTHERS THEN
                v_prev_rev := NULL;
            END;
        END IF;

        v_prev_rubric := v_existing_decision->>'reviewed_rubric_version';
        v_prev_doc_id := v_cand_rec.decision_packet->>'candidate_document_id';

        -- Flag legacy decisions lacking reviewed revision/version or any revision/rubric advance
        IF v_prev_rev IS NULL OR v_prev_rubric IS NULL OR v_prev_rubric = '' THEN
            v_existing_decision := jsonb_set(v_existing_decision, '{requires_re_review}', 'true'::jsonb, true);
            v_existing_decision := jsonb_set(v_existing_decision, '{re_review_reason}', '"Legacy human decision lacks recorded audit revision or rubric version. Fresh review required."'::jsonb, true);
        ELSIF v_prev_rev < v_next_rev OR v_prev_rubric IS DISTINCT FROM v_approved_version OR v_prev_doc_id IS DISTINCT FROM v_doc_id_text THEN
            v_existing_decision := jsonb_set(v_existing_decision, '{requires_re_review}', 'true'::jsonb, true);
            v_existing_decision := jsonb_set(v_existing_decision, '{re_review_reason}', to_jsonb('Packet updated to revision ' || v_next_rev::text || ' under rubric ' || v_approved_version || '. Review previous decision.'::text), true);
        END IF;

        v_packet := jsonb_set(v_packet, '{human_decision}', v_existing_decision, true);
    END IF;

    -- 13. Update Target Candidate Record
    UPDATE public.candidates
    SET 
        decision_packet = v_packet,
        fit_score = v_fit_score
    WHERE id = p_candidate_id;

    RETURN QUERY SELECT v_ledger_id, v_next_rev, v_created_at, v_packet;
END;
$$;

-- Restrict execution grants strictly to service_role and postgres owner
REVOKE EXECUTE ON FUNCTION public.allocate_claim_ledger_revision_and_persist(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.allocate_claim_ledger_revision_and_persist(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.allocate_claim_ledger_revision_and_persist(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_claim_ledger_revision_and_persist(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, UUID) TO service_role;
