# Step 4B5.2-D1.3-R2 Execution Evidence

**Date:** August 3, 2026  
**Task:** Local Supabase container stack status, PostgREST HTTP RLS matrix results, database linting, quality gates, and package integrity for Step 4B5.2-D1.3-R2.

---

## 1. Local Container Stack & Engine Status

```bash
docker version && docker info
# Client Version: 29.6.2
# Server Version: Docker Desktop 4.84.0 (234817) Engine 29.6.2
# Result: Healthy (0 daemon or storage errors)
```

```bash
npx supabase start
# Output: Initialising schema... Seeding globals from roles.sql... Applying migration... Seeding data...
# Status: Complete local disposable stack running cleanly
```

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

## 3. Database Metadata Queries (pg_metadata) Output

```sql
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
-- public_tables_count: 11

SELECT count(*) FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY' AND table_schema = 'public';
-- fk_constraints_count: 15

SELECT count(*) FROM information_schema.table_constraints WHERE constraint_type = 'UNIQUE' AND table_schema = 'public';
-- unique_constraints_count: 4

SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true;
-- rls_enabled_tables_count: 11

SELECT count(*) FROM pg_policies WHERE schemaname = 'public';
-- policies_count: 12
```

---

## 4. Full PostgREST HTTP RLS Test Suite Output

- **Test Suite File:** `apps/web/__tests__/security/FullSupabaseRuntimeValidation.test.js`
- **Command:** `npm exec --offline vitest run __tests__/security/FullSupabaseRuntimeValidation.test.js`
- **Results:**
  - `✓ 1. Supabase GoTrue Auth API endpoint is healthy and reachable`
  - `✓ 2. Profiles: User can read own profile via PostgREST`
  - `✓ 3. Profiles: User CANNOT read another profile (Cross-tenant denial)`
  - `✓ 4. Candidate Profiles: Candidate can read own profile`
  - `✓ 5. Candidate Profiles: Candidate CANNOT read another candidate profile`
  - `✓ 6. Proof Profiles: Candidate can read own proof profile`
  - `✓ 7. Proof Profiles: Candidate CANNOT read another candidate proof profile`
  - `✓ 8. Hiring Runs: Employer Alpha can read own hiring run`
  - `✓ 9. Hiring Runs: Employer Beta CANNOT read Employer Alpha hiring run`
  - `✓ 10. Candidates: Employer Alpha can read candidates in Hiring Run Alpha`
  - `✓ 11. Candidates: Employer Beta CANNOT read candidates in Hiring Run Alpha`
  - `✓ 12. Candidates: Candidate One can read own candidate record`
  - `✓ 13. Candidates: Candidate One CANNOT read Candidate Two record`
  - `✓ 14. Scheduled_emails: Client access is denied (HTTP 401/403/Error)`
  - `✓ 15. Anonymous Client CANNOT access protected profiles table`

---

## 5. Quality Gates Verification Output

- **Application ESLint Output:** `npm exec --offline eslint -- .`
  - Total Errors: **0**
  - Total Warnings: **3** (W07, W08, W09 — `@next/next/no-img-element` in `NaiveShell.jsx`, `MarketingFooter.jsx`, `MarketingNav.jsx`)
- **Full Vitest Test Suite Output:** `npm exec --offline vitest run`
  - Test Files: **18 passed (18)**
  - Total Tests: **193 passed (193)**
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
- [x] New documentation created: Exactly 2 Markdown files under `docs/architecture/checkpoints/step4b5-2-d1-3-r2/`
- [x] `package.json` SHA256: `4c6f469f83690a45f50a77de1265e194da2459d8009a9b174a476de7e1b298bc` (Unchanged)
- [x] `package-lock.json` SHA256: `5e2b91af2a5cca1863026532467b7e6a7c6fccb90f2355554c99fd128bb77365` (Unchanged)
- [x] Git remote: None
- [x] Push / Deployment: None
