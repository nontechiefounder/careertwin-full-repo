# workBYLiNE Genome — V12 Source Alignment & Seeded Search Verification Report

- **Date:** 2026-11-22
- **Phase:** VERIFICATION
- **Overall Lifecycle Status:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`
- **Preserved Frozen Archives:**
  - `WorkByLine_Parth_Local_Review_v12.zip` (`9692879dd4de0a83b417a89953062241566c5fd61c72e69ab022746811ae4f83`) — **unchanged**
  - `WorkByLine_Founder_Audit_v12.zip` (`5f8ce44f0c7f11b7ac53fda5f914af2c6e777a47a13f4300c3115804d998b3ec`) — **unchanged**
  - `WorkByLine_v12_Candidate.bundle` (`d214504b837566330b89711db623fc94af60a2cd86bcad90abac4428e6d9fa79`) — **unchanged**
- **Follow-Up Alignment Branch:** `fix/v12-evidence-alignment` (exported in `WorkByLine_v12_Aligned.bundle`)

---

## 1. Findings Addressed (`V12-C1`, `V12-C2`)

1. **`V12-C1` (Git Manifest Scope & Bundle Log Documentation):**
   - *Prior Issue:* Commit `5eaa46f29325886e415ae33dc7759d521c1b4416` (`fix/v12-security-repairs`) still carried the stale `1,038`-entry `v10` `MANIFEST_SHA256.txt` (`11` digest mismatches) and retained the 12 historical `v10` `logs/guarded_verify_20261122T000858Z_78719/` files, while `STEP_V12_REPAIRS_AND_AUTH0_EVIDENCE.md` inaccurately stated that the bundle had no runtime logs.
   - *Follow-Up Alignment:* Preserved the 12 historical `v10` log files in Git history, regenerated `MANIFEST_SHA256.txt` with an explicit scope covering **all tracked Git files in `fix/v12-evidence-alignment` excluding `MANIFEST_SHA256.txt` itself**, verified `0` mismatches on a clean checkout, and mapped `logs/guarded_verify_20261122T124350Z_23172/` (in the frozen `v12` ZIPs) to the `v12` runtime source.
2. **`V12-C2` (Seeded Disposable `/api/search` Controls & Real-DB Defect Repairs):**
   - *Investigation Findings:* Running the actual `GET /api/search` handler against real disposable PostgreSQL/PostgREST (`54421` / `54422`) uncovered two defects that mocked unit tests missed:
     1. `apps/web/app/api/search/route.js` selected `candidate_profiles.linkedin_url`, which does not exist in `20260803000001_operational_schema_baseline.sql` (`SQLSTATE 42703: column candidate_profiles.linkedin_url does not exist`), causing every real-DB `/api/search` request to fail `500`. Fixed by selecting `id, name, bio, location`.
     2. PostgREST double-quoted `.or(...)` operands unescape `\`, turning `\%` and `\_` into wildcards (`100%_Engineer` matched `1000X_Engineer`). Fixed by doubling backslashes (`const orQuery = query.replace(/\\/g, '\\\\')`) inside `.or(...)` operands.
   - *Verified Behavior:* Seeded disposable `hiring_runs` for `User A` and `User B` in `54421` and verified `401` unauthenticated, positive `O'Reilly`, `Node.js`, and literal `100%_Engineer` matches (`1` row each, exact UUIDs recorded), `0` results for `Staff,id.neq.0`, and `0` cross-tenant leaks between `User A` and `User B`.

---

## 2. Scanner Readiness & Remaining Founder Decisions

- **Scanner Readiness:** `semgrep`, `codeql`, `coderabbit`, `gitleaks`, `trivy`, `osv-scanner`, `snyk`, and `bandit` remain **NOT INSTALLED (`NOT VERIFIED`)** locally; `npm audit` remains **OFFLINE BLOCKED (`NOT VERIFIED`)**. External CodeRabbit review requires pushing an authorized review branch (`fix/v12-evidence-alignment`) to a designated remote repository (never `origin/main` `cd5b85db...`).
- **Remaining Founder Decisions:**
  1. Authorize the remote review branch destination/push for full-codebase CodeRabbit + CI SAST/secret/dependency scanning.
  2. Select the Auth0/Supabase identity architecture (`A`: Supabase Third-Party Auth + audited `current_app_user_id()` RLS/FK migration, or `B`: retain Supabase Auth).
  3. Select a single-process restricted demo or approve a shared atomic backend for Gmail replay state (`gmail.js`) and resend cooldown/directory limits (`resend-verification/route.js`).

---

## 3. Readiness by Scope

| Scope | Readiness | Notes |
|---|---|---|
| **Git / Manifest Alignment (`fix/v12-evidence-alignment`)** | **VERIFIED** | Clean checkout `MANIFEST_SHA256.txt` `0` mismatches across all tracked files |
| **Bounded Security Repairs (`v12` + `search` real-DB fixes)** | **TEST-VERIFIED** | Controlled Vitest + seeded disposable PostgreSQL/PostgREST (`54421`/`54422`) |
| **Local Synthetic Demo** | **VERIFIED RECEIPT** (`20261122T124350Z_23172` + `v12.1` search delta) | Dry-run email & gated providers |
| **Hosted Demo / Design-Partner Pilot / Real-Company Data / Production** | **NOT VERIFIED** | Blocked on scanner stage, hosting topology, shared atomic stores, live providers/SMTP, and Auth0 decision |
