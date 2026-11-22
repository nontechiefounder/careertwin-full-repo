-- Target Staging Operational Migration Step 4B5.2-D1.4
-- Organization-Aware RLS & Client Privilege Hardening Baseline

-- 1. MINIMUM ORGANIZATION MODEL TABLES
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organization_memberships (
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    membership_role TEXT NOT NULL CHECK (membership_role IN ('owner', 'admin', 'recruiter', 'hiring_manager', 'auditor')),
    membership_status TEXT NOT NULL DEFAULT 'active' CHECK (membership_status IN ('active', 'invited', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, user_id)
);

ALTER TABLE hiring_runs 
ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- 2. ENABLE RLS ON NEW TABLES
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;

-- 3. HELPER FUNCTIONS FOR ORGANIZATIONAL AUTHORIZATION
CREATE OR REPLACE FUNCTION is_org_member(p_org_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM organization_memberships 
        WHERE organization_id = p_org_id 
          AND user_id = p_user_id 
          AND membership_status = 'active'
    );
$$;

CREATE OR REPLACE FUNCTION has_org_role(p_org_id UUID, p_user_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM organization_memberships 
        WHERE organization_id = p_org_id 
          AND user_id = p_user_id 
          AND membership_status = 'active'
          AND membership_role = ANY(p_roles)
    );
$$;

CREATE OR REPLACE FUNCTION is_hiring_run_member(p_hiring_run_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM hiring_runs h
        WHERE h.id = p_hiring_run_id 
          AND (
            h.employer_id = p_user_id 
            OR (h.org_id IS NOT NULL AND is_org_member(h.org_id, p_user_id))
          )
    );
$$;

CREATE OR REPLACE FUNCTION is_session_member(p_session_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM screening_sessions s
        WHERE s.id = p_session_id 
          AND (
            s.candidate_id = p_user_id 
            OR is_hiring_run_member(s.hiring_run_id, p_user_id)
          )
    );
$$;

GRANT EXECUTE ON FUNCTION is_org_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION has_org_role(UUID, UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION is_hiring_run_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_session_member(UUID, UUID) TO authenticated;

-- 4. HARDEN PROFILES (Split ALL into SELECT, INSERT, Restricted UPDATE)
DROP POLICY IF EXISTS profiles_self_access ON profiles;
DROP POLICY IF EXISTS profiles_self_select ON profiles;
DROP POLICY IF EXISTS profiles_self_insert ON profiles;
DROP POLICY IF EXISTS profiles_self_update ON profiles;

CREATE POLICY profiles_self_select ON profiles 
    FOR SELECT TO authenticated 
    USING (auth.uid() = id);

CREATE POLICY profiles_self_insert ON profiles 
    FOR INSERT TO authenticated 
    WITH CHECK (auth.uid() = id);

CREATE POLICY profiles_self_update ON profiles 
    FOR UPDATE TO authenticated 
    USING (auth.uid() = id) 
    WITH CHECK (auth.uid() = id);

-- Column-level privilege restrictions on profiles table
REVOKE UPDATE ON profiles FROM anon, authenticated;
GRANT UPDATE (name, company, updated_at) ON profiles TO authenticated;

-- 5. HARDEN ACTIVITY_EVENTS (Replace USING (true) with scoped SELECT)
DROP POLICY IF EXISTS activity_events_read ON activity_events;
DROP POLICY IF EXISTS activity_events_select ON activity_events;

CREATE POLICY activity_events_select ON activity_events 
    FOR SELECT TO authenticated 
    USING (is_session_member(session_id, auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON activity_events FROM anon, authenticated;

-- 6. HARDEN SCREENING_SESSIONS (Replace candidate ALL)
DROP POLICY IF EXISTS screening_sessions_candidate_self ON screening_sessions;
DROP POLICY IF EXISTS screening_sessions_employer_owner ON screening_sessions;
DROP POLICY IF EXISTS screening_sessions_candidate_select ON screening_sessions;
DROP POLICY IF EXISTS screening_sessions_candidate_update ON screening_sessions;
DROP POLICY IF EXISTS screening_sessions_org_select ON screening_sessions;
DROP POLICY IF EXISTS screening_sessions_org_update ON screening_sessions;

CREATE POLICY screening_sessions_candidate_select ON screening_sessions 
    FOR SELECT TO authenticated 
    USING (auth.uid() = candidate_id);

CREATE POLICY screening_sessions_candidate_update ON screening_sessions 
    FOR UPDATE TO authenticated 
    USING (auth.uid() = candidate_id) 
    WITH CHECK (
        auth.uid() = candidate_id 
        AND candidate_id = (SELECT s.candidate_id FROM screening_sessions s WHERE s.id = screening_sessions.id)
        AND hiring_run_id = (SELECT s.hiring_run_id FROM screening_sessions s WHERE s.id = screening_sessions.id)
    );

CREATE POLICY screening_sessions_org_select ON screening_sessions 
    FOR SELECT TO authenticated 
    USING (is_hiring_run_member(hiring_run_id, auth.uid()));

CREATE POLICY screening_sessions_org_update ON screening_sessions 
    FOR UPDATE TO authenticated 
    USING (is_hiring_run_member(hiring_run_id, auth.uid())) 
    WITH CHECK (is_hiring_run_member(hiring_run_id, auth.uid()));

REVOKE INSERT, DELETE ON screening_sessions FROM anon, authenticated;

-- 7. HARDEN SCREENING_ANSWERS (Separate SELECT, INSERT, UPDATE; Revoke DELETE)
DROP POLICY IF EXISTS screening_answers_session_owner ON screening_answers;
DROP POLICY IF EXISTS screening_answers_select ON screening_answers;
DROP POLICY IF EXISTS screening_answers_insert ON screening_answers;
DROP POLICY IF EXISTS screening_answers_update ON screening_answers;

CREATE POLICY screening_answers_select ON screening_answers 
    FOR SELECT TO authenticated 
    USING (is_session_member(session_id, auth.uid()));

CREATE POLICY screening_answers_insert ON screening_answers 
    FOR INSERT TO authenticated 
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM screening_sessions s 
            WHERE s.id = session_id AND s.candidate_id = auth.uid()
        )
    );

CREATE POLICY screening_answers_update ON screening_answers 
    FOR UPDATE TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM screening_sessions s 
            WHERE s.id = session_id AND s.candidate_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM screening_sessions s 
            WHERE s.id = session_id AND s.candidate_id = auth.uid()
        )
    );

