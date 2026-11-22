-- ==============================================================================
-- Migration 009: DataVertex Transactional Shortlist & Durable Credit Ledger
-- ==============================================================================

-- 1. Create datavertex_credit_ledger table for durable operation and budget accounting
CREATE TABLE IF NOT EXISTS public.datavertex_credit_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID,
    hiring_run_id UUID,
    actor_id UUID,
    operation_type TEXT NOT NULL, -- 'search', 'jd_search', 'lookup'
    operation_id TEXT UNIQUE NOT NULL, -- Idempotency key for request
    reserved_credits INTEGER NOT NULL,
    settled_credits INTEGER DEFAULT NULL,
    status TEXT NOT NULL, -- 'reserved', 'settled', 'uncertain', 'failed_released'
    provider_response_metadata JSONB DEFAULT NULL,
    error_message TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_dv_credit_ledger_org_status ON public.datavertex_credit_ledger(org_id, status);
CREATE INDEX IF NOT EXISTS idx_dv_credit_ledger_op_id ON public.datavertex_credit_ledger(operation_id);

-- 2. Concurrency-safe deduplication partial unique indexes on candidates (conditional on candidates table existing)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'candidates') THEN
        EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_candidates_run_provider_cand_id
                 ON public.candidates (hiring_run_id, (decision_packet->>''provider_candidate_id''))
                 WHERE (decision_packet->>''provider_candidate_id'') IS NOT NULL;';

        EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_candidates_run_source_url
                 ON public.candidates (hiring_run_id, (decision_packet->>''source_url''))
                 WHERE (decision_packet->>''source_url'') IS NOT NULL;';
    END IF;
END $$;

-- 3. Atomic credit reservation function
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
    v_total_used INTEGER;
    v_existing_id UUID;
    v_existing_status TEXT;
    v_new_id UUID;
BEGIN
    IF p_hard_ceiling IS NULL OR p_hard_ceiling <= 0 THEN
        RETURN QUERY SELECT false, 0, 0, NULL::UUID, 'INVALID_CEILING: Ceiling must be a positive integer'::TEXT;
        RETURN;
    END IF;

    IF p_expected_cost IS NULL OR p_expected_cost <= 0 THEN
        RETURN QUERY SELECT false, 0, 0, NULL::UUID, 'INVALID_COST: Expected cost must be a positive integer'::TEXT;
        RETURN;
    END IF;

    -- Check if this operation_id was already reserved/settled (idempotency check)
    SELECT id, status
    INTO v_existing_id, v_existing_status
    FROM public.datavertex_credit_ledger
    WHERE operation_id = p_operation_id
    LIMIT 1;

    IF v_existing_id IS NOT NULL AND v_existing_status IN ('reserved', 'settled') THEN
        SELECT COALESCE(SUM(
            CASE 
                WHEN status = 'settled' THEN settled_credits 
                WHEN status IN ('reserved', 'uncertain') THEN reserved_credits 
                ELSE 0 
            END
        ), 0)::INTEGER INTO v_total_used
        FROM public.datavertex_credit_ledger
        WHERE (p_org_id IS NULL OR org_id = p_org_id);

        RETURN QUERY SELECT true, v_total_used, GREATEST(0, p_hard_ceiling - v_total_used)::INTEGER, v_existing_id, NULL::TEXT;
        RETURN;
    END IF;

    -- Lock rows to prevent race conditions during concurrent reservations
    PERFORM pg_advisory_xact_lock(hashtext('datavertex_credit_budget_' || COALESCE(p_org_id::TEXT, 'global')));

    -- Calculate total consumed (settled + reserved + uncertain)
    SELECT COALESCE(SUM(
        CASE 
            WHEN status = 'settled' THEN settled_credits 
            WHEN status IN ('reserved', 'uncertain') THEN reserved_credits 
            ELSE 0 
        END
    ), 0)::INTEGER INTO v_total_used
    FROM public.datavertex_credit_ledger
    WHERE (p_org_id IS NULL OR org_id = p_org_id);

    IF v_total_used + p_expected_cost > p_hard_ceiling THEN
        RETURN QUERY SELECT
            false,
            v_total_used,
            GREATEST(0, p_hard_ceiling - v_total_used)::INTEGER,
            NULL::UUID,
            format('CREDIT_CEILING_REACHED: Verification ceiling reached (%s/%s credits used or reserved). Sourcing halted to prevent excess spend.', v_total_used, p_hard_ceiling);
        RETURN;
    END IF;

    -- Insert reservation
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

