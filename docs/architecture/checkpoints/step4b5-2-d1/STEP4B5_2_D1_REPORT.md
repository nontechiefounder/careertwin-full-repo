# Step 4B5.2-D1 Report (Local Supabase Project Scaffold & Schema Baseline)

**Date:** August 3, 2026  
**Task:** Create Local Supabase Project Scaffold and Source-Controlled Operational Schema Baseline (Offline & Local Only)  
**Status:** COMPLETED — Source-controlled local Supabase scaffold, operational baseline migration, synthetic seed data, and schema contract tests established. Zero database connections made, zero remote staging changes, zero credentials read or exposed, zero production application code modified.

---

## 1. Executive Summary

Step 4B5.2-D1 established a fully source-controlled, offline local Supabase environment scaffold for the CareerTWiN project under `supabase/`.

The checkpoint delivered:
1. **Local Scaffold Configuration:** `supabase/config.toml` configuring local port specifications and authentication settings without remote project links.
2. **Operational Schema Baseline Migration:** `supabase/migrations/20260803000001_operational_schema_baseline.sql` representing the literal 11 operational hosted tables (`profiles`, `candidate_profiles`, `proof_profiles`, `hiring_runs`, `sourcing_sessions`, `candidates`, `screening_sessions`, `screening_answers`, `screening_summaries`, `activity_events`, `scheduled_emails`).
3. **RLS Safety Remediation:** Enforced `ENABLE ROW LEVEL SECURITY` on all 11 tables and remediated the critical cross-tenant vulnerability by replacing `candidates` `USING true / WITH CHECK true` with scoped employer owner (`hiring_runs.employer_id`) and candidate self policies.
4. **Internal Table Protection:** Applied `REVOKE ALL ON scheduled_emails FROM anon, authenticated` for worker safety.
5. **Synthetic Seed Data:** `supabase/seed.sql` containing synthetic mock fixtures (`@example.invalid` email domains) with zero real personal data, live emails, or credential patterns.
6. **Schema Contract Test Suite:** `apps/web/__tests__/security/LocalSchemaContract.test.js` verifying table existence, RLS enablement, candidate policy remediation, identity chain preservation, and seed credential isolation (7/7 tests passed).

---

## 2. Baseline Verification

- **Branch:** `antigravity/step4b2-frontend-parity`
- **HEAD Commit:** `7b71431` (`docs(security): design Supabase staging and migration roadmap`)
- **Working Tree:** Clean
- **Git Remote:** None
- **Package Manifest Hashes:** `package.json` and `package-lock.json` match baseline SHA256
- **In-Memory Credential Scan:** 0 documentation matches, 0 test-source matches
- **ESLint Output:** 0 errors, 3 image warnings remaining (W07, W08, W09 — all `@next/next/no-img-element`)
- **Vitest Test Suite:** 16 test files, 165 / 165 tests passed (100% green; including 7 new schema contract tests)
- **Next.js Production Build:** Exit code 0 (21 page routes, 28 API route files, 30 HTTP method handlers)

---

## 3. Files Created & Modified

- **`supabase/config.toml`** (NEW — Local Supabase project scaffold configuration)
- **`supabase/migrations/20260803000001_operational_schema_baseline.sql`** (NEW — Operational baseline schema migration)
- **`supabase/seed.sql`** (NEW — Synthetic mock seed fixtures)
- **`apps/web/__tests__/security/LocalSchemaContract.test.js`** (NEW — 7 automated schema contract tests)
- **`docs/architecture/checkpoints/step4b5-2-d1/STEP4B5_2_D1_REPORT.md`** (NEW — Architectural report)
- **`docs/architecture/checkpoints/step4b5-2-d1/STEP4B5_2_D1_EVIDENCE.md`** (NEW — Execution evidence)

---

## 4. Target Staging Identity Contract Implemented

The operational baseline migration implements the target identity convention:
- `profiles.id` references `auth.users(id)` ON DELETE CASCADE (`POLICY_CONFIRMED_IDENTITY_CONVENTION`).
- `candidate_profiles.id` references `profiles(id)` ON DELETE CASCADE.
- `hiring_runs.employer_id` references `profiles(id)` ON DELETE CASCADE.
- `sourcing_sessions.employer_id` references `profiles(id)` ON DELETE CASCADE.
- `candidates.candidate_id` references `candidate_profiles(id)` ON DELETE CASCADE.
- `candidates.hiring_run_id` references `hiring_runs(id)` ON DELETE CASCADE.
- `proof_profiles.candidate_id` references `candidate_profiles(id)` ON DELETE CASCADE.
- `screening_sessions.candidate_id` references `candidate_profiles(id)` ON DELETE CASCADE.
- `screening_sessions.hiring_run_id` references `hiring_runs(id)` ON DELETE CASCADE.
- `screening_answers.session_id` references `screening_sessions(id)` ON DELETE CASCADE.
- `screening_summaries.session_id` references `screening_sessions(id)` ON DELETE CASCADE.
- `scheduled_emails.employer_id` references `profiles(id)` and `candidate_id` references `candidate_profiles(id)`.

*(No `candidates.user_id` column was added, preserving the existing identity chain).*

---

## 5. RLS Enablement & Default-Deny Security Model

- **RLS Status:** `ENABLE ROW LEVEL SECURITY` executed on all 11 operational tables.
- **Candidate Table Remediation:** Replaced open `USING true` / `WITH CHECK true` policies with:
  - Employer Owner: `auth.uid() IN (SELECT employer_id FROM hiring_runs WHERE id = hiring_run_id)`
  - Candidate Self: `auth.uid() = candidate_id`
- **Internal Table Revocation:** `REVOKE ALL ON scheduled_emails FROM anon, authenticated;`
- **Default-Deny Areas:** Tables without defined client policies block access by default under Supabase PostgreSQL RLS semantics.

---

## 6. Synthetic Seed Data Summary

- **Fixtures Created:**
  - 2 Synthetic Employers: `synthetic.employer.alpha@example.invalid`, `synthetic.employer.beta@example.invalid`
  - 2 Synthetic Candidates: `synthetic.candidate.one@example.invalid`, `synthetic.candidate.two@example.invalid`
  - 2 Separate Hiring Runs: `Synthetic Senior Engineer (Run Alpha)`, `Synthetic Product Manager (Run Beta)`
  - 2 Synthetic Candidates, 1 Proof Profile, 1 Screening Session, 1 Screening Answer, 1 Screening Summary
- **Credential Protection:** 0 real email addresses, 0 API keys, 0 JWT tokens, 0 refresh tokens, 0 copied production IDs.

---

## 7. Quality Gates & Source Integrity

- **Vitest Test Suite:** **16 test files passed, 165 / 165 tests passed** (100% green; 7 new schema tests).
- **Application-Wide ESLint:** **0 ERRORS, 3 WARNINGS remaining** (W07, W08, W09 untouched).
- **Next.js Production Build:** **Exit Code 0** (21 page routes, 28 API route files, 30 HTTP method handlers compiled cleanly).
- **Production Source Changes:** **ZERO (0) production application files modified**.
- **Remote Connection / Credential Isolation:** ZERO remote project links created, ZERO remote database connections made, ZERO credentials read or exposed.

---

## 8. Founder Review Request

Step 4B5.2-D1 local Supabase project scaffold, operational baseline migration, synthetic seed data, and contract validation tests are complete. Request founder review and approval.
