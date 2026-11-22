-- ==============================================================================
-- MIGRATION: 20260817000001_core09_transactional_decisions_and_storage.sql
-- PURPOSE:
-- 1. Decouple candidate_profiles from auth.users (remove candidate_profiles_id_fkey).
-- 2. Provision private 'candidate_resumes' storage bucket and add storage metadata.
-- 3. Implement transactional, revision-aware human decision RPC (record_human_decision_transactional).
-- 4. Enforce complete RPC integrity contract on allocate_claim_ledger_revision_and_persist:
--    - Require file_sha256 AND normalized_text_sha256 on document evaluations (64-hex).
--    - Reject duplicate claim IDs, duplicate evidence IDs, and dangling claim edges.
--    - Enforce row-locking and strict approved_rubric_version validation.
--    - Enforce no-document invariant (empty arrays, null fit score, INSUFFICIENT EVIDENCE).
-- ==============================================================================

-- 1. PROVISION PRIVATE STORAGE BUCKET FOR ORIGINAL DOCUMENT PRESERVATION
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('candidate_resumes', 'candidate_resumes', false, 10485760, ARRAY['application/pdf']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf']::text[];

-- Add storage reference and parser metadata to candidate_documents
ALTER TABLE public.candidate_documents
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS parser_metadata jsonb DEFAULT '{}'::jsonb;

-- 2. DECOUPLE CANDIDATE PROFILES FROM AUTH ACCOUNTS (OBJECTIVE 3)
-- Ingested candidates are applicant profiles, NOT login accounts with fixed passwords.
ALTER TABLE public.candidate_profiles
  DROP CONSTRAINT IF EXISTS candidate_profiles_id_fkey;

ALTER TABLE public.candidate_profiles
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 3. TRANSACTIONAL REVISION-AWARE HUMAN DECISION RPC (OBJECTIVE 1)
DROP FUNCTION IF EXISTS public.record_human_decision_transactional(UUID, UUID, TEXT, UUID, TEXT, TEXT, INTEGER, TEXT);
CREATE OR REPLACE FUNCTION public.record_human_decision_transactional(
  p_candidate_id uuid,
  p_actor_id uuid,
  p_actor_email text,
  p_org_id uuid,
  p_action text,
  p_rationale text,
  p_expected_ledger_revision integer,
  p_expected_rubric_version text
)
RETURNS TABLE (
  candidate_id uuid,
  status text,
  decision_packet jsonb,
  activity_event_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cand_rec RECORD;
  v_run_rec RECORD;
  v_mem_role text;
  v_db_status text;
  v_current_rev integer;
  v_current_rubric text;
  v_current_doc_id text;
  v_existing_decision jsonb;
  v_existing_history jsonb;
  v_new_event jsonb;
  v_updated_decision jsonb;
  v_updated_packet jsonb;
  v_event_id uuid;
  v_now timestamptz := clock_timestamp();
BEGIN
  -- 1. Validate Input Action & Non-Empty Rationale
  IF p_action IS NULL OR p_action NOT IN ('advance', 'hold', 'reject') THEN
    RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Invalid action %. Must be advance, hold, or reject', p_action;
  END IF;

  IF p_rationale IS NULL OR length(trim(p_rationale)) = 0 THEN
    RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Non-empty decision rationale is required';
  END IF;

  IF p_expected_ledger_revision IS NULL OR p_expected_ledger_revision <= 0 THEN
    RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Missing or invalid expected_ledger_revision. Must be a positive integer.';
  END IF;

  IF p_expected_rubric_version IS NULL OR length(trim(p_expected_rubric_version)) = 0 THEN
    RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Missing or invalid expected_rubric_version. Must be a non-empty string.';
  END IF;

  v_db_status := CASE p_action
    WHEN 'advance' THEN 'shortlisted'
    WHEN 'hold' THEN 'hold'
    WHEN 'reject' THEN 'rejected'
  END;

  -- 2. Verify Authorized Actor and Organization Membership
  SELECT om.membership_role INTO v_mem_role
  FROM public.organization_memberships om
  WHERE om.user_id = p_actor_id
    AND om.organization_id = p_org_id
    AND om.membership_status = 'active';

  IF v_mem_role IS NULL OR v_mem_role NOT IN ('owner', 'admin', 'recruiter', 'hiring_manager') THEN
    RAISE EXCEPTION 'RPC_AUTHORIZATION_ERROR: Actor % lacks active reviewer membership in organization %', p_actor_id, p_org_id;
  END IF;

  -- 3. Row-level Lock on Candidate Record
  SELECT c.id, c.hiring_run_id, c.candidate_id AS profile_id, c.status, c.decision_packet
  INTO v_cand_rec
  FROM public.candidates c
  WHERE c.id = p_candidate_id
  FOR UPDATE;

  IF v_cand_rec.id IS NULL THEN
    RAISE EXCEPTION 'RPC_NOT_FOUND: Candidate % does not exist', p_candidate_id;
  END IF;

  -- 4. Verify Candidate belongs to Hiring Run in p_org_id
  SELECT hr.id, hr.org_id, hr.employer_id, hr.role_title, hr.brief_json
  INTO v_run_rec
  FROM public.hiring_runs hr
  WHERE hr.id = v_cand_rec.hiring_run_id;

  IF v_run_rec.id IS NULL OR v_run_rec.org_id IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'RPC_AUTHORIZATION_ERROR: Candidate % does not belong to organization %', p_candidate_id, p_org_id;
  END IF;

  -- 5. Revision & Rubric Optimistic Concurrency Check (Fail-closed on missing packet metadata)
  IF v_cand_rec.decision_packet IS NULL THEN
    RAISE EXCEPTION 'REVIEW_REVISION_CONFLICT: Candidate decision packet is missing';
  END IF;

  v_current_rev := NULL;
  IF (v_cand_rec.decision_packet->>'ledger_revision') IS NOT NULL THEN
    BEGIN
      v_current_rev := (v_cand_rec.decision_packet->>'ledger_revision')::integer;
    EXCEPTION WHEN OTHERS THEN
      v_current_rev := NULL;
    END;
  END IF;

  IF v_current_rev IS NULL THEN
    RAISE EXCEPTION 'REVIEW_REVISION_CONFLICT: Candidate packet lacks valid ledger_revision';
  END IF;

  v_current_rubric := v_cand_rec.decision_packet->>'rubric_version';
  IF v_current_rubric IS NULL OR length(trim(v_current_rubric)) = 0 THEN
    RAISE EXCEPTION 'REVIEW_REVISION_CONFLICT: Candidate packet lacks valid rubric_version';
  END IF;

  v_current_doc_id := v_cand_rec.decision_packet->>'candidate_document_id';

  IF v_current_rev != p_expected_ledger_revision THEN
    RAISE EXCEPTION 'REVIEW_REVISION_CONFLICT: Expected ledger revision % does not match current packet revision %',
      p_expected_ledger_revision, v_current_rev;
  END IF;

  IF v_current_rubric != p_expected_rubric_version THEN
    RAISE EXCEPTION 'REVIEW_REVISION_CONFLICT: Expected rubric version % does not match current packet rubric %',
      p_expected_rubric_version, v_current_rubric;
  END IF;

  -- 6. Extract Existing Decision History & Append New Event
  v_existing_decision := COALESCE(v_cand_rec.decision_packet->'human_decision', '{}'::jsonb);

  IF jsonb_typeof(v_existing_decision->'decision_history') = 'array' THEN
    v_existing_history := v_existing_decision->'decision_history';
  ELSIF v_existing_decision->>'action' IS NOT NULL THEN
    v_existing_history := jsonb_build_array(v_existing_decision - 'decision_history');
  ELSE
    v_existing_history := '[]'::jsonb;
  END IF;

  v_new_event := jsonb_build_object(
    'action', p_action,
    'status', v_db_status,
    'rationale', p_rationale,
    'actor_id', p_actor_id,
    'actor_email', COALESCE(p_actor_email, 'reviewer'),
    'timestamp', v_now::text,
    'recorded_at', v_now::text,
    'reviewed_ledger_revision', v_current_rev,
    'reviewed_rubric_version', v_current_rubric,
    'reviewed_document_id', v_current_doc_id,
    'requires_re_review', false
  );

  v_updated_decision := v_new_event || jsonb_build_object(
    'decision_history', v_existing_history || jsonb_build_array(v_new_event)
  );

  -- 7. Update Candidate Record (Only status and human_decision in packet)
  v_updated_packet := jsonb_set(
    COALESCE(v_cand_rec.decision_packet, '{}'::jsonb),
    '{human_decision}',
    v_updated_decision,
    true
  );

  UPDATE public.candidates
  SET
    status = v_db_status,
    decision_packet = v_updated_packet
  WHERE id = p_candidate_id;

  -- 8. Record Activity Event in Same Transaction (Atomic Audit Trail)
  INSERT INTO public.activity_events (
    event_type,
    title,
    description,
    timestamp
  )
  VALUES (
    v_db_status,
    'Human Action: ' || upper(p_action),
    'Candidate ' || p_candidate_id::text || ' updated to ' || v_db_status || ' by ' || p_actor_id::text || ' (' || COALESCE(p_actor_email, 'reviewer') || '). Rationale: ' || p_rationale || '. Revision: ' || COALESCE(v_current_rev::text, '1') || '.',
    v_now
  )
  RETURNING id INTO v_event_id;

  RETURN QUERY SELECT p_candidate_id, v_db_status, v_updated_packet, v_event_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_human_decision_transactional(UUID, UUID, TEXT, UUID, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_human_decision_transactional(UUID, UUID, TEXT, UUID, TEXT, TEXT, INTEGER, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_human_decision_transactional(UUID, UUID, TEXT, UUID, TEXT, TEXT, INTEGER, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_human_decision_transactional(UUID, UUID, TEXT, UUID, TEXT, TEXT, INTEGER, TEXT) TO service_role;


-- 4. ENFORCE COMPLETE RPC INTEGRITY CONTRACT (OBJECTIVE 4)
DROP FUNCTION IF EXISTS public.allocate_claim_ledger_revision_and_persist(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, UUID);
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

    -- Require explicit rubric approval (contract_approved = true)
    IF COALESCE((v_run_rec.brief_json->>'contract_approved')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Rubric has not been explicitly approved for hiring run %', p_hiring_run_id;
    END IF;

    -- Require explicit approved_rubric_version (contract_version fallback prohibited)
    v_approved_version := (v_run_rec.brief_json->>'approved_rubric_version');

    IF v_approved_version IS NULL OR v_approved_version = '' OR v_approved_version = 'null' THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Missing explicit approved_rubric_version on hiring run % (contract_version fallback prohibited)', p_hiring_run_id;
    END IF;

    -- Require explicit approval metadata: approved_by and approved_at
    IF v_run_rec.brief_json->>'approved_by' IS NULL OR length(trim(v_run_rec.brief_json->>'approved_by')) = 0 THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Missing rubric approval metadata approved_by for hiring run %', p_hiring_run_id;
    END IF;

    IF v_run_rec.brief_json->>'approved_at' IS NULL OR length(trim(v_run_rec.brief_json->>'approved_at')) = 0 THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Missing rubric approval metadata approved_at for hiring run %', p_hiring_run_id;
    END IF;

    -- Validate evaluated rubric version strictly matches authoritative approved rubric version
    v_eval_rubric_version := p_evaluation_output->>'rubric_version';
    IF v_eval_rubric_version IS NULL OR v_eval_rubric_version != v_approved_version THEN
        RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Evaluated rubric version (%) does not match currently approved rubric version (%)',
            COALESCE(v_eval_rubric_version, 'null'), v_approved_version;
    END IF;

    -- Validate evaluated approved_rubric_version matches authoritative approved rubric version
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

        -- If file_sha256 is supplied, validate 64-hex and verify equality immediately
        v_eval_file_hash := p_evaluation_output->>'file_sha256';
        IF v_eval_file_hash IS NOT NULL THEN
            IF v_eval_file_hash !~ '^[a-f0-9]{64}$' THEN
                RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Valid 64-character hex file_sha256 required for document-backed evaluation';
            END IF;
            IF v_doc_rec.file_sha256 IS DISTINCT FROM v_eval_file_hash THEN
                RAISE EXCEPTION 'RPC_VALIDATION_ERROR: File hash mismatch (doc: %, eval: %)', v_doc_rec.file_sha256, v_eval_file_hash;
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

        -- Require explicit file_sha256 in document-backed evaluations
        IF v_eval_file_hash IS NULL THEN
            RAISE EXCEPTION 'RPC_VALIDATION_ERROR: Valid 64-character hex file_sha256 required for document-backed evaluation';
        END IF;
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

REVOKE EXECUTE ON FUNCTION public.allocate_claim_ledger_revision_and_persist(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.allocate_claim_ledger_revision_and_persist(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.allocate_claim_ledger_revision_and_persist(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_claim_ledger_revision_and_persist(UUID, UUID, UUID, JSONB, JSONB, JSONB, JSONB, UUID) TO service_role;
