-- Migration: 20260814000002_candidate_evidence_tenant_security.sql
-- Purpose: Hardened Tenant Isolation (P0) for candidate_documents and claim_ledgers using security.is_org_member helper.

-- 1. ADD ORG_ID COLUMN IF NOT EXISTS
ALTER TABLE candidate_documents ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE claim_ledgers ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- 2. BACKFILL ORG_ID FROM HIRING_RUNS
UPDATE candidate_documents cd
SET org_id = hr.org_id
FROM hiring_runs hr
WHERE cd.hiring_run_id = hr.id AND cd.org_id IS NULL;

UPDATE claim_ledgers cl
SET org_id = hr.org_id
FROM hiring_runs hr
WHERE cl.hiring_run_id = hr.id AND cl.org_id IS NULL;

-- Default fallback for any orphan test rows to default staging organization Alpha
UPDATE candidate_documents SET org_id = '00000000-0000-4000-d2c0-000000000001' WHERE org_id IS NULL;
UPDATE claim_ledgers SET org_id = '00000000-0000-4000-d2c0-000000000001' WHERE org_id IS NULL;

ALTER TABLE candidate_documents ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE claim_ledgers ALTER COLUMN org_id SET NOT NULL;

-- 3. CREATE TENANT INDEXES
CREATE INDEX IF NOT EXISTS idx_candidate_documents_org_cand ON candidate_documents(org_id, candidate_id);
CREATE INDEX IF NOT EXISTS idx_claim_ledgers_org_cand_rev ON claim_ledgers(org_id, candidate_id, revision);

-- 4. DROP UNRESTRICTED USING (TRUE) POLICIES
DROP POLICY IF EXISTS candidate_documents_read ON candidate_documents;
DROP POLICY IF EXISTS claim_ledgers_read ON claim_ledgers;
DROP POLICY IF EXISTS candidate_documents_tenant_select ON candidate_documents;
DROP POLICY IF EXISTS claim_ledgers_tenant_select ON claim_ledgers;

-- 5. REVOKE ANONYMOUS ACCESS
REVOKE ALL ON candidate_documents FROM anon;
REVOKE ALL ON claim_ledgers FROM anon;

-- 6. DEFINE STRICT TENANT-ISOLATED POLICIES FOR AUTHENTICATED USERS VIA SECURITY DEFINER FUNCTION
CREATE POLICY candidate_documents_tenant_select ON candidate_documents
    FOR SELECT TO authenticated
    USING (
        security.is_org_member(candidate_documents.org_id)
        OR EXISTS (
            SELECT 1 FROM hiring_runs hr
            WHERE hr.id = candidate_documents.hiring_run_id
              AND hr.employer_id = auth.uid()
        )
    );

CREATE POLICY claim_ledgers_tenant_select ON claim_ledgers
    FOR SELECT TO authenticated
    USING (
        security.is_org_member(claim_ledgers.org_id)
        OR EXISTS (
            SELECT 1 FROM hiring_runs hr
            WHERE hr.id = claim_ledgers.hiring_run_id
              AND hr.employer_id = auth.uid()
        )
    );

GRANT SELECT ON candidate_documents TO authenticated;
GRANT SELECT ON claim_ledgers TO authenticated;
GRANT ALL ON candidate_documents TO service_role;
GRANT ALL ON claim_ledgers TO service_role;