REVOKE DELETE ON screening_answers FROM anon, authenticated;

-- 8. HARDEN REMAINING POLICIES WITH ORG-AWARE AUTHORIZATION
DROP POLICY IF EXISTS hiring_runs_employer_owner ON hiring_runs;
DROP POLICY IF EXISTS hiring_runs_org_owner ON hiring_runs;

CREATE POLICY hiring_runs_org_owner ON hiring_runs 
    FOR ALL TO authenticated 
    USING (
        auth.uid() = employer_id 
        OR (org_id IS NOT NULL AND is_org_member(org_id, auth.uid()))
    )
    WITH CHECK (
        auth.uid() = employer_id 
        OR (org_id IS NOT NULL AND is_org_member(org_id, auth.uid()))
    );

DROP POLICY IF EXISTS sourcing_sessions_employer_owner ON sourcing_sessions;
DROP POLICY IF EXISTS sourcing_sessions_org_owner ON sourcing_sessions;

CREATE POLICY sourcing_sessions_org_owner ON sourcing_sessions 
    FOR ALL TO authenticated 
    USING (
        auth.uid() = employer_id 
        OR is_hiring_run_member(hiring_run_id, auth.uid())
    )
    WITH CHECK (
        auth.uid() = employer_id 
        OR is_hiring_run_member(hiring_run_id, auth.uid())
    );

DROP POLICY IF EXISTS candidates_employer_owner ON candidates;
DROP POLICY IF EXISTS candidates_org_owner ON candidates;

CREATE POLICY candidates_org_owner ON candidates 
    FOR ALL TO authenticated 
    USING (is_hiring_run_member(hiring_run_id, auth.uid()))
    WITH CHECK (is_hiring_run_member(hiring_run_id, auth.uid()));

DROP POLICY IF EXISTS screening_summaries_read ON screening_summaries;
DROP POLICY IF EXISTS screening_summaries_select ON screening_summaries;

CREATE POLICY screening_summaries_select ON screening_summaries 
    FOR SELECT TO authenticated 
    USING (is_session_member(session_id, auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON screening_summaries FROM anon, authenticated;

-- 9. GRANTS & POLICIES FOR ORGANIZATIONS AND MEMBERSHIPS
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON organization_memberships TO authenticated;

DROP POLICY IF EXISTS organizations_member_select ON organizations;
DROP POLICY IF EXISTS organizations_creator_all ON organizations;
DROP POLICY IF EXISTS organizations_select ON organizations;
DROP POLICY IF EXISTS organizations_insert ON organizations;

CREATE POLICY organizations_select ON organizations 
    FOR SELECT TO authenticated 
    USING (is_org_member(id, auth.uid()) OR created_by = auth.uid());

CREATE POLICY organizations_insert ON organizations 
    FOR INSERT TO authenticated 
    WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS org_memberships_admin_all ON organization_memberships;
DROP POLICY IF EXISTS org_memberships_select ON organization_memberships;
DROP POLICY IF EXISTS org_memberships_insert ON organization_memberships;
DROP POLICY IF EXISTS org_memberships_update ON organization_memberships;
DROP POLICY IF EXISTS org_memberships_delete ON organization_memberships;

CREATE POLICY org_memberships_select ON organization_memberships 
    FOR SELECT TO authenticated 
    USING (is_org_member(organization_id, auth.uid()) OR user_id = auth.uid());

CREATE POLICY org_memberships_insert ON organization_memberships 
    FOR INSERT TO authenticated 
    WITH CHECK (user_id = auth.uid() OR has_org_role(organization_id, auth.uid(), ARRAY['owner', 'admin']));

CREATE POLICY org_memberships_update ON organization_memberships 
    FOR UPDATE TO authenticated 
    USING (has_org_role(organization_id, auth.uid(), ARRAY['owner', 'admin']))
    WITH CHECK (has_org_role(organization_id, auth.uid(), ARRAY['owner', 'admin']));

CREATE POLICY org_memberships_delete ON organization_memberships 
    FOR DELETE TO authenticated 
    USING (has_org_role(organization_id, auth.uid(), ARRAY['owner', 'admin']));
