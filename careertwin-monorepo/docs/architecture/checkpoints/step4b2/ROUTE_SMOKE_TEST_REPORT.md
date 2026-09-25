# Route Smoke Test Report

**Target Application:** `careertwin-monorepo/apps/web`  
**Date:** July 31, 2026  
**Status:** BLOCKED — Local Server Startup Pending Build Repair  

---

## 1. Route Smoke Testing Scope

- **Total App Router Routes Identified:** 21 Pages (14 static, 7 dynamic)
- **Total API Route Handlers:** 28 Endpoints
- **Execution Status:** **BLOCKED.** Local server runtime startup was blocked because `npm run build` failed due to missing `react-is` peer dependency required by `recharts`.

---

## 2. Route Audit Matrix & Status

| Route Path | Type | Gating / Data Requirement | Smoke Test Status |
|---|---|---|---|
| `/` | Static | None | Blocked by Build Failure |
| `/about` | Static | None | Blocked by Build Failure |
| `/auth` | Static | None | Blocked by Build Failure |
| `/compare` | Static | None | Blocked by Build Failure |
| `/contact` | Static | None | Blocked by Build Failure |
| `/pricing` | Static | None | Blocked by Build Failure |
| `/privacy` | Static | None | Blocked by Build Failure |
| `/terms` | Static | None | Blocked by Build Failure |
| `/employer` | Static (Protected) | Requires Auth State & Recharts Component | Blocked by `react-is` Build Failure |
| `/employer/intake` | Static (Protected) | Form Input | Blocked by Build Failure |
| `/employer/brief/[id]` | Dynamic (Protected) | Role ID Parameter | Blocked by Build Failure |
| `/employer/shortlist/[roleId]` | Dynamic (Protected) | Shortlist Role ID Parameter | Blocked by Build Failure |
| `/employer/packet/[extractionId]` | Dynamic (Protected) | Extraction ID Parameter | Blocked by Build Failure |
| `/candidate/onboarding` | Static | Candidate Input | Blocked by Build Failure |
| `/candidate/status/[candidateId]` | Dynamic | Candidate ID Parameter | Blocked by Build Failure |

---

## 3. Recommended Remediation

Execute a focused **Step 4B2.1 Repair Task** to resolve package dependencies (`react-is`, `@testing-library/jest-dom`) without altering application code or business logic.
