-- ==============================================================================
-- MIGRATION: 20260818000001_context_evidence_foundation.sql
-- PURPOSE:
-- Establishes the authoritative Context Evidence Foundation schema:
-- 1. context_source_objects: Source object identities with access policy & scope.
-- 2. context_source_versions: Immutable source versions with original SHA-256 and effective time.
-- 3. context_parsed_artifacts: Normalized parsed representations with parser & schema versions.
-- 4. context_evidence_spans: Granular evidence spans with character offsets & page numbers.
-- 5. context_processing_runs: Batch/background processing runs with status tracking.
-- 6. context_document_results: Per-document coverage manifests, scores, and explicit exceptions.
-- 7. context_evaluation_dependencies: Tracks candidate claim/evaluation dependencies on exact versions.
-- 8. context_transactional_outbox: Outbox table for reliable asynchronous worker dispatch.
-- 9. ingest_context_source_version_transactional: Atomic RPC for ingestion & outbox enqueue.
-- ==============================================================================

-- 1. CONTEXT_SOURCE_OBJECTS
CREATE TABLE IF NOT EXISTS public.context_source_objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    workspace_id TEXT NOT NULL,
    source_uri TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    confidentiality TEXT NOT NULL DEFAULT 'TENANT_CONFIDENTIAL',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_context_source_org_uri UNIQUE (org_id, workspace_id, source_uri)
);

ALTER TABLE public.context_source_objects ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'context_source_objects' AND policyname = 'context_source_objects_tenant_select'
    ) THEN
        CREATE POLICY context_source_objects_tenant_select ON public.context_source_objects
            FOR SELECT TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.organization_memberships m
                    WHERE m.organization_id = context_source_objects.org_id
                      AND m.user_id = auth.uid()
                )
            );
    END IF;
END $$;

-- 2. CONTEXT_SOURCE_VERSIONS
CREATE TABLE IF NOT EXISTS public.context_source_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES public.context_source_objects(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL DEFAULT 1,
    original_artifact_id TEXT NOT NULL,
    original_file_sha256 TEXT NOT NULL,
    original_mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    effective_time TIMESTAMPTZ,
    ingested_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'pending',
    CONSTRAINT uq_context_source_version UNIQUE (source_id, version_number),
    CONSTRAINT chk_source_version_status CHECK (status IN ('pending', 'running', 'completed', 'partial', 'failed', 'excluded', 'superseded'))
);

ALTER TABLE public.context_source_versions ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'context_source_versions' AND policyname = 'context_source_versions_tenant_select'
    ) THEN
        CREATE POLICY context_source_versions_tenant_select ON public.context_source_versions
            FOR SELECT TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.organization_memberships m
                    WHERE m.organization_id = context_source_versions.org_id
                      AND m.user_id = auth.uid()
                )
            );
    END IF;
END $$;

-- 3. CONTEXT_PARSED_ARTIFACTS
CREATE TABLE IF NOT EXISTS public.context_parsed_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_version_id UUID NOT NULL REFERENCES public.context_source_versions(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    parser_name TEXT NOT NULL,
    parser_version TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    normalized_content_sha256 TEXT NOT NULL,
    normalized_text TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_context_parsed_version_parser UNIQUE (source_version_id, parser_name, parser_version)
);

ALTER TABLE public.context_parsed_artifacts ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'context_parsed_artifacts' AND policyname = 'context_parsed_artifacts_tenant_select'
    ) THEN
        CREATE POLICY context_parsed_artifacts_tenant_select ON public.context_parsed_artifacts
            FOR SELECT TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.organization_memberships m
                    WHERE m.organization_id = context_parsed_artifacts.org_id
                      AND m.user_id = auth.uid()
                )
            );
    END IF;
END $$;

-- 4. CONTEXT_EVIDENCE_SPANS
CREATE TABLE IF NOT EXISTS public.context_evidence_spans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parsed_artifact_id UUID NOT NULL REFERENCES public.context_parsed_artifacts(id) ON DELETE CASCADE,
    source_version_id UUID NOT NULL REFERENCES public.context_source_versions(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    span_key TEXT NOT NULL,
    start_char INTEGER NOT NULL,
    end_char INTEGER NOT NULL,
    page_number INTEGER,
    exact_text TEXT NOT NULL,
    span_type TEXT NOT NULL DEFAULT 'PASSAGE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_context_span_key UNIQUE (parsed_artifact_id, span_key)
);

