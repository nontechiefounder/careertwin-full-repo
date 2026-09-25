# Step 4B5A Execution Evidence

**Date:** August 2, 2026  
**Task:** Evidence artifact for Step 4B5A (Complete Server API Authorization Matrix & Mock-Auth Decommission Plan).

---

## 1. Route-by-Route Code Inspection Evidence (All 28 API Handlers)

### A. Auth Routes (4 Routes)
1. `apps/web/app/api/auth/confirm/route.js`: Handles OAuth/Email confirmation. Calls `createSupabaseServerClient`. Unauthenticated.
2. `apps/web/app/api/auth/me/route.js`: Fetches current profile. Calls `supabase.auth.getUser()`. Checks `role`.
3. `apps/web/app/api/auth/signin/route.js`: Sign-in handler. Contains hardcoded `[REDACTED: development credential email]` / `[REDACTED: development credential password]` mock-token path.
4. `apps/web/app/api/auth/signup/route.js`: Public registration handler. Calls `supabase.auth.signUp()`.

### B. Candidate Routes (8 Routes)
5. `apps/web/app/api/candidate/profile/route.js`: GET/POST profile. Calls `getUser()`. No role check. No `org_id`.
6. `apps/web/app/api/candidate/proof-profile/[candidateId]/generate/route.js`: POST generate proof packet. Uses service role (`useServiceRole = true`). No `getUser()`.
7. `apps/web/app/api/candidate/proof-profile/[candidateId]/route.js`: GET proof profile. Public access. No `getUser()`.
8. `apps/web/app/api/candidate/screening-sessions/[sessionId]/answer/route.js`: POST answer. No `getUser()`.
9. `apps/web/app/api/candidate/screening-sessions/[sessionId]/complete/route.js`: POST complete session. No `getUser()`.
10. `apps/web/app/api/candidate/screening-sessions/[sessionId]/route.js`: GET session state. No `getUser()`.
11. `apps/web/app/api/candidate/screening-sessions/[sessionId]/start/route.js`: POST start session. No `getUser()`.
12. `apps/web/app/api/candidate/status/[candidateId]/route.js`: GET candidate status. No `getUser()`.

### C. Employer Routes (13 Routes)
13. `apps/web/app/api/employer/analytics/route.js`: GET analytics. Calls `getUser()`. No role check.
14. `apps/web/app/api/employer/brief/[id]/route.js`: GET brief. Calls `getUser()`. Checks `role`.
15. `apps/web/app/api/employer/candidate-extractions/route.js`: POST extractions. Uses service role. Calls `getUser()`.
16. `apps/web/app/api/employer/chat/route.js`: POST chat message. Uses service role. Calls `getUser()`.
17. `apps/web/app/api/employer/hiring-runs/route.js`: GET/POST hiring runs. Calls `getUser()`. Checks `role`.
18. `apps/web/app/api/employer/hiring-runs/suggest/route.js`: POST role suggestions. Uses service role. Calls `getUser()`.
19. `apps/web/app/api/employer/packets/[extractionId]/action/route.js`: POST reviewer override. Calls `getUser()`. Checks `role`.
20. `apps/web/app/api/employer/packets/[extractionId]/generate/route.js`: POST generate packet. Uses service role. Checks `role`. No `getUser()`.
21. `apps/web/app/api/employer/packets/[extractionId]/route.js`: GET packet. Public access. No `getUser()`.
22. `apps/web/app/api/employer/shortlist/[roleId]/route.js`: GET shortlist. Calls `getUser()`. No role check.
23. `apps/web/app/api/employer/sourcing-sessions/[id]/auto-source/route.js`: POST auto-source. Uses service role. Calls `getUser()`.
24. `apps/web/app/api/employer/sourcing-sessions/[id]/route.js`: GET session. Calls `getUser()`. No role check.
25. `apps/web/app/api/employer/sourcing-sessions/route.js`: POST session. Calls `getUser()`. No role check.

### D. Integration & Search Routes (3 Routes)
26. `apps/web/app/api/integrations/gmail/callback/route.js`: GET OAuth callback. Calls `getUser()`. No role check.
27. `apps/web/app/api/integrations/gmail/connect/route.js`: GET connect URL. Calls `getUser()`. No role check.
28. `apps/web/app/api/search/route.js`: GET search results. Calls `getUser()`. Checks `role`.

