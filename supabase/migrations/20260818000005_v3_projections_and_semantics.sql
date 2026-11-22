-- WorkByLine V3: Projections and Document Identity Semantics

CREATE TABLE IF NOT EXISTS wbctx_projections (
    version VARCHAR NOT NULL,
    status VARCHAR NOT NULL,
    episode_id VARCHAR,
    error VARCHAR,
    updated_at DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (version),
    FOREIGN KEY (version) REFERENCES wbctx_versions (id)
);

ALTER TABLE wbctx_projections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wbctx_projections FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE wbctx_projections FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE wbctx_projections FROM authenticated; END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wbctx_projections_status ON wbctx_projections(status);
CREATE INDEX IF NOT EXISTS idx_wbctx_span_embeddings_model ON wbctx_span_embeddings(model_id);

-- Persisted tenant/run-scoped upload idempotency with request fingerprinting
CREATE TABLE IF NOT EXISTS wbctx_idempotency_keys (
    id VARCHAR PRIMARY KEY,
    org VARCHAR NOT NULL,
    workspace VARCHAR NOT NULL,
    run VARCHAR NOT NULL,
    idempotency_key VARCHAR NOT NULL,
    fingerprint VARCHAR NOT NULL,
    source_id VARCHAR NOT NULL REFERENCES wbctx_sources(id),
    version_id VARCHAR NOT NULL REFERENCES wbctx_versions(id),
    created_at DOUBLE PRECISION NOT NULL,
    CONSTRAINT uq_wbctx_idempotency_scope UNIQUE (org, workspace, run, idempotency_key)
);

ALTER TABLE wbctx_idempotency_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE wbctx_idempotency_keys FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON TABLE wbctx_idempotency_keys FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON TABLE wbctx_idempotency_keys FROM authenticated; END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_wbctx_idempotency_lookup ON wbctx_idempotency_keys(org, workspace, run, idempotency_key);
