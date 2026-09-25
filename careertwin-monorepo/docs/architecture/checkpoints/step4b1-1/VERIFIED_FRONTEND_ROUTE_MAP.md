# Verified Frontend Route Map

**Generated From:** Actual filesystem scan of `careertwin-monorepo/apps/web/app`  
**Date:** July 31, 2026  

---

## 1. App Router Page Routes (21 Pages Total)

### Static Page Routes (14 Pages)
1. `/` — Product Landing (`app/page.jsx`)
2. `/about` — About Page (`app/about/page.jsx`)
3. `/auth` — Authentication Gateway (`app/auth/page.jsx`) [Uses `CTLogo`]
4. `/candidate/onboarding` — Candidate Onboarding (`app/candidate/onboarding/page.jsx`) [Uses `CTLogo`]
5. `/compare` — Product Comparison (`app/compare/page.jsx`)
6. `/contact` — Contact Form (`app/contact/page.jsx`)
7. `/employer` — Employer Dashboard (`app/employer/page.jsx`) [Uses `NaiveShell`]
8. `/employer/chat` — AI Chat Assistant (`app/employer/chat/page.jsx`) [Uses `CTLogo`]
9. `/employer/intake` — Role Intake Form (`app/employer/intake/page.jsx`) [Uses `NaiveShell`]
10. `/employer/integrations` — Integrations Hub (`app/employer/integrations/page.jsx`) [Uses `NaiveShell`]
11. `/employer/profile` — Employer Profile (`app/employer/profile/page.jsx`) [Uses `NaiveShell`]
12. `/pricing` — Pricing Table (`app/pricing/page.jsx`)
13. `/privacy` — Privacy Policy (`app/privacy/page.jsx`)
14. `/terms` — Terms of Service (`app/terms/page.jsx`)

### Dynamic Page Routes (7 Pages)
15. `/candidate/proof-profile/[candidateId]` — Candidate Profile (`app/candidate/proof-profile/[candidateId]/page.jsx`) [Uses `CTLogo`]
16. `/candidate/screen/[sessionId]` — AI Screen (`app/candidate/screen/[sessionId]/page.jsx`) [Uses `CTLogo`]
17. `/candidate/status/[candidateId]` — Candidate Status (`app/candidate/status/[candidateId]/page.jsx`) [Uses `CTLogo`]
18. `/employer/brief/[id]` — Role Brief Viewer (`app/employer/brief/[id]/page.jsx`) [Uses `NaiveShell`]
19. `/employer/packet/[extractionId]` — Decision Packet (`app/employer/packet/[extractionId]/page.jsx`) [Uses `NaiveShell`]
20. `/employer/shortlist/[roleId]` — Candidate Shortlist (`app/employer/shortlist/[roleId]/page.jsx`) [Uses `NaiveShell`]
21. `/employer/sourcing-session/[id]` — Sourcing Session (`app/employer/sourcing-session/[id]/page.jsx`) [Uses `NaiveShell`]

---

## 2. API Route Handlers (28 Endpoints Total)

### Authentication & User Endpoints (4)
- `POST` `/api/auth/signin` (`app/api/auth/signin/route.js`)
- `POST` `/api/auth/signup` (`app/api/auth/signup/route.js`)
- `GET` `/api/auth/me` (`app/api/auth/me/route.js`)
- `GET` `/api/auth/confirm` (`app/api/auth/confirm/route.js`)

### Employer & Intake Endpoints (13)
- `GET`, `POST` `/api/employer/analytics` (`app/api/employer/analytics/route.js`)
- `GET`, `PUT` `/api/employer/brief/[id]` (`app/api/employer/brief/[id]/route.js`)
- `GET`, `POST` `/api/employer/candidate-extractions` (`app/api/employer/candidate-extractions/route.js`)
- `POST` `/api/employer/chat` (`app/api/employer/chat/route.js`)
- `GET`, `POST` `/api/employer/hiring-runs` (`app/api/employer/hiring-runs/route.js`)
- `POST` `/api/employer/hiring-runs/suggest` (`app/api/employer/hiring-runs/suggest/route.js`)
- `GET` `/api/employer/packets/[extractionId]` (`app/api/employer/packets/[extractionId]/route.js`)
- `POST` `/api/employer/packets/[extractionId]/action` (`app/api/employer/packets/[extractionId]/action/route.js`)
- `POST` `/api/employer/packets/[extractionId]/generate` (`app/api/employer/packets/[extractionId]/generate/route.js`)
- `GET` `/api/employer/shortlist/[roleId]` (`app/api/employer/shortlist/[roleId]/route.js`)
- `GET`, `POST` `/api/employer/sourcing-sessions` (`app/api/employer/sourcing-sessions/route.js`)
- `GET` `/api/employer/sourcing-sessions/[id]` (`app/api/employer/sourcing-sessions/[id]/route.js`)
- `POST` `/api/employer/sourcing-sessions/[id]/auto-source` (`app/api/employer/sourcing-sessions/[id]/auto-source/route.js`)

### Candidate Endpoints (8)
- `GET`, `PUT` `/api/candidate/profile` (`app/api/candidate/profile/route.js`)
- `GET` `/api/candidate/proof-profile/[candidateId]` (`app/api/candidate/proof-profile/[candidateId]/route.js`)
- `POST` `/api/candidate/proof-profile/[candidateId]/generate` (`app/api/candidate/proof-profile/[candidateId]/generate/route.js`)
- `GET` `/api/candidate/screening-sessions/[sessionId]` (`app/api/candidate/screening-sessions/[sessionId]/route.js`)
- `POST` `/api/candidate/screening-sessions/[sessionId]/start` (`app/api/candidate/screening-sessions/[sessionId]/start/route.js`)
- `POST` `/api/candidate/screening-sessions/[sessionId]/answer` (`app/api/candidate/screening-sessions/[sessionId]/answer/route.js`)
- `POST` `/api/candidate/screening-sessions/[sessionId]/complete` (`app/api/candidate/screening-sessions/[sessionId]/complete/route.js`)
- `GET` `/api/candidate/status/[candidateId]` (`app/api/candidate/status/[candidateId]/route.js`)

### Integrations & Search Endpoints (3)
- `GET` `/api/integrations/gmail/connect` (`app/api/integrations/gmail/connect/route.js`)
- `GET` `/api/integrations/gmail/callback` (`app/api/integrations/gmail/callback/route.js`)
- `GET`, `POST` `/api/search` (`app/api/search/route.js`)

---

## 3. Layouts, Middleware & Boundaries

- **Layout Components (2):** `app/layout.js` (Global Root Layout), `app/employer/layout.jsx` (Employer Section Layout)
- **Middleware:** None (No `middleware.js` in source repository)
- **Custom Error / Loading / Not-Found Boundaries:** None in source repository

---

## 4. Route Incompleteness & Dependency Status

- **NaiveShell Dependency Resolution:** `components/NaiveShell.jsx` was copied unchanged to `apps/web/components/NaiveShell.jsx` in Part 1. All 14 dependent pages resolve their imports cleanly.
- **Excluded API Routes:** `app/api/dev/*` routes were excluded. Zero application pages depend on `/api/dev`.
- **Incomplete Routes:** Zero routes are incomplete or broken due to missing file dependencies.
