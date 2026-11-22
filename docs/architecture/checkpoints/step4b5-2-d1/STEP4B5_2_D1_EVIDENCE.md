# Step 4B5.2-D1 Execution Evidence

**Date:** August 3, 2026  
**Task:** Local Supabase baseline migration audit, synthetic seed validation, contract test results, quality gates, and package integrity for Step 4B5.2-D1.

---

## 1. Local Migration DDL & Table Inventory

```
Migration File: supabase/migrations/20260803000001_operational_schema_baseline.sql
Target Staging Operational Baseline (Step 4B5.2-D1)

Tables Created (11):
1. profiles (id UUID PK, email TEXT, name TEXT, role TEXT, created_at TIMESTAMPTZ, gmail_refresh_token TEXT)
2. candidate_profiles (id UUID PK, created_at TIMESTAMPTZ)
3. proof_profiles (id UUID PK, candidate_id UUID FK, created_at TIMESTAMPTZ)
4. hiring_runs (id UUID PK, employer_id UUID FK, role_title TEXT, status TEXT, created_at TIMESTAMPTZ)
5. sourcing_sessions (id UUID PK, employer_id UUID FK, status TEXT, created_at TIMESTAMPTZ)
6. candidates (id UUID PK, hiring_run_id UUID FK, candidate_id UUID FK, status TEXT, created_at TIMESTAMPTZ)
7. screening_sessions (id UUID PK, candidate_id UUID FK, hiring_run_id UUID FK, status TEXT, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ)
8. screening_answers (id UUID PK, session_id UUID FK, question_index INT, answer_text TEXT, created_at TIMESTAMPTZ)
9. screening_summaries (id UUID PK, session_id UUID FK, summary_text TEXT, technical_score NUMERIC, communication_score NUMERIC, created_at TIMESTAMPTZ)
10. activity_events (id UUID PK, session_id UUID FK, event_type TEXT, title TEXT, description TEXT, timestamp TIMESTAMPTZ)
11. scheduled_emails (id UUID PK, employer_id UUID FK, candidate_id UUID FK, sequence_day INT, scheduled_for TIMESTAMPTZ, subject TEXT, body TEXT, status TEXT, created_at TIMESTAMPTZ, error_details TEXT, sent_at TIMESTAMPTZ)
```

---

## 2. Automated Schema Contract Test Output

- **Test Suite File:** `apps/web/__tests__/security/LocalSchemaContract.test.js`
- **Command:** `npm exec --offline vitest run apps/web/__tests__/security/LocalSchemaContract.test.js`
- **Results:**
  - `✓ 1. Migration file exists in repository source control`
  - `✓ 2. Exactly the 11 literal operational tables are created in baseline migration`
  - `✓ 3. Row Level Security (RLS) is enabled on all 11 operational tables`
  - `✓ 4. Candidates table does NOT contain permissive USING true or WITH CHECK true policies`
  - `✓ 5. Baseline migration does NOT pre-approve unevidenced candidates.user_id column`
  - `✓ 6. Alembic-only future domain tables are absent from local operational baseline`
  - `✓ 7. Synthetic seed file exists and contains zero credential patterns or live emails`

---

## 3. Quality Gates Verification Output

- **Application ESLint Output:** `npm exec --offline eslint -- .`
  - Total Errors: **0**
  - Total Warnings: **3** (W07, W08, W09 — `@next/next/no-img-element` in `NaiveShell.jsx`, `MarketingFooter.jsx`, `MarketingNav.jsx`)
- **Full Vitest Test Suite Output:** `npm exec --offline vitest run`
  - Test Files: **16 passed (16)**
  - Total Tests: **165 passed (165)**
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
- [x] New documentation created: Exactly 2 Markdown files under `docs/architecture/checkpoints/step4b5-2-d1/`
- [x] `package.json` SHA256: `4c6f469f83690a45f50a77de1265e194da2459d8009a9b174a476de7e1b298bc` (Unchanged)
- [x] `package-lock.json` SHA256: `5e2b91af2a5cca1863026532467b7e6a7c6fccb90f2355554c99fd128bb77365` (Unchanged)
- [x] Git remote: None
- [x] Push / Deployment: None
