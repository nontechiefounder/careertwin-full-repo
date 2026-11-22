# Security-Sensitive Warning Review

**Date:** August 1, 2026  
**Task:** Step 4B4A  

---

## 1. Security-Sensitive Target Scope

The following 4 warning locations directly touch authentication, session persistence, or backend entity data fetching:

1. `lib/auth.js` (W10 & W11) — Authentication session lifecycle and cookie synchronization
2. `app/candidate/proof-profile/[candidateId]/page.jsx` (W01 & W02) — Candidate proof profile data loading and AI generation
3. `app/employer/packet/[extractionId]/page.jsx` (W05) — Decision packet generation and candidate evaluation retrieval
4. `app/employer/sourcing-session/[id]/page.jsx` (W06) — Sourcing copilot polling and event streaming

---

## 2. Security & Data Impact Analysis

### A. Authentication & Session Handling (`lib/auth.js` - W10, W11)
- **W10 (`useEffect` mount):** Omits `syncTokenToCookie` from `[]`. `syncTokenToCookie` writes `sb-<project>-auth-token` to document cookies for SSR header access. Because `syncTokenToCookie` is memoized with `useCallback(..., [])`, omitting it from the mount effect does **not** corrupt session initialization. Session token sync occurs correctly on mount.
- **W11 (`logout` callback):** Omits `syncTokenToCookie` from `useCallback(..., [])`. On logout, `syncTokenToCookie(null)` is called to clear the auth cookie. Omitting `syncTokenToCookie` from `logout`'s dependency array does not stale the closure because `syncTokenToCookie` itself has no reactive state dependencies.

### B. Candidate Proof Profile & AI Generation (`proof-profile` - W01, W02)
- **W01 & W02:** Omit `fetchData` and `generate`. `generate()` triggers an AI call to generate a candidate proof profile. `hasTriggered.current` prevents duplicate calls. However, if `fetchData` or `generate` were modified without updating dependencies, unexpected multi-triggering could occur.

### C. Decision Packet Data (`packet/[extractionId]` - W05)
- **W05:** Omits `fetchPacket`. `fetchPacket` retrieves decision packet data containing candidate scores and claims. Omitting `fetchPacket` from `[extractionId]` effect means packet re-fetching occurs only when `extractionId` changes, which is the correct URL route boundary.

### D. Sourcing Polling (`sourcing-session/[id]` - W06)
- **W06:** Omits `fetchData` from `[id]`. Polling runs on a 3000ms `setInterval`. The interval is bound to `id`. Omitting `fetchData` prevents interval tear-down/re-creation on every data update, keeping polling interval timing stable.

---

## 3. Summary Assessment

None of the 11 warnings currently introduce an active authentication bypass, token leakage, or cross-tenant data exposure in their existing state. However, repairing W10 and W11 in `lib/auth.js` should be handled in a dedicated auth-focused batch to guarantee zero regression in session persistence.