ALTER TABLE public.context_evidence_spans ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'context_evidence_spans' AND policyname = 'context_evidence_spans_tenant_select'
    ) THEN
        CREATE POLICY context_evidence_spans_tenant_select ON public.context_evidence_spans
            FOR SELECT TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.organization_memberships m
                    WHERE m.organization_id = context_evidence_spans.org_id
                      AND m.user_id = auth.uid()
                )
            );
    END IF;
END $$;

-- 5. CONTEXT_PROCESSING_RUNS
CREATE TABLE IF NOT EXISTS public.context_processing_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    hiring_run_id UUID REFERENCES public.hiring_runs(id) ON DELETE SET NULL,
    run_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    items_total INTEGER NOT NULL DEFAULT 0,
    items_completed INTEGER NOT NULL DEFAULT 0,
    items_failed INTEGER NOT NULL DEFAULT 0,
    error_summary TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT chk_proc_run_status CHECK (status IN ('pending', 'running', 'completed', 'partial', 'failed'))
);

ALTER TABLE public.context_processing_runs ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'context_processing_runs' AND policyname = 'context_processing_runs_tenant_select'
    ) THEN
        CREATE POLICY context_processing_runs_tenant_select ON public.context_processing_runs
            FOR SELECT TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.organization_memberships m
                    WHERE m.organization_id = context_processing_runs.org_id
                      AND m.user_id = auth.uid()
                )
            );
    END IF;
END $$;

-- 6. CONTEXT_DOCUMENT_RESULTS
CREATE TABLE IF NOT EXISTS public.context_document_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    processing_run_id UUID NOT NULL REFERENCES public.context_processing_runs(id) ON DELETE CASCADE,
    source_version_id UUID NOT NULL REFERENCES public.context_source_versions(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    coverage_score NUMERIC(5, 2) DEFAULT 0.00,
    exceptions JSONB DEFAULT '[]'::jsonb,
    result_metadata JSONB DEFAULT '{}'::jsonb,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_context_doc_result UNIQUE (processing_run_id, source_version_id),
    CONSTRAINT chk_doc_result_status CHECK (status IN ('completed', 'partial', 'failed', 'excluded'))
);

ALTER TABLE public.context_document_results ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'context_document_results' AND policyname = 'context_document_results_tenant_select'
    ) THEN
        CREATE POLICY context_document_results_tenant_select ON public.context_document_results
            FOR SELECT TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.organization_memberships m
                    WHERE m.organization_id = context_document_results.org_id
                      AND m.user_id = auth.uid()
                )
            );
    END IF;
END $$;

-- 7. CONTEXT_EVALUATION_DEPENDENCIES
CREATE TABLE IF NOT EXISTS public.context_evaluation_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    hiring_run_id UUID NOT NULL REFERENCES public.hiring_runs(id) ON DELETE CASCADE,
    claim_ledger_id UUID REFERENCES public.claim_ledgers(id) ON DELETE CASCADE,
    source_version_id UUID NOT NULL REFERENCES public.context_source_versions(id) ON DELETE CASCADE,
    rubric_version TEXT NOT NULL,
    evaluated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_context_eval_dependency UNIQUE (hiring_run_id, claim_ledger_id, source_version_id)
);

ALTER TABLE public.context_evaluation_dependencies ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'context_evaluation_dependencies' AND policyname = 'context_eval_deps_tenant_select'
    ) THEN
        CREATE POLICY context_eval_deps_tenant_select ON public.context_evaluation_dependencies
            FOR SELECT TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.organization_memberships m
                    WHERE m.organization_id = context_evaluation_dependencies.org_id
                      AND m.user_id = auth.uid()
                )
            );
    END IF;
END $$;

-- 8. CONTEXT_TRANSACTIONAL_OUTBOX
CREATE TABLE IF NOT EXISTS public.context_transactional_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id TEXT NOT NULL,
    payload JSONB NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    CONSTRAINT chk_outbox_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

ALTER TABLE public.context_transactional_outbox ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'context_transactional_outbox' AND policyname = 'context_outbox_tenant_select'
    ) THEN
        CREATE POLICY context_outbox_tenant_select ON public.context_transactional_outbox
            FOR SELECT TO authenticated
            USING (
                EXISTS (
                    SELECT 1 FROM public.organization_memberships m
                    WHERE m.organization_id = context_transactional_outbox.org_id
                      AND m.user_id = auth.uid()
                )
            );
    END IF;
END $$;