-- 4. Settle credits upon confirmed provider response
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
BEGIN
    UPDATE public.datavertex_credit_ledger
    SET status = 'settled',
        settled_credits = GREATEST(0, p_settled_credits),
        provider_response_metadata = p_metadata,
        updated_at = clock_timestamp()
    WHERE operation_id = p_operation_id;
END;
$$;

-- 5. Release credits on confirmed failure
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
BEGIN
    UPDATE public.datavertex_credit_ledger
    SET status = 'failed_released',
        settled_credits = 0,
        error_message = p_error_message,
        updated_at = clock_timestamp()
    WHERE operation_id = p_operation_id;
END;
$$;

-- 6. Mark uncertain outcome conservatively
CREATE OR REPLACE FUNCTION public.datavertex_mark_uncertain(
    p_operation_id TEXT,
    p_error_message TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE public.datavertex_credit_ledger
    SET status = 'uncertain',
        settled_credits = reserved_credits,
        error_message = p_error_message,
        updated_at = clock_timestamp()
    WHERE operation_id = p_operation_id;
END;
$$;

-- 7. Query budget status
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
    v_settled INTEGER;
    v_reserved INTEGER;
    v_uncertain INTEGER;
    v_total INTEGER;
BEGIN
    SELECT 
        COALESCE(SUM(CASE WHEN status = 'settled' THEN settled_credits ELSE 0 END), 0)::INTEGER,
        COALESCE(SUM(CASE WHEN status = 'reserved' THEN reserved_credits ELSE 0 END), 0)::INTEGER,
        COALESCE(SUM(CASE WHEN status = 'uncertain' THEN reserved_credits ELSE 0 END), 0)::INTEGER
    INTO v_settled, v_reserved, v_uncertain
    FROM public.datavertex_credit_ledger
    WHERE (p_org_id IS NULL OR org_id = p_org_id);

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

-- 8. Scoped transactional candidate shortlisting RPC (conditional on hiring_runs existing)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'hiring_runs') THEN
        EXECUTE $fn$
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
        AS $body$
        DECLARE
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
            SELECT org_id INTO v_org_id
            FROM public.hiring_runs
            WHERE id = p_hiring_run_id;

            IF v_org_id IS NULL THEN
                RAISE EXCEPTION 'RPC_NOT_FOUND: Hiring run % does not exist', p_hiring_run_id
                    USING ERRCODE = 'P0002';
            END IF;

            SELECT membership_role, membership_status INTO v_membership_role, v_membership_status
            FROM public.organization_memberships
            WHERE organization_id = v_org_id AND user_id = p_actor_id;

            IF v_membership_status IS NULL OR v_membership_status != 'active' THEN
                RAISE EXCEPTION 'RPC_FORBIDDEN: User % is not an active member of organization %', p_actor_id, v_org_id
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
            ) RETURNING id, created_at INTO v_new_candidate_id, v_existing_created_at;

            RETURN QUERY SELECT
                v_new_candidate_id,
                v_new_profile_id,
                false AS replayed,
                'sourced'::TEXT AS status,
                v_existing_created_at;
        END;
        $body$;
        $fn$;
    END IF;
END $$;

-- 9. RLS & Grants (conditional on roles existing)
DO $$
BEGIN
    ALTER TABLE public.datavertex_credit_ledger ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS datavertex_credit_ledger_org_read ON public.datavertex_credit_ledger;
    
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE POLICY datavertex_credit_ledger_org_read ON public.datavertex_credit_ledger
        FOR SELECT TO authenticated
        USING (true);

        GRANT EXECUTE ON FUNCTION public.datavertex_reserve_credits TO authenticated;
        GRANT EXECUTE ON FUNCTION public.datavertex_settle_credits TO authenticated;
        GRANT EXECUTE ON FUNCTION public.datavertex_release_credits TO authenticated;
        GRANT EXECUTE ON FUNCTION public.datavertex_mark_uncertain TO authenticated;
        GRANT EXECUTE ON FUNCTION public.datavertex_get_budget_status TO authenticated;
        IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'shortlist_candidate_from_provider_transactional') THEN
            GRANT EXECUTE ON FUNCTION public.shortlist_candidate_from_provider_transactional TO authenticated;
        END IF;
    END IF;
END $$;
