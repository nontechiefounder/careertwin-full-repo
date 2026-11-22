-- Target Staging Operational Migration Step 4B5.2-D1.4.1
-- Organization Authorization Completion, Role Matrix & Privilege Hardening

-- 1. ENFORCE CHECK CONSTRAINTS ON ORGANIZATION MEMBERSHIPS
ALTER TABLE organization_memberships 
    DROP CONSTRAINT IF EXISTS organization_memberships_membership_role_check,
    DROP CONSTRAINT IF EXISTS organization_memberships_membership_status_check;

ALTER TABLE organization_memberships 
    ADD CONSTRAINT organization_memberships_membership_role_check 
    CHECK (membership_role IN ('owner', 'admin', 'recruiter', 'hiring_manager', 'auditor'));

ALTER TABLE organization_memberships 
    ADD CONSTRAINT organization_memberships_membership_status_check 
    CHECK (membership_status IN ('active', 'invited', 'suspended', 'removed'));

-- 2. RE-DEFINE SECURITY DEFINER AUTHORIZATION HELPERS WITH SAFE SEARCH PATH & ACTIVE MEMBERSHIP REQUIREMENT
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.organization_memberships 
        WHERE organization_id = p_org_id 
          AND user_id = p_user_id 
          AND membership_status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(p_org_id UUID, p_user_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.organization_memberships 
        WHERE organization_id = p_org_id 
          AND user_id = p_user_id 
          AND membership_status = 'active'
          AND membership_role = ANY(p_roles)
    );
$$;

CREATE OR REPLACE FUNCTION public.is_hiring_run_member(p_hiring_run_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.hiring_runs h
        WHERE h.id = p_hiring_run_id 
          AND (
            h.employer_id = p_user_id 
            OR (h.org_id IS NOT NULL AND public.is_org_member(h.org_id, p_user_id))
          )
    );
$$;

