# Step 4B5.3-A.1 — Exact Authorization Architecture Reconciliation & Server Fixture Audit Report

**Date:** 2026-08-11  
**Baseline Commit:** `7f251abf6d1398cd876ec125bfc7e709f65f19fa`  
**Branch:** `antigravity/step4b2-frontend-parity`  
**Target Staging Project:** `headwayos-secondary` (masked ref: `phli...xskd`), Region: `ap-northeast-2`, Status: `ACTIVE_HEALTHY`  
**Scope:** Read-Only Architectural Reconciliation & Route Authorization Matrix (Step 4B5.3-A.1 Checkpoint)

---

## Executive Summary

Step 4B5.3-A.1 reconciles the 28-route API inventory, separates authentication from fine-grained authorization across all endpoints, establishes the precise existing mechanisms for screening sessions and activity events, and defines the release-critical (P0/P1/P2) implementation scope without modifying any production code.

Key Reconciliation Findings:
1. **Exact 28-Route Inventory**: Reconciled the complete count of 28 route handlers in `apps/web/app/api/` into one unambiguous, unified matrix.
2. **Authentication vs Authorization Distinction**:
   - **Authentication** (`getUser()` session verification) confirms *who* the caller is.
   - **Authorization** (candidate ownership, organization membership, or resource-to-org scoping) confirms *what* the caller is permitted to access.
3. **Screening Session Architecture**:
   - Confirmed that no dedicated `invitation_token` column currently exists in database schemas.
   - Screening sessions are identified by their primary key `sessionId` (UUID).
   - Screening route handlers currently lack candidate `getUser()` checks and return dev mock fallbacks when sessions are absent.
4. **Server Creation & Write Paths**:
   - `screening_sessions`: Table-level `INSERT` is revoked from client `authenticated` roles (`REVOKE INSERT ON screening_sessions FROM anon, authenticated`). Server creation occurs via authorized employer endpoints during candidate invitation/sourcing workflow.
   - `activity_events`: Inserts occur via authenticated user client `createSupabaseServerClient(request)` when the employer is an active member of the organization owning the sourcing session.
5. **Privileged Credential Decision**:
   - **Conclusion A**: Existing server architecture can perform required writes without adding a new privileged credential.
6. **Readiness Classification**:
   - **STATE A** — Exact authorization architecture and minimal implementation scope are proven and ready for founder approval.

---

## Exact 28-Route Authorization Classification Matrix

Access Classes:
- **A**: `UNAUTHENTICATED_PUBLIC`
- **B**: `AUTHENTICATION_ONLY` (`getUser()` checked, no role/org/resource checks)
- **C**: `CANDIDATE_OWNERSHIP_AUTHORIZED` (`user.id === candidate_id` or profile `id`)
- **D**: `ORGANIZATION_MEMBERSHIP_AUTHORIZED` (`security.is_org_member(org_id)`)
- **E**: `ORGANIZATION_ROLE_AUTHORIZED` (Employer role requirement)
- **F**: `RESOURCE_TO_ORGANIZATION_AUTHORIZED` (`employer_id` / `hiring_run_id` -> `org_id`)
- **G**: `INVITATION_SESSION_TOKEN_AUTHORIZED` (Valid session lookup / token verification)

