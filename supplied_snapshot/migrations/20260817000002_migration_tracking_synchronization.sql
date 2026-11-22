-- ==============================================================================
-- MIGRATION: 20260817000002_migration_tracking_synchronization.sql
-- PURPOSE: Ensures schema_migrations tracking exists and synchronizes applied
--          historical migrations for both fresh and existing target databases.
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS supabase_migrations;

CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
    version text PRIMARY KEY,
    statements text[],
    name text
);

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES
    ('20260803000001', 'operational_schema_baseline'),
    ('20260803000002', 'organization_and_rls_hardening'),
    ('20260803000003', 'organization_authorization_completion'),
    ('20260804000001', 'staging_authorization_blockers'),
    ('20260805000001', 'fix_staging_rls_discrepancies'),
    ('20260814000001', 'candidate_evidence_ledger'),
    ('20260814000002', 'candidate_evidence_tenant_security'),
    ('20260814000003', 'atomic_claim_ledger_revision'),
    ('20260815000001', 'scheduled_emails_atomic_uniqueness'),
    ('20260815000002', 'packet_provenance_and_email_scope'),
    ('20260816000001', 'close_release_blockers'),
    ('20260816000002', 'exact_document_and_rubric_binding'),
    ('20260816000003', 'strict_rpc_validation_and_audit_history'),
    ('20260817000001', 'core09_transactional_decisions_and_storage'),
    ('20260817000002', 'migration_tracking_synchronization')
ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