CREATE OR REPLACE FUNCTION public.is_session_member(p_session_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.screening_sessions s
        WHERE s.id = p_session_id 
          AND (
            s.candidate_id = p_user_id 
            OR public.is_hiring_run_member(s.hiring_run_id, p_user_id)
          )
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_org_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(UUID, UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_hiring_run_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_session_member(UUID, UUID) TO authenticated;

-- 3. HARDEN PROFILES (COLUMN PRIVILEGES & SELF-ESCALATION PREVENTION)
REVOKE INSERT, UPDATE ON public.profiles FROM anon, authenticated;
GRANT INSERT (id, email, name, company, created_at, updated_at) ON public.profiles TO authenticated;
GRANT UPDATE (name, company, updated_at) ON public.profiles TO authenticated;

-- 4. HARDEN CANDIDATE PROFILES (REPLACE ALL ACCESS WITH SPECIFIC POLICIES & DENY DELETE)
DROP POLICY IF EXISTS candidate_profiles_self_access ON public.candidate_profiles;
DROP POLICY IF EXISTS candidate_profiles_self_select ON public.candidate_profiles;
DROP POLICY IF EXISTS candidate_profiles_self_insert ON public.candidate_profiles;
DROP POLICY IF EXISTS candidate_profiles_self_update ON public.candidate_profiles;

CREATE POLICY candidate_profiles_self_select ON public.candidate_profiles 
    FOR SELECT TO authenticated 
    USING (
        auth.uid() = id 
        OR EXISTS (
            SELECT 1 
            FROM public.candidates c 
            JOIN public.hiring_runs h ON c.hiring_run_id = h.id 
            WHERE c.candidate_id = candidate_profiles.id 
              AND (h.employer_id = auth.uid() OR (h.org_id IS NOT NULL AND public.is_org_member(h.org_id, auth.uid())))
        )
    );

CREATE POLICY candidate_profiles_self_insert ON public.candidate_profiles 
    FOR INSERT TO authenticated 
    WITH CHECK (auth.uid() = id);

CREATE POLICY candidate_profiles_self_update ON public.candidate_profiles 
    FOR UPDATE TO authenticated 
    USING (auth.uid() = id) 
    WITH CHECK (auth.uid() = id);

REVOKE DELETE ON public.candidate_profiles FROM anon, authenticated;

-- 5. HARDEN HIRING RUNS (ROLE MATRIX: OWNER/ADMIN/RECRUITER WRITE; AUDITOR/HIRING_MANAGER READ-ONLY)
DROP POLICY IF EXISTS hiring_runs_org_owner ON public.hiring_runs;
DROP POLICY IF EXISTS hiring_runs_org_select ON public.hiring_runs;
DROP POLICY IF EXISTS hiring_runs_org_write ON public.hiring_runs;

CREATE POLICY hiring_runs_org_select ON public.hiring_runs 
    FOR SELECT TO authenticated 
    USING (
        auth.uid() = employer_id 
        OR (org_id IS NOT NULL AND public.is_org_member(org_id, auth.uid()))
    );

CREATE POLICY hiring_runs_org_write ON public.hiring_runs 
    FOR ALL TO authenticated 
    USING (
        auth.uid() = employer_id 
        OR (org_id IS NOT NULL AND public.has_org_role(org_id, auth.uid(), ARRAY['owner', 'admin', 'recruiter']))
    )
    WITH CHECK (
        auth.uid() = employer_id 
        OR (org_id IS NOT NULL AND public.has_org_role(org_id, auth.uid(), ARRAY['owner', 'admin', 'recruiter']))
    );

-- 6. HARDEN SOURCING SESSIONS (ROLE MATRIX)
DROP POLICY IF EXISTS sourcing_sessions_org_owner ON public.sourcing_sessions;
DROP POLICY IF EXISTS sourcing_sessions_org_select ON public.sourcing_sessions;
DROP POLICY IF EXISTS sourcing_sessions_org_write ON public.sourcing_sessions;

CREATE POLICY sourcing_sessions_org_select ON public.sourcing_sessions 
    FOR SELECT TO authenticated 
    USING (
        auth.uid() = employer_id 
        OR public.is_hiring_run_member(hiring_run_id, auth.uid())
    );

CREATE POLICY sourcing_sessions_org_write ON public.sourcing_sessions 
    FOR ALL TO authenticated 
    USING (
        auth.uid() = employer_id 
        OR (
            EXISTS (
                SELECT 1 FROM public.hiring_runs h 
                WHERE h.id = hiring_run_id 
                  AND (h.employer_id = auth.uid() OR (h.org_id IS NOT NULL AND public.has_org_role(h.org_id, auth.uid(), ARRAY['owner', 'admin', 'recruiter'])))
            )
        )
    )
    WITH CHECK (
        auth.uid() = employer_id 
        OR (
            EXISTS (
                SELECT 1 FROM public.hiring_runs h 
                WHERE h.id = hiring_run_id 
                  AND (h.employer_id = auth.uid() OR (h.org_id IS NOT NULL AND public.has_org_role(h.org_id, auth.uid(), ARRAY['owner', 'admin', 'recruiter'])))
            )
        )
    );

-- 7. HARDEN CANDIDATES (ROLE MATRIX: HIRING_MANAGER PERMITTED TO READ AND WRITE DECISIONS)
DROP POLICY IF EXISTS candidates_org_owner ON public.candidates;
DROP POLICY IF EXISTS candidates_org_select ON public.candidates;
DROP POLICY IF EXISTS candidates_org_write ON public.candidates;

CREATE POLICY candidates_org_select ON public.candidates 
    FOR SELECT TO authenticated 
    USING (public.is_hiring_run_member(hiring_run_id, auth.uid()));

CREATE POLICY candidates_org_write ON public.candidates 
    FOR ALL TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.hiring_runs h 
            WHERE h.id = hiring_run_id 
              AND (h.employer_id = auth.uid() OR (h.org_id IS NOT NULL AND public.has_org_role(h.org_id, auth.uid(), ARRAY['owner', 'admin', 'recruiter', 'hiring_manager'])))
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.hiring_runs h 
            WHERE h.id = hiring_run_id 
              AND (h.employer_id = auth.uid() OR (h.org_id IS NOT NULL AND public.has_org_role(h.org_id, auth.uid(), ARRAY['owner', 'admin', 'recruiter', 'hiring_manager'])))
        )
    );

