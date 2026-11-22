# Step 4B5.2-D1.1 Execution Evidence

**Date:** August 3, 2026  
**Task:** Corrected baseline migration audit, complete field inventory, synthetic auth seed validation, test results, quality gates, and package integrity for Step 4B5.2-D1.1.

---

## 1. Complete Field Inventory & DDL Audit

```
Migration File: supabase/migrations/20260803000001_operational_schema_baseline.sql
Target Staging Operational Baseline (Step 4B5.2-D1.1)

1. profiles (id UUID PK -> auth.users, email TEXT UNIQUE, name TEXT, role TEXT, company TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, gmail_connected BOOLEAN, gmail_email TEXT, gmail_refresh_token TEXT)
2. candidate_profiles (id UUID PK -> profiles, name TEXT, email TEXT UNIQUE, github_url TEXT, resume_link TEXT, target_roles TEXT[], location TEXT, compensation_min INT, compensation_max INT, search_urgency TEXT, bio TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, source VARCHAR)
3. proof_profiles (id UUID PK, candidate_id UUID FK -> candidate_profiles, summary TEXT, proof_completeness FLOAT8, proof_strength FLOAT8, inferred_capabilities TEXT[], top_work_examples JSONB, verification_readiness TEXT, recommended_next_action TEXT, created_at TIMESTAMPTZ)
4. hiring_runs (id UUID PK, employer_id UUID FK -> profiles, role_title TEXT, job_description TEXT, must_haves TEXT[], nice_to_haves TEXT[], disqualifiers TEXT[], status TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, company TEXT, company_stage TEXT, hiring_notes TEXT, brief_json JSONB, crustdata_credits_spent INT, location TEXT)
5. sourcing_sessions (id UUID PK, hiring_run_id UUID FK -> hiring_runs, status TEXT, profiles_scanned INT, shortlisted_count INT, created_at TIMESTAMPTZ, employer_id UUID FK -> profiles)
6. candidates (id UUID PK, hiring_run_id UUID FK -> hiring_runs, candidate_id UUID FK -> candidate_profiles, fit_score FLOAT8, status TEXT, highlights TEXT[], created_at TIMESTAMPTZ, fit_summary TEXT, decision_packet JSONB)
7. screening_sessions (id UUID PK, candidate_id UUID FK -> candidate_profiles, hiring_run_id UUID FK -> hiring_runs, status TEXT, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ)
8. screening_answers (id UUID PK, session_id UUID FK -> screening_sessions, question_index INT, answer_text TEXT, created_at TIMESTAMPTZ)
9. screening_summaries (id UUID PK, session_id UUID UNIQUE FK -> screening_sessions, summary_text TEXT, technical_score FLOAT8, communication_score FLOAT8, created_at TIMESTAMPTZ)
10. activity_events (id UUID PK, session_id UUID FK -> screening_sessions, event_type TEXT, title TEXT, description TEXT, timestamp TIMESTAMPTZ)
11. scheduled_emails (id UUID PK, employer_id UUID FK -> profiles, candidate_id UUID FK -> candidate_profiles, sequence_day INT, scheduled_for TIMESTAMPTZ, subject TEXT, body TEXT, status TEXT, created_at TIMESTAMPTZ, error_details TEXT, sent_at TIMESTAMPTZ)
```

---

## 2. Automated Schema Contract Test Output

- **Test Suite File:** `apps/web/__tests__/security/LocalSchemaContract.test.js`
- **Command:** `npm exec --offline vitest run apps/web/__tests__/security/LocalSchemaContract.test.js`
- **Results:**
  - `✓ 1. Migration file exists in repository source control`
  - `✓ 2. Complete literal operational tables are created in baseline migration`
  - `✓ 3. Complete literal documented columns exist for candidate_profiles`
  - `✓ 4. Complete literal documented columns exist for proof_profiles`
  - `✓ 5. Complete literal documented columns exist for hiring_runs`
  - `✓ 6. Complete literal documented columns exist for sourcing_sessions and candidates`
  - `✓ 7. Screening_summaries.session_id contains UNIQUE constraint`
  - `✓ 8. Row Level Security (RLS) is enabled on all 11 operational tables`
  - `✓ 9. Candidates table RLS uses explicit EXISTS query and NOT permissive USING true`
  - `✓ 10. Baseline migration does NOT pre-approve unevidenced candidates.user_id column`
  - `✓ 11. Scheduled_emails revokes client access explicitly`
  - `✓ 12. Alembic-only future domain tables are absent from local operational baseline`
  - `✓ 13. Synthetic seed file contains conditional auth.users insertion and zero credential patterns`

---

## 3. Quality Gates Verification Output

- **Application ESLint Output:** `npm exec --offline eslint -- .`
  - Total Errors: **0**
  - Total Warnings: **3** (W07, W08, W09 — `@next/next/no-img-element` in `NaiveShell.jsx`, `MarketingFooter.jsx`, `MarketingNav.jsx`)
- **Full Vitest Test Suite Output:** `npm exec --offline vitest run`
  - Test Files: **16 passed (16)**
  - Total Tests: **171 passed (171)**
- **Next.js Production Build:** `node node_modules/next/dist/bin/next build`
  - Exit Code: **0**
  - Compiled Page Routes: **21 static/dynamic page routes**
  - Compiled API Route Files: **28 route files**
  - Compiled HTTP Method Handlers: **30 method handlers**

---

## 4. Source Integrity & Credential Boundary

- [x] Production application source code (`apps/web/app/**` excluding tests): **ZERO MODIFICATIONS**
- [x] API route handlers (`apps/web/app/api/**`): **ZERO MODIFICATIONS**
- [x] Authentication helpers (`apps/web/lib/serverAuth.js`, `supabaseServer.js`): **ZERO MODIFICATIONS**
- [x] Remote database connections made: **ZERO CONNECTIONS MADE**
- [x] Credentials read, requested, or exposed: **ZERO CREDENTIALS READ OR EXPOSED**
- [x] Supabase CLI remote project links created: **ZERO REMOTE LINKS CREATED**
- [x] Real candidate or employer records copied: **ZERO REAL RECORDS COPIED**
- [x] New documentation created: Exactly 2 Markdown files under `docs/architecture/checkpoints/step4b5-2-d1-1/`
- [x] `package.json` SHA256: `4c6f469f83690a45f50a77de1265e194da2459d8009a9b174a476de7e1b298bc` (Unchanged)
- [x] `package-lock.json` SHA256: `5e2b91af2a5cca1863026532467b7e6a7c6fccb90f2355554c99fd128bb77365` (Unchanged)
- [x] Git remote: None
- [x] Push / Deployment: None
