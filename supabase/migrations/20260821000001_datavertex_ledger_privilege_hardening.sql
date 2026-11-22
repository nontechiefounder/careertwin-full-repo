-- =====================================================================================
-- Forward Migration: 20260821000001_datavertex_ledger_privilege_hardening.sql
-- Purpose: Remove excessive direct table privileges (including TRUNCATE) on
-- public.datavertex_credit_ledger, eliminate null-org RLS leak, restrict internal
-- datavertex_* ledger RPCs exclusively to service_role, and close actor impersonation
-- in public.shortlist_candidate_from_provider_transactional.
-- =====================================================================================

-- 1. Harden direct table privileges on public.datavertex_credit_ledger
REVOKE ALL ON TABLE public.datavertex_credit_ledger FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.datavertex_credit_ledger TO postgres, service_role;

-- 2. Remove org_id IS NULL leak from RLS policy (defense in depth)
DROP POLICY IF EXISTS datavertex_credit_ledger_org_read ON public.datavertex_credit_ledger;
CREATE POLICY datavertex_credit_ledger_org_read
    ON public.datavertex_credit_ledger
    FOR SELECT
    TO authenticated
    USING (
        org_id IS NOT NULL
        AND EXISTS (
            SELECT 1
            FROM public.organization_memberships m
            WHERE m.organization_id = datavertex_credit_ledger.org_id
              AND m.user_id = auth.uid()
              AND m.membership_status = 'active'
        )
    );

-- 3. Harden datavertex_get_budget_status (service_role only)
CREATE OR REPLACE FUNCTION public.datavertex_get_budget_status(
    p_org_id UUID DEFAULT NULL,
    p_hard_ceiling INTEGER DEFAULT 20
)
RETURNS TABLE (
    total_consumed INTEGER,
    settled_count INTEGER,
    reserved_count INTEGER,
    uncertain_count INTEGER,
    remaining_budget INTEGER,
    credit_ceiling INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_jwt_role TEXT;
    v_settled INTEGER;
    v_reserved INTEGER;
    v_uncertain INTEGER;
    v_total INTEGER;
BEGIN
    v_jwt_role := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), auth.role());
    IF NOT (
        v_jwt_role = 'service_role'
        OR (v_jwt_role IS NULL AND session_user IN ('postgres', 'supabase_admin'))
    ) THEN
        RAISE EXCEPTION 'RPC_FORBIDDEN: DataVertex credit ledger RPCs require service_role execution'
            USING ERRCODE = '42501';
    END IF;

    IF p_org_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ORG_ID: Organization id is required'
            USING ERRCODE = '22023';
    END IF;

    SELECT
        COALESCE(SUM(CASE WHEN status = 'settled' THEN settled_credits ELSE 0 END), 0)::INTEGER,
        COALESCE(SUM(CASE WHEN status = 'reserved' THEN reserved_credits ELSE 0 END), 0)::INTEGER,
        COALESCE(SUM(CASE WHEN status = 'uncertain' THEN reserved_credits ELSE 0 END), 0)::INTEGER
    INTO v_settled, v_reserved, v_uncertain
    FROM public.datavertex_credit_ledger
    WHERE org_id = p_org_id;

    v_total := v_settled + v_reserved + v_uncertain;

    RETURN QUERY SELECT
        v_total,
        v_settled,
        v_reserved,
        v_uncertain,
        GREATEST(0, p_hard_ceiling - v_total)::INTEGER,
        p_hard_ceiling;
END;
$$;

