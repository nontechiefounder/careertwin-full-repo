-- =====================================================================================
-- Forward Migration: 20260821000002_canonical_fit_score_scale.sql
-- Purpose: Establish a single canonical [0, 1] fit_score unit (or NULL when unassessed)
-- across candidates, claim_ledgers, and allocate_claim_ledger_revision_and_persist.
-- Legacy percent-100 rows (> 1) are explicitly converted here at the migration boundary.
-- =====================================================================================

-- 1. Normalize any existing legacy percent-100 values (> 1 and <= 100) to canonical [0, 1]
UPDATE public.candidates
SET fit_score = ROUND((fit_score / 100.0)::numeric, 4)::double precision
WHERE fit_score IS NOT NULL
  AND fit_score > 1
  AND fit_score <= 100;

UPDATE public.candidates
SET decision_packet = jsonb_set(
    decision_packet,
    '{fit_score}',
    to_jsonb(ROUND((((decision_packet->>'fit_score')::double precision) / 100.0)::numeric, 4)::double precision),
    true
)
WHERE decision_packet IS NOT NULL
  AND jsonb_typeof(decision_packet->'fit_score') = 'number'
  AND (decision_packet->>'fit_score')::double precision > 1
  AND (decision_packet->>'fit_score')::double precision <= 100;

UPDATE public.claim_ledgers
SET evaluation_output = jsonb_set(
    evaluation_output,
    '{fit_score}',
    to_jsonb(ROUND((((evaluation_output->>'fit_score')::double precision) / 100.0)::numeric, 4)::double precision),
    true
)
WHERE evaluation_output IS NOT NULL
  AND jsonb_typeof(evaluation_output->'fit_score') = 'number'
  AND (evaluation_output->>'fit_score')::double precision > 1
  AND (evaluation_output->>'fit_score')::double precision <= 100;

-- 2. Enforce canonical [0, 1] range constraint on public.candidates.fit_score
ALTER TABLE public.candidates DROP CONSTRAINT IF EXISTS candidates_canonical_fit_score_range;
ALTER TABLE public.candidates
    ADD CONSTRAINT candidates_canonical_fit_score_range
    CHECK (fit_score IS NULL OR (fit_score >= 0 AND fit_score <= 1));

-- 3. Update allocate_claim_ledger_revision_and_persist to reject non-[0, 1] fit_score
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
    revision INTEGER,
    created_at TIMESTAMPTZ,
    decision_packet JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_next_rev INTEGER;
    v_ledger_id UUID;
    v_created_at TIMESTAMPTZ;
    v_packet JSONB;
    v_bound_eval_output JSONB;
    v_fit_score DOUBLE PRECISION;
    v_approved_version TEXT;
    v_eval_rubric_version TEXT;
    v_eval_approved_version TEXT;
    v_run_rec RECORD;
    v_cand_rec RECORD;
    v_doc_rec RECORD;
    v_doc_id_text TEXT;
    v_doc_uuid UUID;
    v_eval_file_hash TEXT;
    v_expected_norm_hash TEXT;
    v_readiness TEXT;
    v_existing_decision JSONB;
    v_prev_rev INTEGER;
    v_prev_rubric TEXT;
    v_prev_doc_id TEXT;
    v_seen_ids JSONB;
    v_item_id TEXT;
    v_edge_item JSONB;
    v_edge_claim_id TEXT;
    v_edge_ev_id TEXT;
    v_claim_item JSONB;
    v_ref_item JSONB;
