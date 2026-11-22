-- Transactional, concurrency-safe screening session completion & structured summary persistence

ALTER TABLE public.screening_summaries
  ADD COLUMN IF NOT EXISTS overall_score DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS strengths JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS concerns JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recommended_next_step TEXT;

CREATE OR REPLACE FUNCTION public.complete_screening_session_transactional(
  p_session_id UUID,
  p_summary_text TEXT,
  p_technical_score DOUBLE PRECISION,
  p_communication_score DOUBLE PRECISION,
  p_strengths JSONB DEFAULT '[]'::jsonb,
  p_concerns JSONB DEFAULT '[]'::jsonb,
  p_recommended_next_step TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session RECORD;
  v_summary RECORD;
  v_overall DOUBLE PRECISION;
  v_strengths JSONB;
  v_concerns JSONB;
  v_next_step TEXT;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'SESSION_ID_REQUIRED';
  END IF;

  -- Lock the screening session row first to serialize concurrent completions
  SELECT *
    INTO v_session
    FROM public.screening_sessions
   WHERE id = p_session_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND';
  END IF;

  -- Idempotent replay when already completed: return stored summary without overwriting
  IF v_session.status = 'completed' THEN
    SELECT *
      INTO v_summary
      FROM public.screening_summaries
     WHERE session_id = p_session_id;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'replayed', TRUE,
        'summary', jsonb_build_object(
          'overall_score', COALESCE(v_summary.overall_score, v_summary.technical_score),
          'summary_text', v_summary.summary_text,
          'technical_score', v_summary.technical_score,
          'communication_score', v_summary.communication_score,
          'strengths', COALESCE(v_summary.strengths, '[]'::jsonb),
          'concerns', COALESCE(v_summary.concerns, '[]'::jsonb),
          'recommended_next_step', v_summary.recommended_next_step
        )
      );
    END IF;
  END IF;

  IF p_technical_score IS NULL OR p_technical_score < 0.0 OR p_technical_score > 1.0 THEN
    RAISE EXCEPTION 'INVALID_TECHNICAL_SCORE';
  END IF;
  IF p_communication_score IS NULL OR p_communication_score < 0.0 OR p_communication_score > 1.0 THEN
    RAISE EXCEPTION 'INVALID_COMMUNICATION_SCORE';
  END IF;
  IF p_summary_text IS NULL OR length(btrim(p_summary_text)) = 0 THEN
    RAISE EXCEPTION 'INVALID_SUMMARY_TEXT';
  END IF;

  v_overall := round(p_technical_score::numeric, 3)::double precision;
  v_strengths := COALESCE(p_strengths, '[]'::jsonb);
  v_concerns := COALESCE(p_concerns, '[]'::jsonb);
  v_next_step := CASE
    WHEN p_recommended_next_step IS NOT NULL AND length(btrim(p_recommended_next_step)) > 0
      THEN btrim(p_recommended_next_step)
    ELSE NULL
  END;

  INSERT INTO public.screening_summaries (
    session_id,
    summary_text,
    technical_score,
    communication_score,
    overall_score,
    strengths,
    concerns,
    recommended_next_step,
    created_at
  )
  VALUES (
    p_session_id,
    p_summary_text,
    round(p_technical_score::numeric, 3)::double precision,
    round(p_communication_score::numeric, 3)::double precision,
    v_overall,
    v_strengths,
    v_concerns,
    v_next_step,
    NOW()
  )
  ON CONFLICT (session_id) DO NOTHING;

  UPDATE public.screening_sessions
     SET status = 'completed',
         completed_at = COALESCE(completed_at, NOW())
   WHERE id = p_session_id;

  SELECT *
    INTO v_summary
    FROM public.screening_summaries
   WHERE session_id = p_session_id;

  RETURN jsonb_build_object(
    'replayed', FALSE,
    'summary', jsonb_build_object(
      'overall_score', COALESCE(v_summary.overall_score, v_summary.technical_score),
      'summary_text', v_summary.summary_text,
      'technical_score', v_summary.technical_score,
      'communication_score', v_summary.communication_score,
      'strengths', COALESCE(v_summary.strengths, '[]'::jsonb),
      'concerns', COALESCE(v_summary.concerns, '[]'::jsonb),
      'recommended_next_step', v_summary.recommended_next_step
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_screening_session_transactional(UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, JSONB, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_screening_session_transactional(UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, JSONB, JSONB, TEXT) TO service_role;
