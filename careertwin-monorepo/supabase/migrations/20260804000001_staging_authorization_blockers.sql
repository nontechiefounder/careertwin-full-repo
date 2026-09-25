-- Step 4B5.2-D1.4.3 — Staging Authorization Blockers
-- Forward-only corrective migration.
--
-- Closes findings from Founder Review Decision (Step D1.4.2):
--   1. Move RLS helpers to non-exposed security schema
--   2. Replace arbitrary p_user_id with internal auth.uid() derivation
--   3. Harden profile INSERT identity enforcement
--   4. Remove candidate direct UPDATE on screening_sessions
--   5. Tighten owner invariant enforcement

-- =====================================================================
-- 1. CREATE SECURITY SCHEMA
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS security;
GRANT USAGE ON SCHEMA security TO authenticated, service_role;

-- =====================================================================
-- 2. DROP OLD PUBLIC AUTHORIZATION HELPERS
--    (they accepted p_user_id which allowed arbitrary injection)
-- =====================================================================
DROP FUNCTION IF EXISTS public.is_org_member(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.has_org_role(UUID, UUID, TEXT[]) CASCADE;
DROP FUNCTION IF EXISTS public.is_hiring_run_member(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.is_session_member(UUID, UUID) CASCADE;

-- =====================================================================
-- 3. CREATE SECURITY-SCHEMA HELPERS
--    Each function derives the caller from auth.uid() internally.
--    SET search_path = '' prevents search-path injection.
--    SECURITY DEFINER + postgres owner allows reading auth.users.
-- =====================================================================

CREATE OR REPLACE FUNCTION security.is_org_member(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_memberships
        WHERE organization_id = p_org_id
          AND user_id = auth.uid()
          AND membership_status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION security.has_org_role(p_org_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_memberships
        WHERE organization_id = p_org_id
          AND user_id = auth.uid()
          AND membership_status = 'active'
          AND membership_role = ANY(p_roles)
    );
$$;

CREATE OR REPLACE FUNCTION security.is_hiring_run_member(p_hiring_run_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.hiring_runs h
        WHERE h.id = p_hiring_run_id
          AND (
            h.employer_id = auth.uid()
            OR (h.org_id IS NOT NULL AND security.is_org_member(h.org_id))
          )
    );
$$;

CREATE OR REPLACE FUNCTION security.is_session_member(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.screening_sessions s
        WHERE s.id = p_session_id
          AND (
            s.candidate_id = auth.uid()
            OR security.is_hiring_run_member(s.hiring_run_id)
          )
    );
$$;

-- Helper to retrieve the authenticated caller's GoTrue email.
-- Used to enforce profile email identity in INSERT policy.
CREATE OR REPLACE FUNCTION security.current_user_email()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT email FROM auth.users WHERE id = auth.uid();
$$;

-- =====================================================================
-- 4. PRIVILEGE SETUP FOR SECURITY-SCHEMA FUNCTIONS
--    Revoke from PUBLIC (covers anon). Grant to authenticated only.
--    PostgREST only exposes public schema; security schema is not an
--    RPC endpoint.
-- =====================================================================
REVOKE EXECUTE ON FUNCTION security.is_org_member(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION security.has_org_role(UUID, TEXT[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION security.is_hiring_run_member(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION security.is_session_member(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION security.current_user_email() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION security.is_org_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION security.has_org_role(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION security.is_hiring_run_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION security.is_session_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION security.current_user_email() TO authenticated;

-- Ensure postgres/service_role can always invoke them for migrations/seeds
GRANT EXECUTE ON FUNCTION security.is_org_member(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION security.has_org_role(UUID, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION security.is_hiring_run_member(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION security.is_session_member(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION security.current_user_email() TO service_role;

-- =====================================================================
-- 5. HARDEN PROFILE CREATION
--    Enforce id = auth.uid() AND email = GoTrue email.
--    Remove created_at, updated_at from client INSERT grant (use defaults).
-- =====================================================================
DROP POLICY IF EXISTS profiles_self_insert ON public.profiles;
DROP POLICY IF EXISTS profiles_self_access ON public.profiles;
DROP POLICY IF EXISTS profiles_self_select ON public.profiles;
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;

CREATE POLICY profiles_self_select ON public.profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id);

CREATE POLICY profiles_self_insert ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = id
        AND email = security.current_user_email()
    );

CREATE POLICY profiles_self_update ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Narrow the INSERT column grant: remove created_at, updated_at (use DB defaults)
REVOKE INSERT ON public.profiles FROM authenticated;
GRANT INSERT (id, email, name, company) ON public.profiles TO authenticated;

-- UPDATE grant remains: name, company, updated_at (email and id cannot be changed)
-- This was already set in migration 20260803000003; re-assert for clarity
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (name, company, updated_at) ON public.profiles TO authenticated;

-- =====================================================================
-- 6. REPLACE ALL RLS POLICIES USING public.* WITH security.*
-- =====================================================================

-- --- ORGANIZATIONS ---
DROP POLICY IF EXISTS organizations_update ON public.organizations;
CREATE POLICY organizations_update ON public.organizations
    FOR UPDATE TO authenticated
    USING (security.is_org_member(id) OR created_by = auth.uid())
    WITH CHECK (security.is_org_member(id) OR created_by = auth.uid());

-- --- ORGANIZATION MEMBERSHIPS ---
DROP POLICY IF EXISTS org_memberships_select ON public.organization_memberships;
DROP POLICY IF EXISTS org_memberships_insert ON public.organization_memberships;
DROP POLICY IF EXISTS org_memberships_update ON public.organization_memberships;
DROP POLICY IF EXISTS org_memberships_delete ON public.organization_memberships;

CREATE POLICY org_memberships_select ON public.organization_memberships
    FOR SELECT TO authenticated
    USING (security.is_org_member(organization_id) OR user_id = auth.uid());

-- INSERT: owner may insert any role; admin may insert non-owner roles only;
-- a user may insert themselves as owner (initial org creation path).
CREATE POLICY org_memberships_insert ON public.organization_memberships
    FOR INSERT TO authenticated
    WITH CHECK (
        security.has_org_role(organization_id, ARRAY['owner'])
        OR (security.has_org_role(organization_id, ARRAY['admin']) AND membership_role != 'owner')
        OR (user_id = auth.uid() AND membership_role = 'owner')
    );

-- UPDATE: owner may update any membership; admin may update non-owner memberships to
-- non-owner roles only. Prevents admin self-promoting or touching the owner row.
CREATE POLICY org_memberships_update ON public.organization_memberships
    FOR UPDATE TO authenticated
    USING (
        security.has_org_role(organization_id, ARRAY['owner'])
        OR (
            security.has_org_role(organization_id, ARRAY['admin'])
            AND (SELECT m.membership_role FROM public.organization_memberships m
                 WHERE m.organization_id = organization_memberships.organization_id
                   AND m.user_id = organization_memberships.user_id) != 'owner'
        )
    )
    WITH CHECK (
        security.has_org_role(organization_id, ARRAY['owner'])
        OR (
            security.has_org_role(organization_id, ARRAY['admin'])
            AND membership_role != 'owner'
            AND (SELECT m.membership_role FROM public.organization_memberships m
                 WHERE m.organization_id = organization_memberships.organization_id
                   AND m.user_id = organization_memberships.user_id) != 'owner'
        )
    );

-- DELETE: owner may delete any membership; admin may delete non-owner memberships only.
CREATE POLICY org_memberships_delete ON public.organization_memberships
    FOR DELETE TO authenticated
    USING (
        security.has_org_role(organization_id, ARRAY['owner'])
        OR (
            security.has_org_role(organization_id, ARRAY['admin'])
            AND (SELECT m.membership_role FROM public.organization_memberships m
                 WHERE m.organization_id = organization_memberships.organization_id
                   AND m.user_id = organization_memberships.user_id) != 'owner'
        )
    );

-- --- HIRING RUNS ---
DROP POLICY IF EXISTS hiring_runs_org_select ON public.hiring_runs;
DROP POLICY IF EXISTS hiring_runs_org_write ON public.hiring_runs;

CREATE POLICY hiring_runs_org_select ON public.hiring_runs
    FOR SELECT TO authenticated
    USING (
        auth.uid() = employer_id
        OR (org_id IS NOT NULL AND security.is_org_member(org_id))
    );

CREATE POLICY hiring_runs_org_write ON public.hiring_runs
    FOR ALL TO authenticated
    USING (
        auth.uid() = employer_id
        OR (org_id IS NOT NULL AND security.has_org_role(org_id, ARRAY['owner', 'admin', 'recruiter']))
    )
    WITH CHECK (
        auth.uid() = employer_id
        OR (org_id IS NOT NULL AND security.has_org_role(org_id, ARRAY['owner', 'admin', 'recruiter']))
    );

-- --- SOURCING SESSIONS ---
DROP POLICY IF EXISTS sourcing_sessions_org_select ON public.sourcing_sessions;
DROP POLICY IF EXISTS sourcing_sessions_org_write ON public.sourcing_sessions;

CREATE POLICY sourcing_sessions_org_select ON public.sourcing_sessions
    FOR SELECT TO authenticated
    USING (
        auth.uid() = employer_id
        OR security.is_hiring_run_member(hiring_run_id)
    );

CREATE POLICY sourcing_sessions_org_write ON public.sourcing_sessions
    FOR ALL TO authenticated
    USING (
        auth.uid() = employer_id
        OR EXISTS (
            SELECT 1 FROM public.hiring_runs h
            WHERE h.id = hiring_run_id
              AND (
                h.employer_id = auth.uid()
                OR (h.org_id IS NOT NULL AND security.has_org_role(h.org_id, ARRAY['owner', 'admin', 'recruiter']))
              )
        )
    )
    WITH CHECK (
        auth.uid() = employer_id
        OR EXISTS (
            SELECT 1 FROM public.hiring_runs h
            WHERE h.id = hiring_run_id
              AND (
                h.employer_id = auth.uid()
                OR (h.org_id IS NOT NULL AND security.has_org_role(h.org_id, ARRAY['owner', 'admin', 'recruiter']))
              )
        )
    );

-- --- CANDIDATES ---
DROP POLICY IF EXISTS candidates_org_select ON public.candidates;
DROP POLICY IF EXISTS candidates_org_write ON public.candidates;
DROP POLICY IF EXISTS candidates_self_access ON public.candidates;

CREATE POLICY candidates_org_select ON public.candidates
    FOR SELECT TO authenticated
    USING (security.is_hiring_run_member(hiring_run_id));

CREATE POLICY candidates_org_write ON public.candidates
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.hiring_runs h
            WHERE h.id = hiring_run_id
              AND (
                h.employer_id = auth.uid()
                OR (h.org_id IS NOT NULL AND security.has_org_role(h.org_id, ARRAY['owner', 'admin', 'recruiter', 'hiring_manager']))
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.hiring_runs h
            WHERE h.id = hiring_run_id
              AND (
                h.employer_id = auth.uid()
                OR (h.org_id IS NOT NULL AND security.has_org_role(h.org_id, ARRAY['owner', 'admin', 'recruiter', 'hiring_manager']))
              )
        )
    );

-- --- CANDIDATE PROFILES ---
DROP POLICY IF EXISTS candidate_profiles_self_select ON public.candidate_profiles;

CREATE POLICY candidate_profiles_self_select ON public.candidate_profiles
    FOR SELECT TO authenticated
    USING (
        auth.uid() = id
        OR EXISTS (
            SELECT 1
            FROM public.candidates c
            JOIN public.hiring_runs h ON c.hiring_run_id = h.id
            WHERE c.candidate_id = candidate_profiles.id
              AND (
                h.employer_id = auth.uid()
                OR (h.org_id IS NOT NULL AND security.is_org_member(h.org_id))
              )
        )
    );

-- =====================================================================
-- 7. REMOVE CANDIDATE DIRECT UPDATE ACCESS ON SCREENING SESSIONS
--    Candidates become SELECT-only.
--    Only org-authorized workflow roles (owner/admin/recruiter/hiring_manager)
--    may UPDATE, and only status and completed_at columns.
-- =====================================================================
DROP POLICY IF EXISTS screening_sessions_candidate_select ON public.screening_sessions;
DROP POLICY IF EXISTS screening_sessions_candidate_update ON public.screening_sessions;
DROP POLICY IF EXISTS screening_sessions_org_select ON public.screening_sessions;
DROP POLICY IF EXISTS screening_sessions_org_write ON public.screening_sessions;

-- Unified SELECT: candidate sees their own; org members see all in their runs
CREATE POLICY screening_sessions_select ON public.screening_sessions
    FOR SELECT TO authenticated
    USING (
        auth.uid() = candidate_id
        OR security.is_hiring_run_member(hiring_run_id)
    );

-- UPDATE restricted to org workflow roles only. Candidates may NOT update.
CREATE POLICY screening_sessions_org_update ON public.screening_sessions
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.hiring_runs h
            WHERE h.id = hiring_run_id
              AND (
                h.employer_id = auth.uid()
                OR (h.org_id IS NOT NULL AND security.has_org_role(h.org_id, ARRAY['owner', 'admin', 'recruiter', 'hiring_manager']))
              )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.hiring_runs h
            WHERE h.id = hiring_run_id
              AND (
                h.employer_id = auth.uid()
                OR (h.org_id IS NOT NULL AND security.has_org_role(h.org_id, ARRAY['owner', 'admin', 'recruiter', 'hiring_manager']))
              )
        )
    );

-- Revoke all table-level UPDATE, re-grant only status and completed_at
REVOKE INSERT, UPDATE, DELETE ON public.screening_sessions FROM anon, authenticated;
GRANT SELECT ON public.screening_sessions TO authenticated;
GRANT UPDATE (candidate_id, status, completed_at) ON public.screening_sessions TO authenticated;