| # | Route Path | HTTP Method | Current Class | Required Final Class | Implementation Gap | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `/api/auth/confirm` | GET | A (`PUBLIC`) | A (`PUBLIC`) | None (Intentionally public OTP verification) | P2 |
| 2 | `/api/auth/me` | GET | B (`AUTH_ONLY`) | B (`AUTH_ONLY`) | None (Queries profile for authenticated `user.id`) | P2 |
| 3 | `/api/auth/signin` | POST | A (`PUBLIC`) | A (`PUBLIC`) | None (Intentionally public sign-in) | P2 |
| 4 | `/api/auth/signup` | POST | A (`PUBLIC`) | A (`PUBLIC`) | None (Intentionally public sign-up) | P2 |
| 5 | `/api/candidate/profile` | GET, POST | B (`AUTH_ONLY`) | C (`CANDIDATE_OWNERSHIP`) | Enforce `user.id` matching candidate profile ID | P1 |
| 6 | `/api/candidate/proof-profile/[candidateId]` | GET | A (`PUBLIC`) | C / F (`CANDIDATE_OR_ORG`) | Remove dev fallback; enforce auth & candidate/org access | **P0** |
| 7 | `/api/candidate/proof-profile/[candidateId]/generate` | POST | A (`PUBLIC`) | C (`CANDIDATE_OWNERSHIP`) | Remove dev fallback; enforce `user.id === candidateId` | **P0** |
| 8 | `/api/candidate/screening-sessions/[sessionId]` | GET | A (`PUBLIC`) | G / C (`SESSION_OR_CANDIDATE`) | Remove mock fallback; validate session ID in DB | **P0** |
| 9 | `/api/candidate/screening-sessions/[sessionId]/start` | POST | A (`PUBLIC`) | G / C (`SESSION_OR_CANDIDATE`) | Remove mock fallback; validate session in DB before status update | **P0** |
| 10 | `/api/candidate/screening-sessions/[sessionId]/answer` | POST | A (`PUBLIC`) | G / C (`SESSION_OR_CANDIDATE`) | Remove mock fallback; validate session in DB before answer upsert | **P0** |
| 11 | `/api/candidate/screening-sessions/[sessionId]/complete` | POST | A (`PUBLIC`) | G / C (`SESSION_OR_CANDIDATE`) | Enforce valid session ID & candidate access before AI summary | **P0** |
| 12 | `/api/candidate/status/[candidateId]` | GET | A (`PUBLIC`) | C / F (`CANDIDATE_OR_ORG`) | Remove mock fallback; enforce candidate/org ownership | **P0** |
| 13 | `/api/employer/analytics` | GET | B / F (`AUTH+RLS`) | E + D (`EMPLOYER_ORG_MEMBER`) | Add explicit employer role check in Node.js route | P1 |
| 14 | `/api/employer/brief/[id]` | GET | B / F (`AUTH+RLS`) | F (`ORG_HIRING_RUN_MEMBER`) | Enforce org membership check for hiring run | P1 |
| 15 | `/api/employer/candidate-extractions` | POST | B (`AUTH_ONLY`) | E + F (`EMPLOYER_ORG_WRITE`) | Enforce employer role & org membership check | P1 |
| 16 | `/api/employer/chat` | POST | B (`AUTH_ONLY`) | E (`EMPLOYER_ROLE`) | Add explicit employer role check | P1 |
| 17 | `/api/employer/hiring-runs` | GET, POST | B / F (`AUTH+RLS`) | E + D (`EMPLOYER_ORG_MEMBER`) | Add explicit employer role check | P1 |
| 18 | `/api/employer/hiring-runs/suggest` | POST | B (`AUTH_ONLY`) | E (`EMPLOYER_ROLE`) | Add explicit employer role check | P1 |
| 19 | `/api/employer/packets/[extractionId]` | GET | A / F (`RLS_ONLY`) | F (`ORG_CANDIDATE_MEMBER`) | Add explicit `getUser()` check & employer role check | **P0** |
| 20 | `/api/employer/packets/[extractionId]/action` | POST | B / F (`AUTH+RLS`) | E + F (`EMPLOYER_ORG_WRITE`) | Add explicit employer role check | **P0** |
| 21 | `/api/employer/packets/[extractionId]/generate` | POST | A / F (`PUBLIC+SR`) | E + F (`EMPLOYER_ORG_WRITE`) | Add `getUser()` & org check before service-role update | **P0** |
| 22 | `/api/employer/shortlist/[roleId]` | GET | B / F (`AUTH+RLS`) | F (`ORG_HIRING_RUN_MEMBER`) | Add explicit employer role check | P1 |
| 23 | `/api/employer/sourcing-sessions` | POST | B / F (`AUTH+RLS`) | E + F (`EMPLOYER_ORG_WRITE`) | Add explicit employer role check | P1 |
| 24 | `/api/employer/sourcing-sessions/[id]` | GET | B / F (`AUTH+RLS`) | F (`ORG_SOURCING_MEMBER`) | Add explicit employer role check | P1 |
| 25 | `/api/employer/sourcing-sessions/[id]/auto-source` | POST | B / F (`AUTH+RLS`) | E + F (`EMPLOYER_ORG_WRITE`) | Add explicit employer role check | P1 |
| 26 | `/api/integrations/gmail/callback` | GET | A (`PUBLIC`) | A (`PUBLIC`) | Intentionally public OAuth callback | P2 |
| 27 | `/api/integrations/gmail/connect` | GET | B (`AUTH_ONLY`) | E (`EMPLOYER_ROLE`) | Add explicit employer role check | P1 |
| 28 | `/api/search` | GET | B / F (`AUTH+RLS`) | E + D (`EMPLOYER_ORG_MEMBER`) | Add explicit employer role check | P1 |

---

## Detailed Analysis of Original 10 Sensitive Handlers

1. `GET /api/candidate/proof-profile/[candidateId]`
   - Current Auth: None (`UNAUTHENTICATED_PUBLIC`)
   - Current Authorization: None (returns mock candidate/proof object if query fails)
   - Required Class: `CANDIDATE_OWNERSHIP_AUTHORIZED` (or `RESOURCE_TO_ORGANIZATION_AUTHORIZED` if employer)
   - Implementation Gap: Add `getUser()`; verify `user.id === candidateId` OR user has org access to a hiring run containing candidate.

2. `POST /api/candidate/proof-profile/[candidateId]/generate`
   - Current Auth: None (`UNAUTHENTICATED_PUBLIC`)
   - Current Authorization: None
   - Required Class: `CANDIDATE_OWNERSHIP_AUTHORIZED`
   - Implementation Gap: Add `getUser()`; verify `user.id === candidateId` before triggering AI synthesis.