---

## 2. Mock-Token Source Evidence (4 Locations)

```javascript
// 1. app/api/auth/signin/route.js:18
-    [REDACTED: known hardcoded development credential condition removed]
  return NextResponse.json({
-    [REDACTED: synthetic mock user and mock session response removed]
    session: { access_token: 'mock-token', refresh_token: 'mock-refresh-token', expires_in: 3600, token_type: 'bearer' }
  });
}

// 2. lib/supabaseServer.js:33
if (sessionToken === 'mock-token') {
  return {
-    [REDACTED: synthetic mock user and mock session response removed]
    from: () => ({ /* stubbed table responses returning empty arrays */ }),
    isMock: true
  };
}

// 3. lib/auth.js:39
if (storedUser && storedToken === 'mock-token') {
  const parsed = JSON.parse(storedUser);
  if (parsed.is_mock) { setUser(parsed); setLoading(false); syncTokenToCookie('mock-token'); return; }
}

// 4. lib/auth.js:148
if (session.access_token === 'mock-token') {
  localStorage.setItem('ct_token', 'mock-token');
  syncTokenToCookie('mock-token');
  const mockUser = { id: user.id, email: user.email, role: 'employer', name: 'Admin Tester', is_mock: true };
  setUser(mockUser); localStorage.setItem('ct_user', JSON.stringify(mockUser)); return mockUser;
}
```

---

## 3. Targeted Logging Audit Evidence

- **`console.log` / `console.error` Count:** Found in 26 of 28 API handler files.
- **Log Contents:** Logs operational step identifiers (`[API Signin] Attempting login...`), error messages (`[SupabaseServer] Error reading cookies...`), and session token prefixes (`sessionToken?.substring(0, 5)`).
- **PII / Token Exposure:** No raw full JWT tokens or raw candidate resumes are logged. Logging is limited to IDs, prefixes, and safe operational status.

---

## 4. Quality Gates Verification

- **Application-Wide ESLint Output:** `npm exec --offline eslint -- .`
  - Total Errors: 0
  - Total Warnings: 3 (W07, W08, W09 — `@next/next/no-img-element` in `NaiveShell.jsx`, `MarketingFooter.jsx`, `MarketingNav.jsx`)
- **Full Vitest Test Suite Output:** `npm exec --offline vitest run`
  - Test Files: **9 passed (9)**
  - Total Tests: **65 passed (65)**
- **Next.js Production Build:** `node node_modules/next/dist/bin/next build`
  - Exit Code: **0**
  - Compiled Page Routes: **21 static/dynamic page routes**
  - Compiled API Route Handlers: **28 route-handler paths**

---

## 5. Route Reconciliation (28 API Route Paths)

- 4 Auth routes (`confirm`, `me`, `signin`, `signup`)
- 8 Candidate routes (`profile`, `proof-profile/[candidateId]`, `proof-profile/[candidateId]/generate`, `screening-sessions/[sessionId]`, `screening-sessions/[sessionId]/start`, `screening-sessions/[sessionId]/answer`, `screening-sessions/[sessionId]/complete`, `status/[candidateId]`)
- 13 Employer routes (`analytics`, `brief/[id]`, `candidate-extractions`, `chat`, `hiring-runs`, `hiring-runs/suggest`, `packets/[extractionId]`, `packets/[extractionId]/action`, `packets/[extractionId]/generate`, `shortlist/[roleId]`, `sourcing-sessions`, `sourcing-sessions/[id]`, `sourcing-sessions/[id]/auto-source`)
- 2 Integration routes (`gmail/connect`, `gmail/callback`)
- 1 Search route (`search`)
- **Total: 28 API Handler Paths**

---

## 6. Source Integrity & Package Hashes

- [x] Production source code (`apps/web/**`): **ZERO MODIFICATIONS**
- [x] Test files (`apps/web/__tests__/**`): **ZERO MODIFICATIONS**
- [x] `package.json` SHA256: `4c6f469f83690a45f50a77de1265e194da2459d8009a9b174a476de7e1b298bc` (Unchanged)
- [x] `package-lock.json` SHA256: `5e2b91af2a5cca1863026532467b7e6a7c6fccb90f2355554c99fd128bb77365` (Unchanged)
- [x] Git remote: None
- [x] Push / Deployment: None
