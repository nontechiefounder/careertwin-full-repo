-- 20260818000004_hybrid_retrieval.sql
-- Vector embeddings table and full-text search index for Context Evidence hybrid retrieval.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS wbctx_span_embeddings (
    span_id VARCHAR PRIMARY KEY REFERENCES wbctx_spans(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    embedding VECTOR(384) NOT NULL
);

ALTER TABLE wbctx_span_embeddings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wbctx_span_embeddings FROM PUBLIC;

DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
        REVOKE ALL ON wbctx_span_embeddings FROM anon;
    END IF;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
        REVOKE ALL ON wbctx_span_embeddings FROM authenticated;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS wbctx_spans_text_gin ON wbctx_spans USING gin(to_tsvector('english', text));