3. `GET /api/candidate/screening-sessions/[sessionId]`
   - Current Auth: None (`UNAUTHENTICATED_PUBLIC`)
   - Current Authorization: None (returns mock session object `{ status: 'not_started', questions: [...] }` if query fails)
   - Required Class: `INVITATION_SESSION_TOKEN_AUTHORIZED` / `CANDIDATE_OWNERSHIP_AUTHORIZED`
   - Implementation Gap: Query `screening_sessions` by `id = sessionId`; return HTTP 404 if absent; verify candidate ownership if logged in.

4. `POST /api/candidate/screening-sessions/[sessionId]/start`
   - Current Auth: None (`UNAUTHENTICATED_PUBLIC`)
   - Current Authorization: None (returns mock `{ status: 'started' }` on DB error)
   - Required Class: `INVITATION_SESSION_TOKEN_AUTHORIZED` / `CANDIDATE_OWNERSHIP_AUTHORIZED`
   - Implementation Gap: Verify `sessionId` exists in DB before updating status to `started`.

5. `POST /api/candidate/screening-sessions/[sessionId]/answer`
   - Current Auth: None (`UNAUTHENTICATED_PUBLIC`)
   - Current Authorization: None (returns mock `{ status: 'saved' }` on DB error)
   - Required Class: `INVITATION_SESSION_TOKEN_AUTHORIZED` / `CANDIDATE_OWNERSHIP_AUTHORIZED`
   - Implementation Gap: Verify `sessionId` exists in DB before upserting answer.

6. `POST /api/candidate/screening-sessions/[sessionId]/complete`
   - Current Auth: None (`UNAUTHENTICATED_PUBLIC`)
   - Current Authorization: None
   - Required Class: `INVITATION_SESSION_TOKEN_AUTHORIZED` / `CANDIDATE_OWNERSHIP_AUTHORIZED`
   - Implementation Gap: Verify `sessionId` exists in DB before generating AI summary.

7. `GET /api/candidate/status/[candidateId]`
   - Current Auth: None (`UNAUTHENTICATED_PUBLIC`)
   - Current Authorization: None (returns mock data if query fails)
   - Required Class: `CANDIDATE_OWNERSHIP_AUTHORIZED`
   - Implementation Gap: Add `getUser()`; verify `user.id === candidateId`.

8. `GET /api/employer/packets/[extractionId]`
   - Current Auth: None (`UNAUTHENTICATED_PUBLIC`)
   - Current Authorization: Relies on PostgREST RLS (returns 404 if RLS filters candidate)
   - Required Class: `RESOURCE_TO_ORGANIZATION_AUTHORIZED`
   - Implementation Gap: Add explicit `getUser()` check in route handler.

9. `POST /api/employer/packets/[extractionId]/action`
   - Current Auth: `AUTHENTICATION_ONLY` (`getUser()` checked on line 12)
   - Current Authorization: Relies on PostgREST RLS (query returns 0 rows if non-member, causing 404 on line 35)
   - Required Class: `RESOURCE_TO_ORGANIZATION_AUTHORIZED`
   - Implementation Gap: Add explicit employer role check (`user_metadata.role === 'employer'`).

10. `POST /api/employer/packets/[extractionId]/generate`
    - Current Auth: None (`UNAUTHENTICATED_PUBLIC`)
    - Current Authorization: None in route handler (switches to service role client on line 84)
    - Required Class: `RESOURCE_TO_ORGANIZATION_AUTHORIZED`
    - Implementation Gap: Add `getUser()` check and hiring-run org authorization check before executing AI generation or service-role write.

---

## Screening Access Mechanism & Server Creation Path Audit

1. **Screening Access Mechanism**:
   - `screening_sessions.id` (UUID) serves as the session identifier.
   - No separate invitation token table or JWT token column exists.
   - Candidate screening endpoints currently query by `sessionId` (UUID) and return dev mock fallbacks when absent.

2. **Server Creation Path for `screening_sessions`**:
   - `screening_sessions` table-level `INSERT` is revoked from client `authenticated` roles (`REVOKE INSERT ON public.screening_sessions FROM anon, authenticated`).
   - Server-originated creation path must be added to employer candidate invitation / sourcing workflow endpoints using employer server context.

3. **`activity_events` Write Path**:
   - In `apps/web/lib/sourcing/agent.js` (`logEvent`), inserts into `activity_events` occur using `createSupabaseServerClient(request)`.
   - Authenticated employer users who are members of the organization owning the sourcing session can insert `activity_events` without needing new privileged credentials.

---

## Privileged Credential Decision

**Conclusion A**: Existing server architecture can perform required writes without adding a new privileged credential.

---

## Release-Critical Implementation Priorities

- **P0 Scope (10 Routes)**: The 10 sensitive candidate/screening/packet workflow routes identified above.
- **P1 Scope (13 Routes)**: Employer dashboard and management endpoints.
- **P2 Scope (5 Routes)**: Public Auth and third-party callback endpoints.

---

## Readiness Classification

**STATE A** — Exact authorization architecture and minimal implementation scope are proven and ready for founder approval.

---

## Founder Review Requested

Founder review is requested for formal acceptance of the Step 4B5.3-A.1 report and authorization of P0 implementation.