-- 8. HARDEN SCREENING SESSIONS (RESTRICT CANDIDATE UPDATES & AUDITOR WRITE DENIAL)
DROP POLICY IF EXISTS screening_sessions_org_update ON public.screening_sessions;
DROP POLICY IF EXISTS screening_sessions_org_write ON public.screening_sessions;

CREATE POLICY screening_sessions_org_write ON public.screening_sessions 
    FOR UPDATE TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.hiring_runs h 
            WHERE h.id = hiring_run_id 
              AND (h.employer_id = auth.uid() OR (h.org_id IS NOT NULL AND public.has_org_role(h.org_id, auth.uid(), ARRAY['owner', 'admin', 'recruiter', 'hiring_manager'])))
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.hiring_runs h 
            WHERE h.id = hiring_run_id 
              AND (h.employer_id = auth.uid() OR (h.org_id IS NOT NULL AND public.has_org_role(h.org_id, auth.uid(), ARRAY['owner', 'admin', 'recruiter', 'hiring_manager'])))
        )
    );

REVOKE INSERT, UPDATE, DELETE ON public.screening_sessions FROM anon, authenticated;
GRANT SELECT ON public.screening_sessions TO authenticated;
GRANT UPDATE (candidate_id, status, completed_at) ON public.screening_sessions TO authenticated;

-- 9. HARDEN ORGANIZATIONS AND MEMBERSHIPS POLICIES
DROP POLICY IF EXISTS organizations_update ON public.organizations;
CREATE POLICY organizations_update ON public.organizations 
    FOR UPDATE TO authenticated 
    USING (public.is_org_member(id, auth.uid()) OR created_by = auth.uid()) 
    WITH CHECK (public.is_org_member(id, auth.uid()) OR created_by = auth.uid());

DROP POLICY IF EXISTS org_memberships_select ON public.organization_memberships;
DROP POLICY IF EXISTS org_memberships_insert ON public.organization_memberships;
DROP POLICY IF EXISTS org_memberships_update ON public.organization_memberships;
DROP POLICY IF EXISTS org_memberships_delete ON public.organization_memberships;

CREATE POLICY org_memberships_select ON public.organization_memberships 
    FOR SELECT TO authenticated 
    USING (public.is_org_member(organization_id, auth.uid()) OR user_id = auth.uid());

CREATE POLICY org_memberships_insert ON public.organization_memberships 
    FOR INSERT TO authenticated 
    WITH CHECK (
        (public.has_org_role(organization_id, auth.uid(), ARRAY['owner']))
        OR (public.has_org_role(organization_id, auth.uid(), ARRAY['admin']) AND membership_role != 'owner')
        OR (user_id = auth.uid() AND membership_role = 'owner')
    );

CREATE POLICY org_memberships_update ON public.organization_memberships 
    FOR UPDATE TO authenticated 
    USING (
        public.has_org_role(organization_id, auth.uid(), ARRAY['owner'])
        OR (
            public.has_org_role(organization_id, auth.uid(), ARRAY['admin']) 
            AND (SELECT m.membership_role FROM public.organization_memberships m WHERE m.organization_id = organization_memberships.organization_id AND m.user_id = organization_memberships.user_id) != 'owner'
        )
    )
    WITH CHECK (
        public.has_org_role(organization_id, auth.uid(), ARRAY['owner'])
        OR (
            public.has_org_role(organization_id, auth.uid(), ARRAY['admin']) 
            AND membership_role != 'owner'
            AND (SELECT m.membership_role FROM public.organization_memberships m WHERE m.organization_id = organization_memberships.organization_id AND m.user_id = organization_memberships.user_id) != 'owner'
        )
    );

CREATE POLICY org_memberships_delete ON public.organization_memberships 
    FOR DELETE TO authenticated 
    USING (
        public.has_org_role(organization_id, auth.uid(), ARRAY['owner'])
        OR (
            public.has_org_role(organization_id, auth.uid(), ARRAY['admin']) 
            AND (SELECT m.membership_role FROM public.organization_memberships m WHERE m.organization_id = organization_memberships.organization_id AND m.user_id = organization_memberships.user_id) != 'owner'
        )
    );