-- Grants
GRANT ALL ON public.context_source_objects TO authenticated, service_role;
GRANT ALL ON public.context_source_versions TO authenticated, service_role;
GRANT ALL ON public.context_parsed_artifacts TO authenticated, service_role;
GRANT ALL ON public.context_evidence_spans TO authenticated, service_role;
GRANT ALL ON public.context_processing_runs TO authenticated, service_role;
GRANT ALL ON public.context_document_results TO authenticated, service_role;
GRANT ALL ON public.context_evaluation_dependencies TO authenticated, service_role;
GRANT ALL ON public.context_transactional_outbox TO authenticated, service_role;

-- 9. TRANSACTIONAL RPC FOR ATOMIC INGESTION & OUTBOX DISPATCH
CREATE OR REPLACE FUNCTION public.ingest_context_source_version_transactional(
    p_org_id UUID,
    p_workspace_id TEXT,
    p_source_uri TEXT,
    p_source_kind TEXT,
    p_file_sha256 TEXT,
    p_mime_type TEXT,
    p_byte_size INTEGER,
    p_original_artifact_id TEXT,
    p_effective_time TIMESTAMPTZ,
    p_idempotency_key TEXT
)
RETURNS TABLE (
    source_id UUID,
    version_id UUID,
    version_number INTEGER,
    outbox_id UUID,
    is_new_source BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_source_id UUID;
    v_version_id UUID;
    v_version_num INTEGER;
    v_outbox_id UUID;
    v_is_new BOOLEAN := false;
BEGIN
    -- 1. Check idempotency in outbox
    SELECT id INTO v_outbox_id
    FROM public.context_transactional_outbox
    WHERE idempotency_key = p_idempotency_key;

    IF v_outbox_id IS NOT NULL THEN
        -- Already processed or pending with same idempotency key
        SELECT (payload->>'source_id')::uuid, (payload->>'version_id')::uuid, (payload->>'version_number')::int
        INTO v_source_id, v_version_id, v_version_num
        FROM public.context_transactional_outbox
        WHERE id = v_outbox_id;

        RETURN QUERY SELECT v_source_id, v_version_id, v_version_num, v_outbox_id, false;
        RETURN;
    END IF;

    -- 2. Find or create Source Object
    SELECT id INTO v_source_id
    FROM public.context_source_objects
    WHERE org_id = p_org_id
      AND workspace_id = p_workspace_id
      AND source_uri = p_source_uri;

    IF v_source_id IS NULL THEN
        INSERT INTO public.context_source_objects (
            org_id, workspace_id, source_uri, source_kind
        ) VALUES (
            p_org_id, p_workspace_id, p_source_uri, p_source_kind
        ) RETURNING id INTO v_source_id;
        v_is_new := true;
        v_version_num := 1;
    ELSE
        -- Increment version
        SELECT COALESCE(MAX(v.version_number), 0) + 1 INTO v_version_num
        FROM public.context_source_versions v
        WHERE v.source_id = v_source_id;

        -- Supersede previous active versions
        UPDATE public.context_source_versions
        SET status = 'superseded'
        WHERE source_id = v_source_id
          AND status IN ('pending', 'running', 'completed');
    END IF;

    -- 3. Insert new Source Version
    INSERT INTO public.context_source_versions (
        source_id, org_id, version_number, original_artifact_id,
        original_file_sha256, original_mime_type, byte_size,
        effective_time, status
    ) VALUES (
        v_source_id, p_org_id, v_version_num, p_original_artifact_id,
        p_file_sha256, p_mime_type, p_byte_size,
        p_effective_time, 'pending'
    ) RETURNING id INTO v_version_id;

    -- 4. Atomically insert outbox task for background parsing & evidence extraction
    INSERT INTO public.context_transactional_outbox (
        org_id, event_type, aggregate_type, aggregate_id,
        payload, idempotency_key, status
    ) VALUES (
        p_org_id,
        'SOURCE_VERSION_INGESTED',
        'source_version',
        v_version_id::text,
        jsonb_build_object(
            'source_id', v_source_id,
            'version_id', v_version_id,
            'version_number', v_version_num,
            'source_uri', p_source_uri,
            'file_sha256', p_file_sha256,
            'artifact_id', p_original_artifact_id
        ),
        p_idempotency_key,
        'pending'
    ) RETURNING id INTO v_outbox_id;

    RETURN QUERY SELECT v_source_id, v_version_id, v_version_num, v_outbox_id, v_is_new;
END;
$$;