-- 4. Harden datavertex_reserve_credits (service_role only, strict org scoping)
CREATE OR REPLACE FUNCTION public.datavertex_reserve_credits(
    p_org_id UUID,
    p_hiring_run_id UUID,
    p_actor_id UUID,
    p_operation_type TEXT,
    p_operation_id TEXT,
    p_expected_cost INTEGER,
    p_hard_ceiling INTEGER DEFAULT 20
)
RETURNS TABLE (
    allowed BOOLEAN,
    current_consumed INTEGER,
    remaining_credits INTEGER,
    ledger_id UUID,
    error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_jwt_role TEXT;
    v_total_used INTEGER;
    v_existing_id UUID;
    v_existing_org_id UUID;
    v_existing_status TEXT;
    v_new_id UUID;
BEGIN
    v_jwt_role := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), auth.role());
    IF NOT (
        v_jwt_role = 'service_role'
        OR (v_jwt_role IS NULL AND session_user IN ('postgres', 'supabase_admin'))
    ) THEN
        RAISE EXCEPTION 'RPC_FORBIDDEN: DataVertex credit ledger RPCs require service_role execution'
            USING ERRCODE = '42501';
    END IF;

    IF p_org_id IS NULL THEN
        RETURN QUERY SELECT false, 0, 0, NULL::UUID, 'INVALID_ORG_ID: Organization id is required'::TEXT;
        RETURN;
    END IF;

    IF p_hard_ceiling IS NULL OR p_hard_ceiling <= 0 THEN
        RETURN QUERY SELECT false, 0, 0, NULL::UUID, 'INVALID_CEILING: Ceiling must be a positive integer'::TEXT;
        RETURN;
    END IF;

    IF p_expected_cost IS NULL OR p_expected_cost <= 0 THEN
        RETURN QUERY SELECT false, 0, 0, NULL::UUID, 'INVALID_COST: Expected cost must be a positive integer'::TEXT;
        RETURN;
    END IF;

    -- Idempotency check scoped to the same organization
    SELECT id, org_id, status
    INTO v_existing_id, v_existing_org_id, v_existing_status
    FROM public.datavertex_credit_ledger
    WHERE operation_id = p_operation_id
    LIMIT 1;

    IF v_existing_id IS NOT NULL AND v_existing_org_id IS DISTINCT FROM p_org_id THEN
        RAISE EXCEPTION 'RPC_FORBIDDEN: Operation id belongs to another organization'
            USING ERRCODE = '42501';
    END IF;

    IF v_existing_id IS NOT NULL AND v_existing_status IN ('reserved', 'settled') THEN
        SELECT COALESCE(SUM(
            CASE
                WHEN status = 'settled' THEN settled_credits
                WHEN status IN ('reserved', 'uncertain') THEN reserved_credits
                ELSE 0
            END
        ), 0)::INTEGER INTO v_total_used
        FROM public.datavertex_credit_ledger
        WHERE org_id = p_org_id;

        RETURN QUERY SELECT true, v_total_used, GREATEST(0, p_hard_ceiling - v_total_used)::INTEGER, v_existing_id, NULL::TEXT;
        RETURN;
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('datavertex_credit_budget_' || p_org_id::TEXT));

    SELECT COALESCE(SUM(
        CASE
            WHEN status = 'settled' THEN settled_credits
            WHEN status IN ('reserved', 'uncertain') THEN reserved_credits
            ELSE 0
        END
    ), 0)::INTEGER INTO v_total_used
    FROM public.datavertex_credit_ledger
    WHERE org_id = p_org_id;

    IF v_total_used + p_expected_cost > p_hard_ceiling THEN
        RETURN QUERY SELECT
            false,
            v_total_used,
            GREATEST(0, p_hard_ceiling - v_total_used)::INTEGER,
            NULL::UUID,
            format('CREDIT_CEILING_REACHED: Verification ceiling reached (%s/%s credits used or reserved). Sourcing halted to prevent excess spend.', v_total_used, p_hard_ceiling);
        RETURN;
    END IF;

    INSERT INTO public.datavertex_credit_ledger (
        org_id,
        hiring_run_id,
        actor_id,
        operation_type,
        operation_id,
        reserved_credits,
        status
    ) VALUES (
        p_org_id,
        p_hiring_run_id,
        p_actor_id,
        p_operation_type,
        p_operation_id,
        p_expected_cost,
        'reserved'
    ) RETURNING id INTO v_new_id;

    RETURN QUERY SELECT
        true,
        (v_total_used + p_expected_cost)::INTEGER,
        (p_hard_ceiling - (v_total_used + p_expected_cost))::INTEGER,
        v_new_id,
        NULL::TEXT;
END;
$$;

-- 5. Harden datavertex_settle_credits (service_role only)
CREATE OR REPLACE FUNCTION public.datavertex_settle_credits(
    p_operation_id TEXT,
    p_settled_credits INTEGER,
    p_metadata JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_jwt_role TEXT;
BEGIN
    v_jwt_role := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), auth.role());
    IF NOT (
        v_jwt_role = 'service_role'
        OR (v_jwt_role IS NULL AND session_user IN ('postgres', 'supabase_admin'))
    ) THEN
        RAISE EXCEPTION 'RPC_FORBIDDEN: DataVertex credit ledger RPCs require service_role execution'
            USING ERRCODE = '42501';
    END IF;

    UPDATE public.datavertex_credit_ledger
    SET status = 'settled',
        settled_credits = GREATEST(0, p_settled_credits),
        provider_response_metadata = p_metadata,
        updated_at = clock_timestamp()
    WHERE operation_id = p_operation_id;
