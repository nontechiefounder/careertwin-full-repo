# Frontend Exclusion List & Dependency Report

**Date:** July 31, 2026  
**Source Directory:** `/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/live-mvp-readonly`  
**Target Destination:** `careertwin-monorepo/apps/web`  

---

## 1. Excluded Items Matrix

| Excluded Item Path | Reason Excluded | Live Route / Import References |
|---|---|---|
| `.git/` | Local Git repository metadata | None |
| `.env.local` | Local environment secrets file | None (Accessed via `process.env`) |
| `.next/` | Next.js build cache | None |
| `.vercel/` | Vercel deployment cache | None |
| `.vscode/` | IDE user configuration | None |
| `node_modules/` | Installed dependency modules | None |
| `scratch/` | Temporary debug scripts (`verify_packet.js`, etc.) | None |
| `test-ai.js` | Known obsolete/unsafe root test script | None |
| `app/api/dev/` | Known obsolete/unsafe developer test API routes | None |
| `components/NaiveShell.jsx` | Known obsolete/unsafe component requiring explicit founder approval | **YES — Referenced by 14 UI page components** |

---

## 2. Detailed Dependency Report: `components/NaiveShell.jsx`

`components/NaiveShell.jsx` is listed as a known obsolete or unsafe item requiring explicit founder approval before copying. Static analysis reveals that excluding this file impacts 14 UI page components:

1. `app/employer/page.jsx` (Imports `NaiveShell`)
2. `app/employer/intake/page.jsx` (Imports `NaiveShell`)
3. `app/employer/brief/[id]/page.jsx` (Imports `NaiveShell`)
4. `app/employer/shortlist/[roleId]/page.jsx` (Imports `NaiveShell`)
5. `app/employer/packet/[extractionId]/page.jsx` (Imports `NaiveShell`)
6. `app/employer/profile/page.jsx` (Imports `NaiveShell`)
7. `app/employer/integrations/page.jsx` (Imports `NaiveShell`)
8. `app/employer/sourcing-session/[id]/page.jsx` (Imports `NaiveShell`)
9. `app/employer/chat/page.jsx` (Imports `CTLogo` from `NaiveShell`)
10. `app/auth/page.jsx` (Imports `CTLogo` from `NaiveShell`)
11. `app/candidate/onboarding/page.jsx` (Imports `CTLogo` from `NaiveShell`)
12. `app/candidate/proof-profile/[candidateId]/page.jsx` (Imports `CTLogo` from `NaiveShell`)
13. `app/candidate/screen/[sessionId]/page.jsx` (Imports `CTLogo` from `NaiveShell`)
14. `app/candidate/status/[candidateId]/page.jsx` (Imports `CTLogo` from `NaiveShell`)

---

## 3. Compliance Declaration

In strict compliance with Step 4B1 architecture rules:
- `components/NaiveShell.jsx` was **NOT** copied.
- No source files or page routes were edited to remove or alter these import references.
- Execution halts to report this dependency and request explicit founder approval on how `NaiveShell.jsx` and its 14 dependent routes should be handled in subsequent tasks.
