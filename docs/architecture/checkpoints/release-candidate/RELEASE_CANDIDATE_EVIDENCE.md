# Release Candidate (RC) — Final Evidence File

**Date:** 2026-08-12  
**Baseline Commit:** `0279a9c5d963df65d6927b98876b61e66930f6d2`  
**Canonical Checkpoint Commit:** `0090e989ab878c093ffb4525abfcff69d9f76900`  
**Branch:** `antigravity/step4b2-frontend-parity`  
**Target Staging Project:** `headwayos-secondary` (masked ref: `phli...xskd`), Region: `ap-northeast-2`  

---

## E1. Repository Pre-Flight Verification

```bash
$ git branch --show-current
antigravity/step4b2-frontend-parity

$ git status --short
M  docs/architecture/checkpoints/release-candidate/RELEASE_CANDIDATE_REPORT.md

$ git remote -v
(no output — zero Git remotes configured)

$ npx supabase projects list (masked for sanitization)
Project: headwayos-secondary | Region: ap-northeast-2 | Ref: phli...xskd | Status: ACTIVE_HEALTHY
```

---

## E2. Golden RC Evaluation Benchmark Suite Output

```bash
$ cd apps/web && npm exec --offline vitest run __tests__/evals/GoldenReleaseCandidateEvaluations.test.js

 RUN  v4.1.2 /Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo/apps/web

 ✓ __tests__/evals/GoldenReleaseCandidateEvaluations.test.js (6 tests) 3ms
     ✓ Case 1: Strong fit / strong proof has high fit score, high proof strength, and explicit provenance
     ✓ Case 2: Strong fit / weak proof prevents false STRONG YES recommendation
     ✓ Case 3: Ownership ambiguity does not attribute team accomplishment as individual ownership
     ✓ Case 4: Conflicting evidence is explicitly categorized as CONFLICTING
     ✓ Case 5: Insufficient evidence generates actionable Minimum Missing Proof items
     ✓ Case 6: Protected attributes do not alter candidate evaluation score or reasoning

 Test Files  1 passed (1)
      Tests  6 passed (6)
```

---

## E3. Private-Pilot Ingestion Pipeline Validation Output

```text
==================================================================
RELEASE CANDIDATE PRIVATE-PILOT INGESTION WORKFLOW VALIDATION
==================================================================

Target Role: Lead Full-Stack / Backend Engineer (Org: 00000000-0000-4000-d2c0-000000000001)

Processing 25 synthetic candidate inputs across formats: [pdf, docx, json, csv]...
[QUARANTINED] Item cand-syn-013 (syn.cand.13@example.com): Malformed file header. Quarantined safely (no crash).
[DEDUPLICATED] Item cand-syn-020 (syn.cand.20@example.com): Duplicate document hash detected.

--- INGESTION WORKFLOW SUMMARY ---
Total Workload Candidates: 25
Accepted & Processed: 23
Safely Quarantined (Malformed): 1
Deduplicated (Duplicates): 1
Server Worker Failures: 0
[PASS] Candidate Evidence Isolation Verified: 23 unique records

==================================================================
RELEASE CANDIDATE INGESTION WORKFLOW VALIDATION PASSED 100%
==================================================================
```

---

## E4. Playwright Product Workflow & UAT Execution Output

```text
==================================================================
RELEASE CANDIDATE PRODUCT WORKFLOW & UAT EXECUTION (STRICT PATCH)
==================================================================

--- WORKFLOW 1: Role Intake & Proof Contract Validation ---
1. Employer Alpha authenticating via /auth...
[PASS] Employer Alpha authenticated successfully
2. Navigating to Employer Brief / Proof Contract...
[PASS] Proof Contract UI Assertions Passed: Role Summary, Explicit vs Inferred Requirements, Screening Dimensions, Verification Focus verified.

--- WORKFLOW 2: Candidate Trust Packet & Decoupled Metrics Validation ---
[PASS] Candidate Trust Packet API Asserted: HTTP 200
[PASS] Candidate Trust Packet Assertions Passed: Decoupled Fit Score & Proof Strength, Trust Matrix (Verified/Inferred/Uncertain) verified.

--- WORKFLOW 3: Human Decision Loop Validation ---
Triggering authenticated human decision: Advance Candidate...
[PASS] Human Decision Control Asserted: Advance Candidate persisted under human actor.

--- WORKFLOW 4: Candidate Screening UI Lifecycle Validation ---
1. Candidate One authenticating via /auth...
[PASS] Candidate One authenticated successfully
2. Navigating to Candidate One status page: http://localhost:3000/candidate/status/[cand1_id]...
[PASS] Candidate One Status API Asserted: HTTP 200
3. Navigating to Candidate Screening view: http://localhost:3000/candidate/screen/sess-1...
[PASS] Candidate Screening Session verified as COMPLETED in DB.

--- WORKFLOW 5: Cross-Tenant & Cross-Candidate Isolation Security ---
[PASS] Employer Beta Cross-Tenant Isolation Asserted: HTTP 404
[PASS] Candidate Two Cross-Candidate Isolation Asserted: HTTP 403
[PASS] Unauthenticated Fail-Closed Asserted: HTTP 401 Unauthorized -> Redirected to /auth

==================================================================
RELEASE CANDIDATE PRODUCT WORKFLOW & UAT PASSED 100% STRICT ASSERTIONS
==================================================================
```

---

## E5. Local Quality Gate Verification Outputs

### Canonical Vitest Test Suite

```bash
$ cd apps/web && unset CAREERTWIN_RUN_STAGING_TESTS && npm exec --offline vitest run

 ✓ __tests__/evals/GoldenReleaseCandidateEvaluations.test.js (6 tests) 2ms
 ✓ __tests__/security/HostedP0EndToEndUAT.test.js (8 tests) 7ms
 ...
 Test Files  22 passed | 1 skipped (23 total)
      Tests  239 passed | 1 skipped (240 total)
   Start at  04:22:09
   Duration  4.05s
```

### ESLint Audit (`apps/web`)

```bash
$ cd apps/web && npm exec --offline eslint -- .
✖ 3 problems (0 errors, 3 warnings)
```

### Next.js Production Build (`apps/web`)

```bash
$ cd apps/web && npm run build
▲ Next.js 16.2.1 (Turbopack)
✓ Compiled successfully in 9.5s
✓ Generating static pages using 7 workers (32/32) in 450ms
```
