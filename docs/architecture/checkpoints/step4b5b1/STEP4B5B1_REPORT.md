# Step 4B5B1 Execution Report

**Date:** August 2, 2026  
**Task:** High-Risk API Authorization Characterization Testing & Revised Matrix  
**Status:** COMPLETED — Zero production source modified. Authorized security tests and documentation created.

---

## 1. Executive Summary

Step 4B5B1 empirically characterized the server authorization behavior across all **28 API route-handler paths (30 HTTP method-level handlers)** using isolated offline Vitest test suites.

The characterization tests replaced prior manual estimates with empirical test evidence:
1. **Intentionally Public Auth Entry Routes:** 3 routes (4 method handlers: `signin` POST, `signup` POST, `confirm` GET).
2. **Sensitive Routes Missing Identity Verification:** 9 routes (9 method handlers accept HTTP requests without verifying user identity).
3. **Employer Routes Accepting Candidate Identity:** 8 employer routes accept a verified candidate identity without returning 403.
4. **Verified vs. Unverified Role Checks:** 0 routes derive role from verified server metadata. 5 routes inspect `profile.role` or `user_metadata.role`, but do not enforce server identity beforehand or allow candidate access.
5. **Tenant Scoping (`org_id`):** 0 out of 30 method handlers enforce tenant organization scoping (`org_id`) or ownership validation.

---

## 2. Baseline Verification

- **Branch:** `antigravity/step4b2-frontend-parity`
- **HEAD Commit:** `34ae29d` (`docs(security): map API authorization boundary`)
- **Pre-Change Tag:** `step4b5b1-pre-api-characterization` (Created)
- **Working Tree:** Clean prior to test/doc creation
- **Git Remote:** None
- **Package Manifest Hashes:**
  - `package.json` SHA256: `4c6f469f83690a45f50a77de1265e194da2459d8009a9b174a476de7e1b298bc` (Match)
  - `package-lock.json` SHA256: `5e2b91af2a5cca1863026532467b7e6a7c6fccb90f2355554c99fd128bb77365` (Match)
- **ESLint Warning Count:** 0 errors, exactly 3 warnings remaining (W07, W08, W09 — all `@next/next/no-img-element`)
- **Vitest Test Suite:** 10 test files (9 existing + 1 security suite), 90 / 90 tests passed (100% green)
- **Next.js Production Build:** Exit code 0 (21 application page routes, 28 API handler paths)

---

## 3. Empirical Method-Level Matrix (30 Method Handlers)

| Route Path | Method | Category | Verified User Required | Role Required | Ownership / Tenant Scope | Tested Status (Candidate Identity) | Provider Cost / Decision Mutation |
|---|---|---|---|---|---|---|---|
| `/api/auth/confirm` | GET | Callback | No (Public) | None | N/A | 200 / 400 | None |
| `/api/auth/me` | GET | Auth | Yes | None | User Ownership | 200 | None |
| `/api/auth/signin` | POST | Public Auth | No (Public) | None | N/A | 200 / 401 | None |
| `/api/auth/signup` | POST | Public Auth | No (Public) | None | N/A | 200 | None |
| `/api/candidate/profile` | GET | Candidate | Yes | None | Candidate Ownership | 200 | None |
| `/api/candidate/profile` | POST | Candidate | Yes | None | Candidate Ownership | 200 | Decision Mutation |
| `/api/candidate/proof-profile/[candidateId]/generate` | POST | Candidate | No | None | Candidate Ownership | 200 / 500 | Provider Cost & Mutation |
| `/api/candidate/proof-profile/[candidateId]` | GET | Candidate | No | None | Candidate Ownership | 200 | None |
| `/api/candidate/screening-sessions/[sessionId]/answer` | POST | Candidate | No | None | Candidate Ownership | 200 | Decision Mutation |
| `/api/candidate/screening-sessions/[sessionId]/complete` | POST | Candidate | No | None | Candidate Ownership | 200 / 500 | Provider Cost & Mutation |
| `/api/candidate/screening-sessions/[sessionId]` | GET | Candidate | No | None | Candidate Ownership | 200 | None |
| `/api/candidate/screening-sessions/[sessionId]/start` | POST | Candidate | No | None | Candidate Ownership | 200 | Decision Mutation |
| `/api/candidate/status/[candidateId]` | GET | Candidate | No | None | Candidate Ownership | 200 | None |
| `/api/employer/analytics` | GET | Employer | Yes | None | Employer Org (`org_id`) | 200 | None |
| `/api/employer/brief/[id]` | GET | Employer | Yes | None | Employer Org (`org_id`) | 200 | Provider Cost |
| `/api/employer/candidate-extractions` | POST | Employer | Yes | None | Employer Org (`org_id`) | 200 | Provider Cost & Mutation |
| `/api/employer/chat` | POST | Employer | Yes | None | Employer Org (`org_id`) | 200 | Provider Cost |
| `/api/employer/hiring-runs` | GET | Employer | Yes | None | Employer Org (`org_id`) | 200 | None |
| `/api/employer/hiring-runs` | POST | Employer | Yes | None | Employer Org (`org_id`) | 200 | Decision Mutation |
| `/api/employer/hiring-runs/suggest` | POST | Employer | Yes | None | Employer Org (`org_id`) | 200 | Provider Cost |
| `/api/employer/packets/[extractionId]/action` | POST | Employer | Yes | None | Employer Org (`org_id`) | 200 | Decision Mutation |
| `/api/employer/packets/[extractionId]/generate` | POST | Employer | No | None | Employer Org (`org_id`) | 200 / 500 | Provider Cost & Mutation |
| `/api/employer/packets/[extractionId]` | GET | Employer | No | None | Employer Org (`org_id`) | 200 | None |
| `/api/employer/shortlist/[roleId]` | GET | Employer | Yes | None | Employer Org (`org_id`) | 200 | None |
| `/api/employer/sourcing-sessions/[id]/auto-source` | POST | Employer | Yes | None | Employer Org (`org_id`) | 200 / 400 | Provider Cost & Mutation |
| `/api/employer/sourcing-sessions/[id]` | GET | Employer | Yes | None | Employer Org (`org_id`) | 200 | None |
| `/api/employer/sourcing-sessions` | POST | Employer | Yes | None | Employer Org (`org_id`) | 200 / 400 | Decision Mutation |
| `/api/integrations/gmail/callback` | GET | Integration | Yes | None | OAuth State Binding | 200 / 302 | None |
| `/api/integrations/gmail/connect` | GET | Integration | Yes | None | OAuth State Binding | 200 | None |
| `/api/search` | GET | Internal | Yes | None | User / Org Ownership | 200 | None |

