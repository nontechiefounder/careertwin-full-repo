-- Target Staging Operational Baseline Migration (Step 4B5.2-D1.1)
-- Source: Complete Literal 11-Table Field Inventory documented in SCHEMA.md
-- Target: Offline Local Supabase Baseline

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE,
    name TEXT,
    role TEXT,
    company TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    gmail_connected BOOLEAN DEFAULT FALSE,
    gmail_email TEXT,
    gmail_refresh_token TEXT
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_self_access ON profiles 
    FOR ALL TO authenticated 
    USING (auth.uid() = id) 
    WITH CHECK (auth.uid() = id);

-- 2. CANDIDATE_PROFILES
CREATE TABLE IF NOT EXISTS candidate_profiles (
    id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT,
    email TEXT UNIQUE,
    github_url TEXT,
    resume_link TEXT,
    target_roles TEXT[],
    location TEXT,
    compensation_min INTEGER,
    compensation_max INTEGER,
    search_urgency TEXT,
    bio TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    source VARCHAR
);
ALTER TABLE candidate_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY candidate_profiles_self_access ON candidate_profiles 
    FOR ALL TO authenticated 
    USING (auth.uid() = id) 
    WITH CHECK (auth.uid() = id);

-- 3. PROOF_PROFILES
CREATE TABLE IF NOT EXISTS proof_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    summary TEXT,
    proof_completeness DOUBLE PRECISION,
    proof_strength DOUBLE PRECISION,
    inferred_capabilities TEXT[],
    top_work_examples JSONB,
    verification_readiness TEXT,
    recommended_next_action TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE proof_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY proof_profiles_candidate_self ON proof_profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = candidate_id);

-- 4. HIRING_RUNS
CREATE TABLE IF NOT EXISTS hiring_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    role_title TEXT,
    job_description TEXT,
    must_haves TEXT[],
    nice_to_haves TEXT[],
    disqualifiers TEXT[],
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    company TEXT,
    company_stage TEXT,
    hiring_notes TEXT,
    brief_json JSONB,
    crustdata_credits_spent INTEGER DEFAULT 0,
    location TEXT
);
ALTER TABLE hiring_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY hiring_runs_employer_owner ON hiring_runs 
    FOR ALL TO authenticated 
    USING (auth.uid() = employer_id) 
    WITH CHECK (auth.uid() = employer_id);

-- 5. SOURCING_SESSIONS
CREATE TABLE IF NOT EXISTS sourcing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hiring_run_id UUID REFERENCES hiring_runs(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'active',
    profiles_scanned INTEGER DEFAULT 0,
    shortlisted_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    employer_id UUID REFERENCES profiles(id) ON DELETE CASCADE
);
ALTER TABLE sourcing_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY sourcing_sessions_employer_owner ON sourcing_sessions 
    FOR ALL TO authenticated 
    USING (auth.uid() = employer_id) 
    WITH CHECK (auth.uid() = employer_id);

-- 6. CANDIDATES
CREATE TABLE IF NOT EXISTS candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hiring_run_id UUID REFERENCES hiring_runs(id) ON DELETE CASCADE,
    candidate_id UUID REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    fit_score DOUBLE PRECISION,
    status TEXT DEFAULT 'new',
    highlights TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    fit_summary TEXT,
    decision_packet JSONB
);
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;

-- Scoped employer owner policy using explicit EXISTS subquery
CREATE POLICY candidates_employer_owner ON candidates 
    FOR ALL TO authenticated 
    USING (EXISTS (SELECT 1 FROM hiring_runs h WHERE h.id = candidates.hiring_run_id AND h.employer_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM hiring_runs h WHERE h.id = candidates.hiring_run_id AND h.employer_id = auth.uid()));

CREATE POLICY candidates_self_access ON candidates 
    FOR SELECT TO authenticated 
    USING (candidates.candidate_id = auth.uid());

-- 7. SCREENING_SESSIONS
CREATE TABLE IF NOT EXISTS screening_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    hiring_run_id UUID REFERENCES hiring_runs(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'not_started',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);
ALTER TABLE screening_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY screening_sessions_candidate_self ON screening_sessions
    FOR ALL TO authenticated
    USING (auth.uid() = candidate_id)
    WITH CHECK (auth.uid() = candidate_id);

CREATE POLICY screening_sessions_employer_owner ON screening_sessions
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM hiring_runs h WHERE h.id = screening_sessions.hiring_run_id AND h.employer_id = auth.uid()));

-- 8. SCREENING_ANSWERS
CREATE TABLE IF NOT EXISTS screening_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES screening_sessions(id) ON DELETE CASCADE,
    question_index INTEGER,
    answer_text TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_screening_answers_session_question UNIQUE (session_id, question_index)
);
ALTER TABLE screening_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY screening_answers_session_owner ON screening_answers
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM screening_sessions s WHERE s.id = screening_answers.session_id AND s.candidate_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM screening_sessions s WHERE s.id = screening_answers.session_id AND s.candidate_id = auth.uid()));

-- 9. SCREENING_SUMMARIES
CREATE TABLE IF NOT EXISTS screening_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID UNIQUE REFERENCES screening_sessions(id) ON DELETE CASCADE,
    summary_text TEXT,
    technical_score DOUBLE PRECISION,
    communication_score DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE screening_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY screening_summaries_read ON screening_summaries
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM screening_sessions s
        JOIN hiring_runs h ON s.hiring_run_id = h.id
        WHERE s.id = screening_summaries.session_id AND (s.candidate_id = auth.uid() OR h.employer_id = auth.uid())
    ));

-- 10. ACTIVITY_EVENTS
CREATE TABLE IF NOT EXISTS activity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES screening_sessions(id) ON DELETE SET NULL,
    event_type TEXT,
    title TEXT,
    description TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_events_read ON activity_events
    FOR SELECT TO authenticated
    USING (TRUE);

-- 11. SCHEDULED_EMAILS
CREATE TABLE IF NOT EXISTS scheduled_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    candidate_id UUID REFERENCES candidate_profiles(id) ON DELETE CASCADE,
    sequence_day INTEGER,
    scheduled_for TIMESTAMPTZ,
    subject TEXT,
    body TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    error_details TEXT,
    sent_at TIMESTAMPTZ
);
ALTER TABLE scheduled_emails ENABLE ROW LEVEL SECURITY;

-- Standard PostgREST Role Grants and Privilege Revocations
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Internal worker table safety: Revoke client access
REVOKE ALL ON scheduled_emails FROM anon, authenticated;

