-- Target Staging Synthetic Seed Fixtures (Step 4B5.2-D1.4)
-- Synthetic Data Only — No Real Personal Data, Credentials or Production IDs

-- 0. SYNTHETIC LOCAL AUTH USERS (Conditional for local Supabase execution)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
        INSERT INTO auth.users (id, email, instance_id, aud, role, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
        ('00000000-0000-4000-a000-000000000001', 'synthetic.employer.alpha@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW()),
        ('00000000-0000-4000-a000-000000000002', 'synthetic.employer.beta@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW()),
        ('00000000-0000-4000-a000-000000000003', 'synthetic.employer.alpha.recruiter@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW()),
        ('00000000-0000-4000-a000-000000000004', 'synthetic.employer.alpha.auditor@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW()),
        ('00000000-0000-4000-b000-000000000001', 'synthetic.candidate.one@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW()),
        ('00000000-0000-4000-b000-000000000002', 'synthetic.candidate.two@example.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '', NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING;
    END IF;
END $$;

-- 1. SYNTHETIC PROFILES
INSERT INTO profiles (id, email, name, role, company) VALUES
    ('00000000-0000-4000-a000-000000000001', 'synthetic.employer.alpha@example.invalid', 'Synthetic Employer Alpha Owner', 'employer', 'Alpha Corp'),
    ('00000000-0000-4000-a000-000000000002', 'synthetic.employer.beta@example.invalid', 'Synthetic Employer Beta Owner', 'employer', 'Beta Inc'),
    ('00000000-0000-4000-a000-000000000003', 'synthetic.employer.alpha.recruiter@example.invalid', 'Synthetic Alpha Recruiter', 'employer', 'Alpha Corp'),
    ('00000000-0000-4000-a000-000000000004', 'synthetic.employer.alpha.auditor@example.invalid', 'Synthetic Alpha Auditor', 'employer', 'Alpha Corp'),
    ('00000000-0000-4000-b000-000000000001', 'synthetic.candidate.one@example.invalid', 'Synthetic Candidate One', 'candidate', NULL),
    ('00000000-0000-4000-b000-000000000002', 'synthetic.candidate.two@example.invalid', 'Synthetic Candidate Two', 'candidate', NULL)
ON CONFLICT (id) DO NOTHING;

-- 2. SYNTHETIC ORGANIZATIONS (valid UUID hex digits c000)
INSERT INTO organizations (id, name, created_by) VALUES
    ('00000000-0000-4000-c000-000000000001', 'Organization Alpha Corp', '00000000-0000-4000-a000-000000000001'),
    ('00000000-0000-4000-c000-000000000002', 'Organization Beta Inc', '00000000-0000-4000-a000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- 3. SYNTHETIC ORGANIZATION MEMBERSHIPS
INSERT INTO organization_memberships (organization_id, user_id, membership_role, membership_status) VALUES
    ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000001', 'owner', 'active'),
    ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000003', 'recruiter', 'active'),
    ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-a000-000000000004', 'auditor', 'active'),
    ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-a000-000000000002', 'owner', 'active')
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- 4. SYNTHETIC CANDIDATE_PROFILES
INSERT INTO candidate_profiles (id, name, email, target_roles, location) VALUES
    ('00000000-0000-4000-b000-000000000001', 'Synthetic Candidate One', 'synthetic.candidate.one@example.invalid', ARRAY['Full Stack Engineer'], 'Remote'),
    ('00000000-0000-4000-b000-000000000002', 'Synthetic Candidate Two', 'synthetic.candidate.two@example.invalid', ARRAY['Backend Engineer'], 'San Francisco, CA')
ON CONFLICT (id) DO NOTHING;

-- 5. SYNTHETIC HIRING_RUNS (with org_id linked)
INSERT INTO hiring_runs (id, employer_id, org_id, role_title, status, company) VALUES
    ('11111111-1111-4111-a111-111111111111', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000001', 'Synthetic Senior Engineer (Run Alpha)', 'active', 'Alpha Corp'),
    ('22222222-2222-4222-a222-222222222222', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-c000-000000000002', 'Synthetic Product Manager (Run Beta)', 'active', 'Beta Inc')
ON CONFLICT (id) DO NOTHING;

-- 6. SYNTHETIC CANDIDATES
INSERT INTO candidates (id, hiring_run_id, candidate_id, fit_score, status) VALUES
    ('33333333-3333-4333-a333-333333333333', '11111111-1111-4111-a111-111111111111', '00000000-0000-4000-b000-000000000001', 92.5, 'screened'),
    ('44444444-4444-4444-a444-444444444444', '22222222-2222-4222-a222-222222222222', '00000000-0000-4000-b000-000000000002', 88.0, 'new')
ON CONFLICT (id) DO NOTHING;

-- 7. SYNTHETIC PROOF_PROFILES
INSERT INTO proof_profiles (id, candidate_id, summary, proof_completeness, proof_strength) VALUES
    ('55555555-5555-4555-a555-555555555555', '00000000-0000-4000-b000-000000000001', 'Synthetic verified technical proof summary.', 0.95, 0.90)
ON CONFLICT (id) DO NOTHING;

-- 8. SYNTHETIC SCREENING_SESSIONS
INSERT INTO screening_sessions (id, candidate_id, hiring_run_id, status) VALUES
    ('66666666-6666-4666-a666-666666666666', '00000000-0000-4000-b000-000000000001', '11111111-1111-4111-a111-111111111111', 'completed'),
    ('88888888-8888-4888-b888-888888888888', '00000000-0000-4000-b000-000000000002', '22222222-2222-4222-a222-222222222222', 'in_progress')
ON CONFLICT (id) DO NOTHING;

-- 9. SYNTHETIC SCREENING_ANSWERS
INSERT INTO screening_answers (id, session_id, question_index, answer_text) VALUES
    ('77777777-7777-4777-a777-777777777777', '66666666-6666-4666-a666-666666666666', 0, 'Synthetic answer text for question index 0')
ON CONFLICT (id) DO NOTHING;

-- 10. SYNTHETIC SCREENING_SUMMARIES
INSERT INTO screening_summaries (id, session_id, summary_text, technical_score, communication_score) VALUES
    ('88888888-8888-4888-a888-888888888888', '66666666-6666-4666-a666-666666666666', 'Synthetic technical screening summary text.', 85.0, 90.0)
ON CONFLICT (id) DO NOTHING;

-- 11. SYNTHETIC ACTIVITY_EVENTS (Separate for Org Alpha and Org Beta sessions)
INSERT INTO activity_events (id, session_id, event_type, title, description, timestamp) VALUES
    ('e1111111-1111-4111-a111-111111111111', '66666666-6666-4666-a666-666666666666', 'session_started', 'Alpha Session Started', 'Synthetic Alpha activity event', NOW()),
    ('e2222222-2222-4222-b222-222222222222', '88888888-8888-4888-b888-888888888888', 'session_started', 'Beta Session Started', 'Synthetic Beta activity event', NOW())
ON CONFLICT (id) DO NOTHING;
