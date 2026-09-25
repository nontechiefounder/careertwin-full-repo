-- Migration: 20260814000001_candidate_evidence_ledger.sql
-- Purpose: Persist canonical candidate normalized parsed text, EvidenceRefs, and versioned Claim Ledgers.

-- 1. CANDIDATE_DOCUMENTS
CREATE TABLE IF NOT EXISTS candidate_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    hiring_run_id UUID REFERENCES hiring_runs(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_sha256 TEXT NOT NULL,
    normalized_text TEXT NOT NULL,
    normalized_text_sha256 TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    parser_name TEXT NOT NULL DEFAULT '1.0.0-docling',
    row_index INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE candidate_documents ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'candidate_documents' AND policyname = 'candidate_documents_read'
    ) THEN
        CREATE POLICY candidate_documents_read ON candidate_documents FOR SELECT TO authenticated USING (TRUE);
    END IF;
END $$;

-- 2. CLAIM_LEDGERS
CREATE TABLE IF NOT EXISTS claim_ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    hiring_run_id UUID NOT NULL REFERENCES hiring_runs(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL DEFAULT 1,
    evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    claims JSONB NOT NULL DEFAULT '[]'::jsonb,
    claim_edges JSONB NOT NULL DEFAULT '[]'::jsonb,
    evaluation_output JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_claim_ledgers_candidate_hiring_run_rev UNIQUE (candidate_id, hiring_run_id, revision)
);
ALTER TABLE claim_ledgers ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'claim_ledgers' AND policyname = 'claim_ledgers_read'
    ) THEN
        CREATE POLICY claim_ledgers_read ON claim_ledgers FOR SELECT TO authenticated USING (TRUE);
    END IF;
END $$;

GRANT ALL ON candidate_documents TO authenticated, service_role;
GRANT ALL ON claim_ledgers TO authenticated, service_role;
GRANT SELECT ON candidate_documents TO anon;
GRANT SELECT ON claim_ledgers TO anon;
