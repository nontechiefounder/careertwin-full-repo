-- WorkByLine V3: Forward Migration 008
-- Reference Inference Backend Provenance, Unvalidated Vector Quarantine, and Historical Variant Audit Ledger
-- Preserves exact historical checksums of migrations 000..007.

-- 1. Inference Backend Provenance Columns
ALTER TABLE wbctx_indexings ADD COLUMN IF NOT EXISTS inference_backend VARCHAR;
ALTER TABLE wbctx_span_embeddings ADD COLUMN IF NOT EXISTS inference_backend VARCHAR;

CREATE INDEX IF NOT EXISTS idx_wbctx_span_embeddings_full_provenance
    ON wbctx_span_embeddings(model_id, model_revision, artifact_sha256, inference_backend);

-- 2. Quarantine and require reindexing for any vectors produced without validated sentence_transformers backend
DELETE FROM wbctx_span_embeddings
WHERE inference_backend IS NULL
   OR inference_backend NOT LIKE 'sentence_transformers:%';

UPDATE wbctx_indexings
SET status = 'reindex_required',
    indexed_spans = 0,
    error = 'REINDEX_REQUIRED_UNVALIDATED_INFERENCE_BACKEND'
WHERE status = 'completed'
  AND (inference_backend IS NULL OR inference_backend NOT LIKE 'sentence_transformers:%');

-- 3. Auditable Historical Migration Variant Reconciliation Ledger (never overwrites schema_migrations.sha256)
CREATE TABLE IF NOT EXISTS schema_migration_reconciliations (
    version TEXT PRIMARY KEY REFERENCES schema_migrations(version) ON DELETE CASCADE,
    recorded_sha256 TEXT NOT NULL,
    canonical_file_sha256 TEXT NOT NULL,
    variant_origin TEXT NOT NULL,
    schema_equivalence_verified BOOLEAN NOT NULL,
    verified_details TEXT NOT NULL,
    reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE schema_migration_reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE schema_migration_reconciliations FROM PUBLIC;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE schema_migration_reconciliations FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE schema_migration_reconciliations FROM authenticated;
    END IF;
END $$;