---

## 4. Provider-Cost vs. Decision-Mutation Separation

### A. Provider-Cost Routes (8 Method Handlers)
1. `/api/candidate/proof-profile/[candidateId]/generate` (POST) — Triggers Gemini proof packet generation via service role.
2. `/api/candidate/screening-sessions/[sessionId]/complete` (POST) — Triggers Gemini screening evaluation.
3. `/api/employer/brief/[id]` (GET) — Triggers Gemini hiring brief synthesis on cache miss or force.
4. `/api/employer/candidate-extractions` (POST) — Triggers resume extraction & embedding.
5. `/api/employer/chat` (POST) — Triggers Gemini hiring assistant chat.
6. `/api/employer/hiring-runs/suggest` (POST) — Triggers Gemini role suggestion.
7. `/api/employer/packets/[extractionId]/generate` (POST) — Triggers Gemini Trust Packet generation via service role.
8. `/api/employer/sourcing-sessions/[id]/auto-source` (POST) — Triggers autonomous sourcing agent & Crustdata API via service role.

### B. Decision-Mutation Routes (9 Method Handlers)
1. `/api/candidate/profile` (POST) — Mutates candidate profile & resume data.
2. `/api/candidate/proof-profile/[candidateId]/generate` (POST) — Creates proof packet record.
3. `/api/candidate/screening-sessions/[sessionId]/start` (POST) — Initializes screening session status.
4. `/api/candidate/screening-sessions/[sessionId]/answer` (POST) — Upserts screening answer.
5. `/api/candidate/screening-sessions/[sessionId]/complete` (POST) — Finalizes screening score & state.
6. `/api/employer/candidate-extractions` (POST) — Creates candidate extraction record.
7. `/api/employer/hiring-runs` (POST) — Creates hiring run record.
8. `/api/employer/packets/[extractionId]/action` (POST) — Updates candidate status (`shortlisted`, `hold`, `rejected`).
9. `/api/employer/packets/[extractionId]/generate` (POST) — Creates Trust Packet record.

---

## 5. Revised Empirical Severity Totals

- **P0 (Critical — 9 Method Handlers):** Sensitive routes accepting requests without user identity verification (`candidate/proof-profile/[candidateId]` GET, `candidate/proof-profile/[candidateId]/generate` POST, `candidate/screening-sessions/[sessionId]` GET, `candidate/screening-sessions/[sessionId]/start` POST, `candidate/screening-sessions/[sessionId]/answer` POST, `candidate/screening-sessions/[sessionId]/complete` POST, `candidate/status/[candidateId]` GET, `employer/packets/[extractionId]` GET, `employer/packets/[extractionId]/generate` POST).
- **P1 (High — 16 Method Handlers):** Authenticated endpoints missing role checks, tenant (`org_id`) scoping, or provider cost controls (`employer/analytics`, `employer/brief/[id]`, `employer/candidate-extractions`, `employer/chat`, `employer/hiring-runs` GET/POST, `employer/hiring-runs/suggest`, `employer/packets/[extractionId]/action`, `employer/shortlist/[roleId]`, `employer/sourcing-sessions` POST, `employer/sourcing-sessions/[id]` GET, `employer/sourcing-sessions/[id]/auto-source`, `candidate/profile` GET/POST, `search`).
- **P2 (Medium — 2 Method Handlers):** OAuth integration callbacks missing CSRF state validation (`gmail/connect`, `gmail/callback`).
- **P3 (Low — 3 Method Handlers):** Intentionally public auth entry endpoints (`signin`, `signup`, `confirm`).

---

## 6. Recommended Phase B2 Scope

Based on empirical test characterization, Phase B2 should focus strictly on:
1. Removing the hardcoded `[REDACTED: development credential email]` / `[REDACTED: development credential password]` sign-in condition from `apps/web/app/api/auth/signin/route.js`.
2. Adding characterization tests verifying that invalid sign-in attempts fail closed without returning mock tokens.

---

## 7. Founder Review Request

Step 4B5B1 empirical characterization testing, method-level matrix, and documentation are complete. Request founder review and approval.
