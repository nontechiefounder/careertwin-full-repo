-- Target Staging Synthetic Seed Fixtures (Step 4B5.2-D1.4)
-- Synthetic Data Only — No Real Personal Data, Credentials or Production IDs

-- 0. SYNTHETIC LOCAL AUTH USERS (Conditional for local Supabase execution)
DO $$
DECLARE
    has_email_confirmed_at BOOLEAN;
    has_writable_confirmed_at BOOLEAN;
    confirmed_col_clause TEXT := '';
    confirmed_val_clause TEXT := '';
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'email_confirmed_at'
        ) INTO has_email_confirmed_at;

        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'auth' AND table_name = 'users' AND column_name = 'confirmed_at'
              AND (is_generated = 'NO' OR is_generated IS NULL)
        ) INTO has_writable_confirmed_at;

        IF has_email_confirmed_at THEN
            confirmed_col_clause := ', email_confirmed_at';
            confirmed_val_clause := ', NOW()';
        ELSIF has_writable_confirmed_at THEN
            confirmed_col_clause := ', confirmed_at';
            confirmed_val_clause := ', NOW()';
        END IF;

        EXECUTE format('
            INSERT INTO auth.users (id, email, instance_id, aud, role, encrypted_password%s, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) VALUES
            (''00000000-0000-4000-a000-000000000001'', ''synthetic.employer.alpha@example.invalid'', ''00000000-0000-0000-0000-000000000000'', ''authenticated'', ''authenticated'', ''$2a$10$iLbyr/tW7c44/ykFF9Uw7eOucJuf71fdamiDqDBav0roVGLZiMBGK''%s, ''{"provider":"email","providers":["email"]}'', ''{}'', NOW(), NOW()),
            (''00000000-0000-4000-a000-000000000002'', ''synthetic.employer.beta@example.invalid'', ''00000000-0000-0000-0000-000000000000'', ''authenticated'', ''authenticated'', ''$2a$10$iLbyr/tW7c44/ykFF9Uw7eOucJuf71fdamiDqDBav0roVGLZiMBGK''%s, ''{"provider":"email","providers":["email"]}'', ''{}'', NOW(), NOW()),
            (''00000000-0000-4000-a000-000000000003'', ''synthetic.employer.alpha.recruiter@example.invalid'', ''00000000-0000-0000-0000-000000000000'', ''authenticated'', ''authenticated'', ''$2a$10$iLbyr/tW7c44/ykFF9Uw7eOucJuf71fdamiDqDBav0roVGLZiMBGK''%s, ''{"provider":"email","providers":["email"]}'', ''{}'', NOW(), NOW()),
            (''00000000-0000-4000-a000-000000000004'', ''synthetic.employer.alpha.auditor@example.invalid'', ''00000000-0000-0000-0000-000000000000'', ''authenticated'', ''authenticated'', ''$2a$10$iLbyr/tW7c44/ykFF9Uw7eOucJuf71fdamiDqDBav0roVGLZiMBGK''%s, ''{"provider":"email","providers":["email"]}'', ''{}'', NOW(), NOW()),
            (''00000000-0000-4000-b000-000000000001'', ''synthetic.candidate.one@example.invalid'', ''00000000-0000-0000-0000-000000000000'', ''authenticated'', ''authenticated'', ''$2a$10$iLbyr/tW7c44/ykFF9Uw7eOucJuf71fdamiDqDBav0roVGLZiMBGK''%s, ''{"provider":"email","providers":["email"]}'', ''{}'', NOW(), NOW()),
            (''00000000-0000-4000-b000-000000000002'', ''synthetic.candidate.two@example.invalid'', ''00000000-0000-0000-0000-000000000000'', ''authenticated'', ''authenticated'', ''$2a$10$iLbyr/tW7c44/ykFF9Uw7eOucJuf71fdamiDqDBav0roVGLZiMBGK''%s, ''{"provider":"email","providers":["email"]}'', ''{}'', NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET
                encrypted_password = EXCLUDED.encrypted_password,
                email = EXCLUDED.email,
                raw_app_meta_data = EXCLUDED.raw_app_meta_data,
                updated_at = NOW()',
            confirmed_col_clause,
            confirmed_val_clause, confirmed_val_clause, confirmed_val_clause, confirmed_val_clause, confirmed_val_clause, confirmed_val_clause
        );
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

-- 5. SYNTHETIC HIRING_RUNS (with org_id linked and approved rubric brief_json)
INSERT INTO hiring_runs (id, employer_id, org_id, role_title, status, company, brief_json) VALUES
    ('11111111-1111-4111-a111-111111111111', '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-c000-000000000001', 'Synthetic Senior Engineer (Run Alpha)', 'active', 'Alpha Corp',
     '{"must_haves": ["PostgreSQL", "Distributed Systems", "Go", "Kubernetes"], "approved_at": "2026-10-03T00:09:06.155Z", "approved_by": "00000000-0000-4000-a000-000000000001", "role_summary": "Senior Engineer specializing in PostgreSQL internal architecture, distributed consensus, and Go services.", "contract_version": "1.0.0", "contract_approved": true, "approved_rubric_version": "1.0.0"}'::jsonb),
    ('22222222-2222-4222-a222-222222222222', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-c000-000000000002', 'Synthetic Product Manager (Run Beta)', 'active', 'Beta Inc',
     '{"must_haves": ["Machine Learning", "CUDA", "PyTorch"], "approved_at": "2026-10-03T00:00:00Z", "approved_by": "00000000-0000-4000-a000-000000000001", "contract_version": "1.0.0", "contract_approved": true, "approved_rubric_version": "1.0.0"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
    brief_json = EXCLUDED.brief_json,
    status = EXCLUDED.status,
    role_title = EXCLUDED.role_title;

-- 6. SYNTHETIC CANDIDATES
INSERT INTO candidates (id, hiring_run_id, candidate_id, fit_score, status) VALUES
    ('33333333-3333-4333-a333-333333333333', '11111111-1111-4111-a111-111111111111', '00000000-0000-4000-b000-000000000001', 0.925, 'screened'),
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

-- 12. SYNTHETIC CANDIDATE_DOCUMENTS
INSERT INTO candidate_documents (id, candidate_id, hiring_run_id, org_id, filename, file_sha256, normalized_text, normalized_text_sha256, mime_type, byte_size, parser_name) VALUES
    ('d0c00001-0000-4000-a000-000000000001', '00000000-0000-4000-b000-000000000001', '11111111-1111-4111-a111-111111111111', '00000000-0000-4000-c000-000000000001', 'synthetic_candidate_one_resume.pdf', 'fd6f04025df21211496bb205aaf05de21623fbc68f115f68b2f066498fb7f1f2', 'Synthetic Candidate One. Principal Systems Architect with 10+ years engineering high-concurrency distributed databases, consensus protocols, and PostgreSQL engine internals. Designed distributed WAL replication and zero-downtime consensus mechanisms. Built Go microservices and event queues. Candidate has no Kubernetes experience or cluster management background.', 'fd6f04025df21211496bb205aaf05de21623fbc68f115f68b2f066498fb7f1f2', 'application/pdf', 364, '1.0.0-docling')
ON CONFLICT (id) DO UPDATE SET
    file_sha256 = EXCLUDED.file_sha256,
    normalized_text_sha256 = EXCLUDED.normalized_text_sha256;
