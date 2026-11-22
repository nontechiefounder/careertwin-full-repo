-- Operator-reviewed containment only. Apply in the designated environment.
-- This intentionally disables the unsafe Phase B RPC; never grants it access.
BEGIN;
DO $$
DECLARE f RECORD; t TEXT; r TEXT;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS identity FROM pg_proc p
           JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='ingest_context_source_version_transactional'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.identity);
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f.identity, r);
      END IF;
    END LOOP;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['context_source_objects','context_source_versions',
    'context_parsed_artifacts','context_evidence_spans','context_processing_runs',
    'context_document_results','context_evaluation_dependencies','context_transactional_outbox'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
          EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', t, r);
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;
COMMIT;
