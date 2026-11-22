# Step 4B5A Execution Report

**Date:** August 2, 2026  
**Task:** Complete Server API Authorization Matrix & Mock-Authentication Decommission Plan  
**Status:** COMPLETED — Analysis & Documentation Only. Zero production source or test code modified.

---

## 1. Executive Summary

Step 4B5A established an authoritative, route-by-route authorization matrix for all **28 API route-handler paths** in `apps/web/app/api/` and formulated a safe 9-phase decommission sequence for mock authentication.

The audit revealed that while client-side page routing uses `ProtectedRoute.jsx`, **12 of 28 API route handlers operate with no server-side authentication check**, **11 authenticated routes perform no server-side role check**, and **28 of 28 routes perform zero `org_id` tenant scoping or record-ownership verification**.

---

## 2. Baseline Verification

- **Branch:** `antigravity/step4b2-frontend-parity`
- **HEAD Commit:** `97730b5` (`fix(web): complete auth hook dependencies`)
- **Base Tag:** `step4b4b4-auth-hook-deps-fixed`
- **Working Tree:** Clean
- **Git Remote:** None
- **Package Manifest Hashes:**
  - `package.json` SHA256: `4c6f469f83690a45f50a77de1265e194da2459d8009a9b174a476de7e1b298bc` (Match)
  - `package-lock.json` SHA256: `5e2b91af2a5cca1863026532467b7e6a7c6fccb90f2355554c99fd128bb77365` (Match)
- **ESLint Warning Count:** 0 errors, exactly 3 warnings remaining (W07, W08, W09 — all `@next/next/no-img-element`)
- **Vitest Suite:** 9 test files, 65 / 65 tests passed (100% green)
- **Next.js Production Build:** Exit code 0 (21 application page routes, 28 API handler paths)

---

## 3. Complete 28-Route API Inventory & Classification

| Route Path | Method | Category | Data Read / Written | AI / Provider Call | Service Role |
|---|---|---|---|---|---|
| `/api/auth/confirm` | GET | Callback | OAuth tokens | No | No |
| `/api/auth/me` | GET | Auth | Profile data | No | No |
| `/api/auth/signin` | POST | Auth | User & Session | No | No |
| `/api/auth/signup` | POST | Auth | User registration | No | No |
| `/api/candidate/profile` | GET, POST | Candidate | Candidate PII & Resume | No | No |
| `/api/candidate/proof-profile/[candidateId]/generate` | POST | Candidate | Proof Packet | Yes (Gemini/AI) | Yes |
| `/api/candidate/proof-profile/[candidateId]` | GET | Candidate | Proof Packet | No | No |
| `/api/candidate/screening-sessions/[sessionId]/answer` | POST | Candidate | Interview Answer | Yes (AI) | No |
| `/api/candidate/screening-sessions/[sessionId]/complete` | POST | Candidate | Session Result | No | No |
| `/api/candidate/screening-sessions/[sessionId]` | GET | Candidate | Session Data | No | No |
| `/api/candidate/screening-sessions/[sessionId]/start` | POST | Candidate | Session Init | No | No |
| `/api/candidate/status/[candidateId]` | GET | Candidate | Pipeline Status | No | No |
| `/api/employer/analytics` | GET | Employer | Hiring Metrics | No | No |
| `/api/employer/brief/[id]` | GET | Employer | Hiring Brief | No | No |
| `/api/employer/candidate-extractions` | POST | Employer | Resume Extractions | Yes (Docling/AI) | Yes |
| `/api/employer/chat` | POST | Employer | Chat History | Yes (Gemini/AI) | Yes |
| `/api/employer/hiring-runs` | GET, POST | Employer | Hiring Run Records | No | No |
| `/api/employer/hiring-runs/suggest` | POST | Employer | Role Suggestions | Yes (Gemini/AI) | Yes |
| `/api/employer/packets/[extractionId]/action` | POST | Employer | Reviewer Overrides | No | No |
| `/api/employer/packets/[extractionId]/generate` | POST | Employer | Trust Packet | Yes (AI) | Yes |
| `/api/employer/packets/[extractionId]` | GET | Employer | Trust Packet | No | No |
| `/api/employer/shortlist/[roleId]` | GET | Employer | Candidate Shortlist | No | No |
| `/api/employer/sourcing-sessions/[id]/auto-source` | POST | Employer | Candidate Sourcing | Yes (Sourcing AI) | Yes |
| `/api/employer/sourcing-sessions/[id]` | GET | Employer | Session & Events | No | No |
| `/api/employer/sourcing-sessions` | POST | Employer | Session Init | No | No |
| `/api/integrations/gmail/callback` | GET | Integration | OAuth Tokens | No | No |
| `/api/integrations/gmail/connect` | GET | Integration | Auth URL | No | No |
| `/api/search` | GET | Internal | Global Search Index | No | No |

---

## 4. Server API Authentication, Role & Tenant Matrix Summary

### A. Authentication Verification Status
- **Routes verifying user identity (`supabase.auth.getUser()`):** 16 routes.
- **Routes with NO server-side user verification:** 12 routes (`auth/signin`, `auth/signup`, `auth/confirm`, `candidate/proof-profile/[candidateId]`, `candidate/proof-profile/[candidateId]/generate`, `candidate/screening-sessions/[sessionId]`, `candidate/screening-sessions/[sessionId]/start`, `candidate/screening-sessions/[sessionId]/answer`, `candidate/screening-sessions/[sessionId]/complete`, `candidate/status/[candidateId]`, `employer/packets/[extractionId]`, `employer/packets/[extractionId]/generate`).

