-- WorkByLine V3: Forward Migration 007
-- Model Provenance Binding, Activity Stage Lease Fencing, and Durable Erasure Recovery Leases
-- Preserves historical checksums of migrations 000..006 while upgrading existing 006 installations cleanly.

-- 1. Indexing Stage Provenance & Attempt Fencing
ALTER TABLE wbctx_indexings ADD COLUMN IF NOT EXISTS model_revision VARCHAR;
ALTER TABLE wbctx_indexings ADD COLUMN IF NOT EXISTS artifact_sha256 VARCHAR;
ALTER TABLE wbctx_indexings ADD COLUMN IF NOT EXISTS fence VARCHAR;

-- 2. Span Embedding Provenance Binding
ALTER TABLE wbctx_span_embeddings ADD COLUMN IF NOT EXISTS model_revision VARCHAR;
ALTER TABLE wbctx_span_embeddings ADD COLUMN IF NOT EXISTS artifact_sha256 VARCHAR;
CREATE INDEX IF NOT EXISTS idx_wbctx_span_embeddings_provenance
    ON wbctx_span_embeddings(model_id, model_revision, artifact_sha256);

-- 3. Graph Projection Attempt Fencing
ALTER TABLE wbctx_projections ADD COLUMN IF NOT EXISTS fence VARCHAR;

-- 4. Durable Erasure Recovery Claims, Leases, Attempts & Error Tracking
ALTER TABLE wbctx_erasure_tombstones ADD COLUMN IF NOT EXISTS fence VARCHAR;
ALTER TABLE wbctx_erasure_tombstones ADD COLUMN IF NOT EXISTS lease_until DOUBLE PRECISION DEFAULT 0;
ALTER TABLE wbctx_erasure_tombstones ADD COLUMN IF NOT EXISTS attempts INTEGER DEFAULT 0;
ALTER TABLE wbctx_erasure_tombstones ADD COLUMN IF NOT EXISTS last_error VARCHAR;

CREATE INDEX IF NOT EXISTS idx_wbctx_erasure_tombstones_recovery
    ON wbctx_erasure_tombstones(status, lease_until);