END;
$$;

-- 6. Harden datavertex_release_credits (service_role only)
CREATE OR REPLACE FUNCTION public.datavertex_release_credits(
    p_operation_id TEXT,
    p_reason TEXT DEFAULT 'failed_released',
    p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_jwt_role TEXT;
BEGIN
    v_jwt_role := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), auth.role());
    IF NOT (
        v_jwt_role = 'service_role'
        OR (v_jwt_role IS NULL AND session_user IN ('postgres', 'supabase_admin'))
    ) THEN
        RAISE EXCEPTION 'RPC_FORBIDDEN: DataVertex credit ledger RPCs require service_role execution'
            USING ERRCODE = '42501';
    END IF;

    UPDATE public.datavertex_credit_ledger
    SET status = 'failed_released',
        settled_credits = 0,
        error_message = p_error_message,
        updated_at = clock_timestamp()
    WHERE operation_id = p_operation_id;
END;
$$;

-- 7. Harden datavertex_mark_uncertain (service_role only)
CREATE OR REPLACE FUNCTION public.datavertex_mark_uncertain(
    p_operation_id TEXT,
    p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_jwt_role TEXT;
BEGIN
    v_jwt_role := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), auth.role());
    IF NOT (
        v_jwt_role = 'service_role'
        OR (v_jwt_role IS NULL AND session_user IN ('postgres', 'supabase_admin'))
    ) THEN
        RAISE EXCEPTION 'RPC_FORBIDDEN: DataVertex credit ledger RPCs require service_role execution'
            USING ERRCODE = '42501';
    END IF;

    UPDATE public.datavertex_credit_ledger
    SET status = 'uncertain',
        settled_credits = reserved_credits,
        error_message = p_error_message,
        updated_at = clock_timestamp()
    WHERE operation_id = p_operation_id;
END;
$$;