BEGIN
    -- 1. Validate Input JSONB Types
    IF p_claims IS NULL OR jsonb_typeof(p_claims) != 'array' THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: p_claims must be a valid JSONB array';
    END IF;

    IF p_evidence_refs IS NULL OR jsonb_typeof(p_evidence_refs) != 'array' THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: p_evidence_refs must be a valid JSONB array';
    END IF;

    IF p_claim_edges IS NULL OR jsonb_typeof(p_claim_edges) != 'array' THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: p_claim_edges must be a valid JSONB array';
    END IF;

    IF p_evaluation_output IS NULL OR jsonb_typeof(p_evaluation_output) != 'object' THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: p_evaluation_output must be a valid JSONB object';
    END IF;

    -- Validate Canonical [0, 1] fit_score before any persistence
    IF (p_evaluation_output->>'fit_score') IS NOT NULL AND (p_evaluation_output->>'fit_score') != 'null' THEN
        BEGIN
            v_fit_score := (p_evaluation_output->>'fit_score')::double precision;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Invalid fit_score format: %', p_evaluation_output->>'fit_score';
        END;
        IF v_fit_score IS NULL OR v_fit_score != v_fit_score OR v_fit_score < 0 OR v_fit_score > 1 THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: fit_score must be within canonical range [0, 1] (got: %)', p_evaluation_output->>'fit_score';
        END IF;
    ELSE
        v_fit_score := NULL;
    END IF;

    -- 2. Validate Duplicate IDs in p_claims
    v_seen_ids := '[]'::jsonb;
    FOR v_claim_item IN SELECT * FROM jsonb_array_elements(p_claims) LOOP
        IF jsonb_typeof(v_claim_item) != 'object' THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Malformed claim in p_claims array: %', v_claim_item;
        END IF;
        v_item_id := v_claim_item->>'id';
        IF v_item_id IS NULL OR length(trim(v_item_id)) = 0 THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Claim missing valid id: %', v_claim_item;
        END IF;
        IF v_seen_ids ? v_item_id THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Duplicate claim id % in p_claims', v_item_id;
        END IF;
        v_seen_ids := v_seen_ids || to_jsonb(v_item_id);
    END LOOP;

    -- 3. Validate Duplicate IDs in p_evidence_refs
    v_seen_ids := '[]'::jsonb;
    FOR v_ref_item IN SELECT * FROM jsonb_array_elements(p_evidence_refs) LOOP
        IF jsonb_typeof(v_ref_item) != 'object' THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Malformed evidence ref in p_evidence_refs array: %', v_ref_item;
        END IF;
        v_item_id := v_ref_item->>'id';
        IF v_item_id IS NULL OR length(trim(v_item_id)) = 0 THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: EvidenceRef missing valid id: %', v_ref_item;
        END IF;
        IF v_seen_ids ? v_item_id THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Duplicate evidence_ref id % in p_evidence_refs', v_item_id;
        END IF;
        v_seen_ids := v_seen_ids || to_jsonb(v_item_id);
    END LOOP;

    -- 4. Validate p_claim_edges: Typing & Referential Integrity
    FOR v_edge_item IN SELECT * FROM jsonb_array_elements(p_claim_edges) LOOP
        IF jsonb_typeof(v_edge_item) != 'object' THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Malformed edge in p_claim_edges array: %', v_edge_item;
        END IF;
        v_edge_claim_id := v_edge_item->>'claim_id';
        v_edge_ev_id := v_edge_item->>'evidence_id';

        IF v_edge_claim_id IS NULL OR v_edge_ev_id IS NULL THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Edge missing claim_id or evidence_id: %', v_edge_item;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_claims, '[]'::jsonb)) c WHERE (c->>'id') = v_edge_claim_id) THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Claim edge references nonexistent claim id %', v_edge_claim_id;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_evidence_refs, '[]'::jsonb)) e WHERE (e->>'id') = v_edge_ev_id) THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Claim edge references nonexistent evidence id %', v_edge_ev_id;
        END IF;
    END LOOP;

    -- 5. Lock and Validate Hiring Run and Explicit Approved Rubric Version
    SELECT hr.id, hr.org_id, hr.brief_json
    INTO v_run_rec
    FROM public.hiring_runs hr
    WHERE hr.id = p_hiring_run_id
    FOR UPDATE;

    IF v_run_rec.id IS NULL THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Hiring run % does not exist', p_hiring_run_id;
    END IF;

    IF v_run_rec.org_id IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Hiring run organization tenant mismatch (expected %, found %)', p_org_id, v_run_rec.org_id;
    END IF;

    IF COALESCE((v_run_rec.brief_json->>'contract_approved')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Rubric has not been explicitly approved for hiring run %', p_hiring_run_id;
    END IF;

    v_approved_version := (v_run_rec.brief_json->>'approved_rubric_version');
    IF v_approved_version IS NULL OR v_approved_version = '' OR v_approved_version = 'null' THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Missing explicit approved_rubric_version on hiring run % (contract_version fallback prohibited)', p_hiring_run_id;
    END IF;

    IF v_run_rec.brief_json->>'approved_by' IS NULL OR length(trim(v_run_rec.brief_json->>'approved_by')) = 0 THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Missing rubric approval metadata approved_by for hiring run %', p_hiring_run_id;
    END IF;

    IF v_run_rec.brief_json->>'approved_at' IS NULL OR length(trim(v_run_rec.brief_json->>'approved_at')) = 0 THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Missing rubric approval metadata approved_at for hiring run %', p_hiring_run_id;
    END IF;

    v_eval_rubric_version := p_evaluation_output->>'rubric_version';
    IF v_eval_rubric_version IS NULL OR v_eval_rubric_version != v_approved_version THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Evaluated rubric version (%) does not match currently approved rubric version (%)',
            COALESCE(v_eval_rubric_version, 'null'), v_approved_version;
    END IF;

    v_eval_approved_version := p_evaluation_output->>'approved_rubric_version';
    IF v_eval_approved_version IS NOT NULL AND v_eval_approved_version != v_approved_version THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Evaluated approved_rubric_version (%) does not match authoritative hiring run rubric version (%)',
            v_eval_approved_version, v_approved_version;
    END IF;

    -- 6. Lock and Validate Candidate Record
    SELECT c.id, c.hiring_run_id, c.candidate_id, c.decision_packet
    INTO v_cand_rec
    FROM public.candidates c
    WHERE c.id = p_candidate_id
    FOR UPDATE;

    IF v_cand_rec.id IS NULL THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Candidate % does not exist', p_candidate_id;
    END IF;

    IF v_cand_rec.hiring_run_id IS DISTINCT FROM p_hiring_run_id THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Candidate hiring run mismatch (expected %, found %)', p_hiring_run_id, v_cand_rec.hiring_run_id;
    END IF;

    IF v_cand_rec.candidate_id IS DISTINCT FROM p_candidate_profile_id THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Candidate profile mismatch (expected %, found %)', p_candidate_profile_id, v_cand_rec.candidate_id;
    END IF;

    -- 7. Complete Candidate Document Integrity Validation
    v_doc_id_text := p_evaluation_output->>'candidate_document_id';
    IF v_doc_id_text IS NOT NULL AND length(trim(v_doc_id_text)) > 0 AND v_doc_id_text != 'null' THEN
        BEGIN
            v_doc_uuid := v_doc_id_text::uuid;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Invalid candidate_document_id UUID format: %', v_doc_id_text;
        END;

        SELECT cd.id, cd.candidate_id, cd.org_id, cd.hiring_run_id, cd.normalized_text, cd.normalized_text_sha256, cd.file_sha256
        INTO v_doc_rec
        FROM public.candidate_documents cd
        WHERE cd.id = v_doc_uuid;

        IF v_doc_rec.id IS NULL THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Evaluated document % does not exist', v_doc_uuid;
        END IF;

        IF v_doc_rec.org_id IS DISTINCT FROM p_org_id THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Document organization tenant mismatch (expected %, found %)', p_org_id, v_doc_rec.org_id;
        END IF;

        IF v_doc_rec.hiring_run_id IS NOT NULL AND v_doc_rec.hiring_run_id IS DISTINCT FROM p_hiring_run_id THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Evaluated document hiring run mismatch (expected %, found %)', p_hiring_run_id, v_doc_rec.hiring_run_id;
        END IF;

        IF v_doc_rec.candidate_id IS DISTINCT FROM p_candidate_profile_id THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Document ownership mismatch (expected candidate %, found %)', p_candidate_profile_id, v_doc_rec.candidate_id;
        END IF;

        IF v_doc_rec.file_sha256 IS NULL OR v_doc_rec.file_sha256 !~ '^[0-9a-f]{64}$' THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Valid 64-character hex file_sha256 required on candidate_documents for document-backed evaluation';
        END IF;

        IF v_doc_rec.normalized_text_sha256 IS NULL OR v_doc_rec.normalized_text_sha256 !~ '^[0-9a-f]{64}$' THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Valid 64-character hex normalized_text_sha256 required on candidate_documents for document-backed evaluation';
        END IF;

        v_eval_file_hash := p_evaluation_output->>'file_sha256';
        IF v_eval_file_hash IS NOT NULL THEN
            IF v_eval_file_hash !~ '^[0-9a-f]{64}$' THEN
                RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Valid 64-character hex file_sha256 required for document-backed evaluation';
            END IF;
            IF v_eval_file_hash IS DISTINCT FROM v_doc_rec.file_sha256 THEN
                RAISE EXCEPTION 'RPC_VALIDATION_ERROR: File hash mismatch (doc: %, eval: %)', v_doc_rec.file_sha256, v_eval_file_hash;
            END IF;
        END IF;

        v_expected_norm_hash := p_evaluation_output->>'normalized_text_sha256';
        IF v_expected_norm_hash IS NOT NULL THEN
            IF v_expected_norm_hash !~ '^[0-9a-f]{64}$' OR v_expected_norm_hash IS DISTINCT FROM v_doc_rec.normalized_text_sha256 THEN
                RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Normalized text hash mismatch on document % (expected: %, eval: %)',
                    v_doc_uuid, v_doc_rec.normalized_text_sha256, v_expected_norm_hash;
            END IF;
        END IF;

        FOR v_ref_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_evidence_refs, '[]'::jsonb)) LOOP
            IF (v_ref_item->>'document_id') IS DISTINCT FROM v_doc_rec.id::text THEN
                RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Evidence reference % points to foreign document % (expected %)',
                    COALESCE(v_ref_item->>'id', 'unknown'), COALESCE(v_ref_item->>'document_id', 'null'), v_doc_rec.id;
            END IF;
        END LOOP;

        IF v_eval_file_hash IS NULL THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Valid 64-character hex file_sha256 required for document-backed evaluation';
        END IF;

        IF v_expected_norm_hash IS NULL THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Valid 64-character hex normalized_text_sha256 required for document-backed evaluation';
        END IF;

        IF v_doc_rec.normalized_text IS NULL OR length(trim(v_doc_rec.normalized_text)) = 0 THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Candidate document % has empty normalized_text', v_doc_uuid;
        END IF;

        IF jsonb_array_length(COALESCE(p_claims, '[]'::jsonb)) > 0 AND jsonb_array_length(COALESCE(p_evidence_refs, '[]'::jsonb)) = 0 THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Claims must be backed by evidence references for document %', v_doc_uuid;
        END IF;

        IF jsonb_array_length(COALESCE(p_claims, '[]'::jsonb)) > 0 AND jsonb_array_length(COALESCE(p_claim_edges, '[]'::jsonb)) = 0 THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Claims must be linked to evidence via p_claim_edges for document %', v_doc_uuid;
        END IF;
    ELSE
        IF jsonb_array_length(COALESCE(p_claims, '[]'::jsonb)) > 0 THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Document-free evaluation must not contain claims';
        END IF;
        IF jsonb_array_length(COALESCE(p_evidence_refs, '[]'::jsonb)) > 0 OR jsonb_array_length(COALESCE(p_claim_edges, '[]'::jsonb)) > 0 THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Document-free evaluation must not contain evidence_refs or claim_edges';
        END IF;

        IF v_fit_score IS NOT NULL THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Document-free evaluation must have fit_score = null (unassessed)';
        END IF;

        v_readiness := p_evaluation_output->'evaluation_metrics'->>'decision_readiness';
        IF v_readiness IS DISTINCT FROM 'INSUFFICIENT EVIDENCE' THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Document-free evaluation must declare decision_readiness INSUFFICIENT EVIDENCE (got: %)', v_readiness;
        END IF;
    END IF;

    -- 8. Calculate Next Sequential Revision under Advisory Lock + Row Lock for (candidate_id, hiring_run_id)
    PERFORM pg_advisory_xact_lock(hashtext(p_candidate_profile_id::text || ':' || p_hiring_run_id::text));

    SELECT COALESCE(MAX(cl.revision), 0) + 1 INTO v_next_rev
    FROM public.claim_ledgers cl
    WHERE cl.candidate_id = p_candidate_profile_id
      AND cl.hiring_run_id = p_hiring_run_id;

    -- 9. Bind Authoritative Allocated Revision & Approved Rubric Version into claim_ledgers.evaluation_output
    v_bound_eval_output := p_evaluation_output || jsonb_build_object(
        'ledger_revision', v_next_rev,
        'rubric_version', v_approved_version,
        'role_version', v_approved_version,
        'approved_rubric_version', v_approved_version
    );

    -- 10. Insert claim_ledgers Row
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
        COALESCE(v_bound_eval_output, '{}'::jsonb)
    )
    RETURNING id, public.claim_ledgers.created_at INTO v_ledger_id, v_created_at;

    -- 12. Assemble Fully Bound Decision Packet matching claim_ledgers row identically
    v_packet := v_bound_eval_output || jsonb_build_object(
        'ledger_id', v_ledger_id,
        'ledger_revision', v_next_rev,
        'claim_ledger_persisted_at', v_created_at,
        'claims', p_claims,
        'evidence_refs', p_evidence_refs,
        'claim_edges', p_claim_edges,
        'rubric_version', v_approved_version,
        'role_version', v_approved_version,
        'approved_rubric_version', v_approved_version,
        'evaluation_timestamp', COALESCE(v_bound_eval_output->>'evaluation_timestamp', v_created_at::text)
    );

    -- 13. Human Decision Audit History Preservation
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

        IF v_prev_rev IS NULL OR v_prev_rubric IS NULL OR v_prev_rubric = '' THEN
            v_existing_decision := jsonb_set(v_existing_decision, '{requires_re_review}', 'true'::jsonb, true);
            v_existing_decision := jsonb_set(v_existing_decision, '{re_review_reason}', '"Legacy human decision lacks recorded audit revision or rubric version. Fresh review required."'::jsonb, true);
        ELSIF v_prev_rev < v_next_rev OR v_prev_rubric IS DISTINCT FROM v_approved_version OR v_prev_doc_id IS DISTINCT FROM v_doc_id_text THEN
            v_existing_decision := jsonb_set(v_existing_decision, '{requires_re_review}', 'true'::jsonb, true);
            v_existing_decision := jsonb_set(v_existing_decision, '{re_review_reason}', to_jsonb('Packet updated to revision ' || v_next_rev::text || ' under rubric ' || v_approved_version || '. Review previous decision.'::text), true);
        END IF;

        v_packet := jsonb_set(v_packet, '{human_decision}', v_existing_decision, true);
    END IF;

    -- 14. Update Target Candidate Record
    UPDATE public.candidates
    SET
        decision_packet = v_packet,
        fit_score = v_fit_score
    WHERE id = p_candidate_id;

    RETURN QUERY SELECT v_ledger_id, v_next_rev, v_created_at, v_packet;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_claim_ledger_revision_and_persist(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_claim_ledger_revision_and_persist(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, UUID) TO service_role, postgres;
