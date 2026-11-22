-- Migration: 20260805000001_fix_staging_rls_discrepancies.sql
-- Description: Restore missing SELECT policy on organizations and candidate self-read policy on candidates.

-- 1. Restore SELECT policy on public.organizations
DROP POLICY IF EXISTS organizations_select ON public.organizations;
CREATE POLICY organizations_select ON public.organizations
    FOR SELECT TO authenticated
    USING (security.is_org_member(id) OR created_by = auth.uid());

-- 2. Update SELECT policy on public.candidates to include candidate self-read access
DROP POLICY IF EXISTS candidates_org_select ON public.candidates;
DROP POLICY IF EXISTS candidates_select ON public.candidates;
CREATE POLICY candidates_select ON public.candidates
    FOR SELECT TO authenticated
    USING (candidate_id = auth.uid() OR security.is_hiring_run_member(hiring_run_id));