-- 8. Harden shortlist_candidate_from_provider_transactional against actor impersonation
CREATE OR REPLACE FUNCTION public.shortlist_candidate_from_provider_transactional(
    p_actor_id UUID,
    p_hiring_run_id UUID,
    p_provider TEXT,
    p_provider_candidate_id TEXT,
    p_source_url TEXT,
    p_candidate_name TEXT,
    p_candidate_location TEXT,
    p_candidate_headline TEXT,
    p_skills TEXT[],
    p_retrieval_timestamp TIMESTAMPTZ,
    p_operation_id TEXT,
    p_decision_packet JSONB
)
RETURNS TABLE (
    candidate_id UUID,
    candidate_profile_id UUID,
    replayed BOOLEAN,
    status TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_jwt_role TEXT;
    v_caller_uid UUID;
    v_effective_actor UUID;
    v_org_id UUID;
    v_membership_role TEXT;
    v_membership_status TEXT;
    v_existing_id UUID;
    v_existing_prof_id UUID;
    v_existing_created_at TIMESTAMPTZ;
    v_new_profile_id UUID;
    v_new_candidate_id UUID;
    v_clean_name TEXT;
    v_clean_headline TEXT;
BEGIN
    v_jwt_role := COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), auth.role());
    IF v_jwt_role = 'service_role'
       OR (v_jwt_role IS NULL AND session_user IN ('postgres', 'supabase_admin')) THEN
        IF p_actor_id IS NULL THEN
            RAISE EXCEPTION 'RPC_FORBIDDEN: Actor id is required for service_role shortlisting'
                USING ERRCODE = '42501';
        END IF;
        v_effective_actor := p_actor_id;
    ELSE
        v_caller_uid := auth.uid();
        IF v_caller_uid IS NULL THEN
            RAISE EXCEPTION 'RPC_UNAUTHORIZED: Authenticated user context required'
                USING ERRCODE = '42501';
        END IF;
        IF p_actor_id IS NOT NULL AND p_actor_id IS DISTINCT FROM v_caller_uid THEN
            RAISE EXCEPTION 'RPC_FORBIDDEN: Caller % cannot impersonate actor %', v_caller_uid, p_actor_id
                USING ERRCODE = '42501';
        END IF;
        v_effective_actor := v_caller_uid;
    END IF;

    SELECT org_id INTO v_org_id
    FROM public.hiring_runs
    WHERE id = p_hiring_run_id;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'RPC_NOT_FOUND: Hiring run % does not exist', p_hiring_run_id
            USING ERRCODE = 'P0002';
    END IF;

    SELECT membership_role, membership_status INTO v_membership_role, v_membership_status
    FROM public.organization_memberships
    WHERE organization_id = v_org_id AND user_id = v_effective_actor;

    IF v_membership_status IS NULL OR v_membership_status != 'active' THEN
        RAISE EXCEPTION 'RPC_FORBIDDEN: User % is not an active member of organization %', v_effective_actor, v_org_id
            USING ERRCODE = '42501';
    END IF;

    IF v_membership_role = 'auditor' THEN
        RAISE EXCEPTION 'RPC_FORBIDDEN: Auditor accounts have read-only access and cannot mutate shortlists'
            USING ERRCODE = '42501';
    END IF;

    IF v_membership_role NOT IN ('owner', 'admin', 'recruiter', 'hiring_manager') THEN
        RAISE EXCEPTION 'RPC_FORBIDDEN: Insufficient role permissions (%) to mutate shortlist', v_membership_role
            USING ERRCODE = '42501';
    END IF;

    SELECT c.id, c.candidate_id, c.created_at
    INTO v_existing_id, v_existing_prof_id, v_existing_created_at
    FROM public.candidates c
    WHERE c.hiring_run_id = p_hiring_run_id
      AND (
        (p_provider_candidate_id IS NOT NULL AND c.decision_packet->>'provider_candidate_id' = p_provider_candidate_id)
        OR
        (p_source_url IS NOT NULL AND c.decision_packet->>'source_url' = p_source_url)
      )
    FOR UPDATE
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN QUERY SELECT
            v_existing_id,
            v_existing_prof_id,
            true AS replayed,
            'existing'::TEXT AS status,
            v_existing_created_at;
        RETURN;
    END IF;

    v_new_profile_id := gen_random_uuid();
    v_clean_name := COALESCE(NULLIF(trim(p_candidate_name), ''), 'Unnamed Sourced Candidate');
    v_clean_headline := NULLIF(trim(p_candidate_headline), '');

    INSERT INTO public.candidate_profiles (
        id,
        name,
        resume_link,
        location,
        bio,
        source
    ) VALUES (
        v_new_profile_id,
        v_clean_name,
        p_source_url,
        p_candidate_location,
        v_clean_headline,
        p_provider
    );

    INSERT INTO public.candidates (
        hiring_run_id,
        candidate_id,
        status,
        fit_score,
        decision_packet
    ) VALUES (
        p_hiring_run_id,
        v_new_profile_id,
        'sourced',
        NULL,
        p_decision_packet
    ) RETURNING public.candidates.id, public.candidates.created_at INTO v_new_candidate_id, v_existing_created_at;

    RETURN QUERY SELECT
        v_new_candidate_id,
        v_new_profile_id,
        false AS replayed,
        'sourced'::TEXT AS status,
        v_existing_created_at;
END;
$$;

-- 9. Enforce explicit function EXECUTE grants
REVOKE ALL ON FUNCTION public.datavertex_get_budget_status(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.datavertex_get_budget_status(UUID, INTEGER) TO postgres, service_role;

REVOKE ALL ON FUNCTION public.datavertex_reserve_credits(UUID, UUID, UUID, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.datavertex_reserve_credits(UUID, UUID, UUID, TEXT, TEXT, INTEGER, INTEGER) TO postgres, service_role;

REVOKE ALL ON FUNCTION public.datavertex_settle_credits(TEXT, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.datavertex_settle_credits(TEXT, INTEGER, JSONB) TO postgres, service_role;

REVOKE ALL ON FUNCTION public.datavertex_release_credits(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.datavertex_release_credits(TEXT, TEXT, TEXT) TO postgres, service_role;

REVOKE ALL ON FUNCTION public.datavertex_mark_uncertain(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.datavertex_mark_uncertain(TEXT, TEXT) TO postgres, service_role;

REVOKE ALL ON FUNCTION public.shortlist_candidate_from_provider_transactional(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TIMESTAMPTZ, TEXT, JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shortlist_candidate_from_provider_transactional(
    UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], TIMESTAMPTZ, TEXT, JSONB
) TO authenticated, postgres, service_role;