### B. Server-Side Role Authorization Status
- **Routes performing server-side role check (`user_metadata.role` or `profile.role`):** 5 routes (`auth/me`, `employer/brief/[id]`, `employer/hiring-runs`, `employer/packets/[extractionId]/action`, `search`).
- **Routes missing server-side role checks:** 23 routes. Candidate credentials can invoke 11 authenticated employer API endpoints directly if requested via HTTP.

### C. Tenant Scoping (`org_id`) & Record Ownership Status
- **Routes enforcing `org_id` tenant scoping:** **0 out of 28 routes (0%)**.
- **Security Implication:** Database queries accept path parameters (`[candidateId]`, `[extractionId]`, `[sessionId]`, `[roleId]`) directly without verifying whether the requesting user belongs to the owning organization (`org_id`).

---

## 5. Mock-Authentication Flow & Source Map

The complete mock-authentication flow relies on 4 active codebase locations:

-    [REDACTED: known hardcoded development credential condition removed]
2. **Client Storage & State (`lib/auth.js:148-165`):** `login` receives `'mock-token'`, stores it in `localStorage.setItem('ct_token', 'mock-token')`, and populates `ct_user`.
3. **Session Persistence Bypass (`lib/auth.js:39-45`):** `getInitialSession` checks `storedToken === 'mock-token'` and bypasses Supabase `getSession()`.
4. **Server DB Stubbing (`lib/supabaseServer.js:33-77`):** `if (sessionToken === 'mock-token')` returns a stubbed mock client object that bypasses PostgreSQL and returns synthetic responses without reaching RLS.

---

## 6. Service-Role Client & Provider Cost Audit

- **Service-Role Clients (`SUPABASE_SERVICE_ROLE_KEY`):** Used in 6 AI/generation routes (`candidate/proof-profile/[candidateId]/generate`, `employer/candidate-extractions`, `employer/chat`, `employer/hiring-runs/suggest`, `employer/packets/[extractionId]/generate`, `employer/sourcing-sessions/[id]/auto-source`).
- **Provider Cost Vulnerability:** Because routes like `candidate/proof-profile/[candidateId]/generate` and `employer/packets/[extractionId]/generate` use service-role clients **without verifying user identity or rate limiting**, unauthenticated HTTP requests could trigger expensive AI generation calls.

---

## 7. Route Security Risk Classification

- **P0 (Critical — 8 Routes):** Unauthenticated sensitive routes or service-role invocation without verified identity (`auth/signin`, `candidate/proof-profile/[candidateId]/generate`, `employer/packets/[extractionId]/generate`, `candidate/screening-sessions/[sessionId]/start`, `candidate/screening-sessions/[sessionId]/answer`, `candidate/screening-sessions/[sessionId]/complete`, `employer/packets/[extractionId]`, `candidate/proof-profile/[candidateId]`).
- **P1 (High — 14 Routes):** Authenticated routes lacking server-side role, tenant, or cost control (`employer/analytics`, `employer/chat`, `employer/candidate-extractions`, `employer/hiring-runs/suggest`, `employer/shortlist/[roleId]`, `employer/sourcing-sessions`, `employer/sourcing-sessions/[id]`, `employer/sourcing-sessions/[id]/auto-source`, `candidate/profile`, `candidate/status/[candidateId]`, `candidate/screening-sessions/[sessionId]`, `integrations/gmail/connect`, `integrations/gmail/callback`, `search`).
- **P2 (Medium — 4 Routes):** Auth and role check present, but missing tenant scoping or rate limiting (`auth/me`, `employer/brief/[id]`, `employer/hiring-runs`, `employer/packets/[extractionId]/action`).
- **P3 (Low — 2 Routes):** Public auth callbacks (`auth/signup`, `auth/confirm`).

---

## 8. Decommission Sequence (9 Phases)

- **Phase B1:** Add API characterization tests.
- **Phase B2:** Remove hardcoded credentials from `auth/signin/route.js`.
- **Phase B3:** Remove `mock-token` stubbing from `lib/supabaseServer.js` and `lib/auth.js`.
- **Phase B4:** Repair `ProtectedRoute.jsx` role-mismatch redirect UX.
- **Phase B5:** Implement shared server request authentication helper (`verifyServerAuth`).
- **Phase B6:** Implement server role authorization checks (`verifyRole`).
- **Phase B7:** Implement `org_id` tenant scoping and ownership checks (`verifyOrgOwnership`).
- **Phase B8:** Add rate limiting and idempotency headers to expensive provider routes.
- **Phase B9:** Verify PostgreSQL Row-Level Security (RLS) policies with negative cross-tenant tests.

---

## 9. Proposed Minimum Server Authorization Contract

```javascript
// Proposed shared server authorization helper result
export async function getVerifiedServerContext(request) {
  // Returns verified server-derived context
  return {
    userId: string,     // Verified Supabase user ID from JWT
    role: string,       // Verified role from profile / app_metadata
    orgId: string,      // Verified tenant organization ID
    sessionId: string,  // Authenticated session ID
  };
}
```

---

## 10. Credential Rotation Gate Status

- **`.env.local` Status:** Present on disk, untracked by Git.
- **Keys Present:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `CRUSTDATA_API_KEY`.
- **Rotation Confirmation:** **Unconfirmed**.
- **Blocked Milestones:** Public authenticated hosting, live synthetic demos, real-company data.
- **Allowed Milestones:** Local founder-guided synthetic demo (offline/mocked).

---

## 11. Founder Review Request

Step 4B5A route-by-route audit, security classification, and decommission plan are complete. Request founder review and approval of the proposed Phase B1–B3 decommission sequence.
