-- Apply with the external migration runner owning the transaction.
-- Existing wbctx schema prerequisite. Do not apply earlier broken legacy chain.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE wbctx_span_embeddings (
 span_id varchar PRIMARY KEY REFERENCES wbctx_spans(id) ON DELETE CASCADE,
 model_id text NOT NULL,
 embedding vector(384) NOT NULL
);
ALTER TABLE wbctx_span_embeddings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wbctx_span_embeddings FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN REVOKE ALL ON wbctx_span_embeddings FROM anon; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN REVOKE ALL ON wbctx_span_embeddings FROM authenticated; END IF;
END $$;
CREATE INDEX wbctx_spans_text_gin ON wbctx_spans USING gin(to_tsvector('english', text));
-- Exact scoped vector search initially. Add ANN only after measuring filtered recall.
