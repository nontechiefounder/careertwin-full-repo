-- WorkByLine V3: Persisted Indexing Stages and Durable Erasure Recovery
-- Forward migration for installations that already applied migration 005.

-- Ensure fingerprint column exists on wbctx_idempotency_keys
ALTER TABLE wbctx_idempotency_keys ADD COLUMN IF NOT EXISTS fingerprint VARCHAR;

-- Persisted indexing processing stage
CREATE TABLE IF NOT EXISTS wbctx_indexings (
    version VARCHAR PRIMARY KEY REFERENCES wbctx_versions(id) ON DELETE CASCADE,
    status VARCHAR NOT NULL, -- pending | running | retrying | completed | failed | disabled | lexical_only
    model_id VARCHAR,
    indexed_spans INTEGER DEFAULT 0,
    error VARCHAR,
    updated_at DOUBLE PRECISION NOT NULL
);

ALTER TABLE wbctx_indexings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wbctx_indexings FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE wbctx_indexings FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE wbctx_indexings FROM authenticated; END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wbctx_indexings_status ON wbctx_indexings(status);

-- Durable erasure tombstones for crash-safe physical cleanup recovery
CREATE TABLE IF NOT EXISTS wbctx_erasure_tombstones (
    id VARCHAR PRIMARY KEY,
    source_id VARCHAR NOT NULL,
    version_id VARCHAR,
    path VARCHAR NOT NULL,
    status VARCHAR NOT NULL DEFAULT 'pending', -- pending | completed | failed
    created_at DOUBLE PRECISION NOT NULL,
    completed_at DOUBLE PRECISION
);

ALTER TABLE wbctx_erasure_tombstones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wbctx_erasure_tombstones FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE wbctx_erasure_tombstones FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE wbctx_erasure_tombstones FROM authenticated; END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wbctx_erasure_tombstones_status ON wbctx_erasure_tombstones(status);
