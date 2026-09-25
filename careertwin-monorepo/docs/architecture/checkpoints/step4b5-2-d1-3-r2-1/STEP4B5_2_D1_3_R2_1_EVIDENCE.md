# Step 4B5.2-D1.3-R2.1 Execution Evidence

**Date:** August 3, 2026  
**Task:** GoTrue Auth user creation, GoTrue JWT issuance, PostgREST RLS execution matrix across all 11 public tables, exact database constraint & policy inventory, database linting, and quality gates for Step 4B5.2-D1.3-R2.1.

---

## 1. Supported GoTrue User Creation & Sign-in Output

```bash
POST /auth/v1/signup
# Body: {"email": "gotrue.employer.alpha@example.invalid", "password": "Password123!"}
# Response: HTTP 200 OK
# Payload: {"access_token": "[LOCAL_EPHEMERAL_BEARER_JWT]", "token_type": "bearer", "user": {"id": "43ceb242-b7e5-4b40-b71f-544622245323", "email": "gotrue.employer.alpha@example.invalid"}}
```

```bash
GET /auth/v1/user
# Header: Authorization: Bearer [LOCAL_EPHEMERAL_BEARER_JWT]
# Response: HTTP 200 OK
# Payload: {"id": "43ceb242-b7e5-4b40-b71f-544622245323", "email": "gotrue.employer.alpha@example.invalid", "aud": "authenticated", "role": "authenticated"}
```

- **GoTrue Synthetic Accounts Created:**
  - `gotrue.employer.alpha@example.invalid`
  - `gotrue.employer.beta@example.invalid`
  - `gotrue.candidate.one@example.invalid`
  - `gotrue.candidate.two@example.invalid`

---

## 2. Supabase Database Security Linting Output

```bash
npx supabase db lint
# Output:
# Connecting to local database...
# Linting schema: extensions
# Linting schema: public
# No schema errors found
# {"results":[],"message":"db lint"}
```

---

## 3. Exact Database Constraint & Policy Inventory Output (pg_catalog / information_schema)

### Primary Key Constraints (11)
- `activity_events_pkey` (`activity_events`)
- `candidate_profiles_pkey` (`candidate_profiles`)
- `candidates_pkey` (`candidates`)
- `hiring_runs_pkey` (`hiring_runs`)
- `profiles_pkey` (`profiles`)
- `proof_profiles_pkey` (`proof_profiles`)
- `scheduled_emails_pkey` (`scheduled_emails`)
- `screening_answers_pkey` (`screening_answers`)
- `screening_sessions_pkey` (`screening_sessions`)
- `screening_summaries_pkey` (`screening_summaries`)
- `sourcing_sessions_pkey` (`sourcing_sessions`)

### Non-Primary UNIQUE Constraints (4)
- `candidate_profiles_email_key` (`candidate_profiles`)
- `profiles_email_key` (`profiles`)
- `uq_screening_answers_session_question` (`screening_answers`)
- `screening_summaries_session_id_key` (`screening_summaries`)

### Foreign Key Constraints (15)
- `activity_events_session_id_fkey` (`activity_events`)
- `candidate_profiles_id_fkey` (`candidate_profiles`)
- `candidates_candidate_id_fkey` (`candidates`)
- `candidates_hiring_run_id_fkey` (`candidates`)
- `hiring_runs_employer_id_fkey` (`hiring_runs`)
- `profiles_id_fkey` (`profiles`)
- `proof_profiles_candidate_id_fkey` (`proof_profiles`)
- `scheduled_emails_employer_id_fkey` (`scheduled_emails`)
- `scheduled_emails_candidate_id_fkey` (`scheduled_emails`)
- `screening_answers_session_id_fkey` (`screening_answers`)
- `screening_sessions_candidate_id_fkey` (`screening_sessions`)
- `screening_sessions_hiring_run_id_fkey` (`screening_sessions`)
- `screening_summaries_session_id_fkey` (`screening_summaries`)
- `sourcing_sessions_employer_id_fkey` (`sourcing_sessions`)
- `sourcing_sessions_hiring_run_id_fkey` (`sourcing_sessions`)

### Active RLS Policies in `pg_policies` (12)
1. `activity_events` -> `activity_events_read` (SELECT, `true`)
2. `candidate_profiles` -> `candidate_profiles_self_access` (ALL, `auth.uid() = id`)
3. `candidates` -> `candidates_employer_owner` (ALL, `EXISTS hiring_runs`)
4. `candidates` -> `candidates_self_access` (SELECT, `candidate_id = auth.uid()`)
5. `hiring_runs` -> `hiring_runs_employer_owner` (ALL, `auth.uid() = employer_id`)
6. `profiles` -> `profiles_self_access` (ALL, `auth.uid() = id`)
7. `proof_profiles` -> `proof_profiles_candidate_self` (SELECT, `auth.uid() = candidate_id`)
8. `screening_answers` -> `screening_answers_session_owner` (ALL, `EXISTS screening_sessions`)
9. `screening_sessions` -> `screening_sessions_candidate_self` (ALL, `auth.uid() = candidate_id`)
10. `screening_sessions` -> `screening_sessions_employer_owner` (SELECT, `EXISTS hiring_runs`)
11. `screening_summaries` -> `screening_summaries_read` (SELECT, `EXISTS screening_sessions JOIN hiring_runs`)
12. `sourcing_sessions` -> `sourcing_sessions_employer_owner` (ALL, `auth.uid() = employer_id`)

