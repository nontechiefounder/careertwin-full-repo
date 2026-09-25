# Warning Repair Batch Plan

**Date:** August 1, 2026  
**Task:** Step 4B4A  

---

## 1. Batching Strategy & Boundaries

To preserve isolation and prevent mixing authentication changes with visual or page-level changes, the 11 warnings are grouped into 4 distinct repair batches:

---

### BATCH A: Visual & Static Asset Warnings (3 warnings)

- **Target Files:** `components/NaiveShell.jsx`, `components/marketing/MarketingFooter.jsx`, `components/marketing/MarketingNav.jsx`
- **Warnings Included:** W07, W08, W09 (`@next/next/no-img-element`)
- **Scope:** Replace raw `<img>` logo tags with Next.js `<Image />` or inline SVG logo component.
- **Risk:** Zero logic risk. Pure layout/asset render.
- **Auth / Backend Required:** No.

---

### BATCH B: Data-Fetching Route Warnings (5 warnings)

- **Target Files:**
  - `app/candidate/proof-profile/[candidateId]/page.jsx` (W01, W02)
  - `app/candidate/screen/[sessionId]/page.jsx` (W03)
  - `app/employer/packet/[extractionId]/page.jsx` (W05)
  - `app/employer/sourcing-session/[id]/page.jsx` (W06)
- **Warnings Included:** W01, W02, W03, W05, W06 (`react-hooks/exhaustive-deps`)
- **Scope:** Wrap page-level `fetchData` / `fetchPacket` functions in `useCallback` and include them cleanly in `useEffect` dependency arrays.
- **Risk:** Low. Prevents infinite API fetch loops and timer instability.
- **Auth / Backend Required:** No (exercisable via Vitest mocks and synthetic parameters).

---

### BATCH C: Authentication & Session Provider Warnings (2 warnings)

- **Target Files:** `lib/auth.js`
- **Warnings Included:** W10, W11 (`react-hooks/exhaustive-deps`)
- **Scope:** Add memoized `syncTokenToCookie` to `useEffect` mount dependencies and `logout` callback dependencies in `AuthProvider`.
- **Risk:** High sensitivity. Requires dedicated auth unit and integration verification.
- **Auth / Backend Required:** Requires auth boundary verification.

---

### BATCH D: Interactive Chat Page Greeting Warning (1 warning)

- **Target Files:** `app/employer/chat/page.jsx`
- **Warnings Included:** W04 (`react-hooks/exhaustive-deps`)
- **Scope:** Convert interactive chip actions from closures (`() => sendMessage(...)`) to static data definitions to decouple chip handlers from `sendMessage` and `router`.
- **Risk:** Medium. Prevents chat greeting from re-triggering on user keystrokes.
- **Auth / Backend Required:** No.
