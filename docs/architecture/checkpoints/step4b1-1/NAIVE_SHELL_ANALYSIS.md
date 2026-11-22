# NaiveShell.jsx Analysis & Dependency Audit

**Source File:** `live-mvp-readonly/components/NaiveShell.jsx`  
**Destination Path:** `careertwin-monorepo/apps/web/components/NaiveShell.jsx`  
**File Size:** 8,895 bytes  
**SHA-256 Hash:** `cb0c266369ad6b0cddc71d915529302f11b80400af939fc7a4eed72178d6c239`  
**Decision Outcome:** Copied Unchanged (Passes all Decision Criteria)  

---

## 1. Component Exports & Interface

1. `CTLogo` (Named Export): Brand logo mark rendering `/logo.svg`.
2. `NaiveShell` (Default Export): Shared 3-panel employer workspace layout (Left Sidebar Navigation, Top Action/Header Bar, Main Content Area, Right Active Tasks Panel).

---

## 2. Dependent Pages Audit (14 Pages)

| Dependent Page Path | Export Used | Usage Purpose |
|---|---|---|
| `app/employer/page.jsx` | `NaiveShell` | Main employer dashboard 3-panel shell layout |
| `app/employer/intake/page.jsx` | `NaiveShell` | Role intake form layout container |
| `app/employer/brief/[id]/page.jsx` | `NaiveShell` | Role brief viewer shell container |
| `app/employer/shortlist/[roleId]/page.jsx` | `NaiveShell` | Candidate shortlist shell container |
| `app/employer/packet/[extractionId]/page.jsx` | `NaiveShell` | Candidate decision packet shell container |
| `app/employer/profile/page.jsx` | `NaiveShell` | Employer settings shell container |
| `app/employer/integrations/page.jsx` | `NaiveShell` | Integrations hub shell container |
| `app/employer/sourcing-session/[id]/page.jsx` | `NaiveShell` | Sourcing session shell container |
| `app/employer/chat/page.jsx` | `CTLogo` | Sidebar brand logo header |
| `app/auth/page.jsx` | `CTLogo` | Auth page brand logo header |
| `app/candidate/onboarding/page.jsx` | `CTLogo` | Candidate onboarding logo header |
| `app/candidate/proof-profile/[candidateId]/page.jsx` | `CTLogo` | Candidate profile logo header |
| `app/candidate/screen/[sessionId]/page.jsx` | `CTLogo` | Screening session logo header |
| `app/candidate/status/[candidateId]/page.jsx` | `CTLogo` | Application status logo header |

---

## 3. Safety & Content Assessment

- **Layout & Navigation:** Contains structural sidebar navigation, collapsible headers, router navigation items, and layout panels.
- **Brand Logo:** Contains `CTLogo` rendering `/logo.svg`.
- **Hardcoded Candidate Data:** **NO.** Contains zero candidate records, candidate names, or profile data.
- **Heuristic Scoring Logic:** **NO.** Contains zero matching, evaluation, or scoring formulas.
- **Network Calls:** **NO.** Contains zero fetch or API calls.
- **Environment Variables:** **NO.** Accesses zero environment variables.
- **Credentials & Keys:** **NO.** Contains zero API keys, secrets, or passwords.
- **Database Mutations:** **NO.** Contains zero database access logic.
- **Build Parity Requirement:** **YES.** Required to satisfy imports across 14 UI page components.

---

## 4. Decision Rule Verification

In accordance with Step 4B1.1 rules:
- Contains no credentials.
- Contains no real candidate records.
- Contains no direct production mutation.
- Is strictly required for copied pages to compile and maintain visual parity.

`components/NaiveShell.jsx` has been copied unchanged to `apps/web/components/NaiveShell.jsx`.