*(Note: Table `scheduled_emails` has RLS enabled with **0 policies**, enforcing 100% denial for authenticated and anonymous clients via `REVOKE ALL`)*

---

## 4. Full PostgREST HTTP RLS Test Suite Output

- **Test Suite File:** `apps/web/__tests__/security/FullSupabaseRuntimeValidation.test.js`
- **Command:** `npm exec --offline vitest run __tests__/security/FullSupabaseRuntimeValidation.test.js`
- **Results:**
  - `✓ PART 3.1: GoTrue Auth signup/signin succeeds and issues genuine access token`
  - `✓ PART 3.2: GoTrue /auth/v1/user verifies synthetic identity with GoTrue-issued token`
  - `✓ PART 4.1: PostgREST accepts GoTrue-issued token and resolves auth.uid()`
  - `✓ PART 4.2: Negative auth tests — absent, malformed, or forged tokens do not establish identity`
  - `✓ TABLE 1: Profiles — own read/update allowed, cross-user read/update denied`
  - `✓ TABLE 2: Candidate Profiles — own read/update allowed, cross-candidate read/update denied`
  - `✓ TABLE 3: Proof Profiles — candidate own read allowed, cross-candidate denied, employer read behavior recorded`
  - `✓ TABLE 4: Hiring Runs — employer own read/create/update allowed, cross-employer denied`
  - `✓ TABLE 5: Sourcing Sessions — employer own read/create allowed, cross-employer denied`
  - `✓ TABLE 6: Candidates — candidate self-read, employer own-run read allowed, cross-tenant & candidate write denied`
  - `✓ TABLE 7: Screening Sessions — candidate self-read, employer own-run read, approved write allowed; cross-tenant denied`
  - `✓ TABLE 8: Screening Answers — session owner read/write allowed, cross-session denied, unique conflict constraint retained`
  - `✓ TABLE 9: Screening Summaries — authorized candidate/employer read allowed, cross-session denied, client mutation denied`
  - `✓ TABLE 10: Activity Events — authorized read allowed, client mutation denied`
  - `✓ TABLE 11: Scheduled Emails — anonymous and authenticated access completely denied`
  - `✓ TABLE 12: Anonymous Client — cannot retrieve protected rows from ANY of the 11 tables`

---

## 5. Quality Gates Verification Output

- **Application ESLint Output:** `npm exec --offline eslint -- .`
  - Total Errors: **0**
  - Total Warnings: **3** (W07, W08, W09 — `@next/next/no-img-element` in `NaiveShell.jsx`, `MarketingFooter.jsx`, `MarketingNav.jsx`)
- **Full Vitest Test Suite Output:** `npm exec --offline vitest run`
  - Test Files: **18 passed (18)**
  - Total Tests: **194 passed (194)**
- **Next.js Production Build:** `node node_modules/next/dist/bin/next build`
  - Exit Code: **0**
  - Compiled Page Routes: **21 static/dynamic page routes**
  - Compiled API Route Files: **28 route files**
  - Compiled HTTP Method Handlers: **30 method handlers**

---

## 6. Source Integrity & Remote Boundary

- [x] Production application source code (`apps/web/app/**` excluding tests): **ZERO MODIFICATIONS**
- [x] API route handlers (`apps/web/app/api/**`): **ZERO MODIFICATIONS**
- [x] Authentication helpers (`apps/web/lib/serverAuth.js`, `supabaseServer.js`): **ZERO MODIFICATIONS**
- [x] Remote database connections made: **ZERO CONNECTIONS MADE**
- [x] Credentials read, requested, or exposed: **ZERO CREDENTIALS READ OR EXPOSED**
- [x] Supabase CLI remote project links created: **ZERO REMOTE LINKS CREATED**
- [x] Real candidate or employer records copied: **ZERO REAL RECORDS COPIED**
- [x] AI providers invoked: **ZERO CALLS MADE**
- [x] New documentation created: Exactly 2 Markdown files under `docs/architecture/checkpoints/step4b5-2-d1-3-r2-1/`
- [x] `package.json` SHA256: `4c6f469f83690a45f50a77de1265e194da2459d8009a9b174a476de7e1b298bc` (Unchanged)
- [x] `package-lock.json` SHA256: `5e2b91af2a5cca1863026532467b7e6a7c6fccb90f2355554c99fd128bb77365` (Unchanged)
- [x] Git remote: None
- [x] Push / Deployment: None
