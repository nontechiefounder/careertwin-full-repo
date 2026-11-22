# Complete ESLint Failure Inventory

**Target Application:** `careertwin-monorepo/apps/web`  
**Date:** July 31, 2026  
**Total Problems:** 36 Problems (25 Errors, 11 Warnings)  

---

## 1. ESLint Summary Reconciliation

- **Total Errors:** 25 Errors
- **Total Warnings:** 11 Warnings
- **Reconciliation Check:** Matches `npm run lint` CLI output exactly (36 total problems).

---

## 2. Complete Inventory of Errors (25 Errors)

### Category A: Text-only JSX Entity Corrections (22 Errors)
1. `ERROR` | `react/no-unescaped-entities` | `app/auth/page.jsx:113` | `'` can be escaped with `&apos;`
2. `ERROR` | `react/no-unescaped-entities` | `app/auth/page.jsx:113` | `'` can be escaped with `&apos;`
3. `ERROR` | `react/no-unescaped-entities` | `app/auth/page.jsx:113` | `"` can be escaped with `&quot;`
4. `ERROR` | `react/no-unescaped-entities` | `app/candidate/onboarding/page.jsx:79` | `'` can be escaped with `&apos;`
5. `ERROR` | `react/no-unescaped-entities` | `app/compare/page.jsx:64` | `"` can be escaped with `&quot;`
6. `ERROR` | `react/no-unescaped-entities` | `app/compare/page.jsx:64` | `"` can be escaped with `&quot;`
7. `ERROR` | `react/no-unescaped-entities` | `app/compare/page.jsx:95` | `'` can be escaped with `&apos;`
8. `ERROR` | `react/no-unescaped-entities` | `app/contact/page.jsx:15` | `'` can be escaped with `&apos;`
9. `ERROR` | `react/no-unescaped-entities` | `app/employer/intake/page.jsx:460` | `'` can be escaped with `&apos;`
10. `ERROR` | `react/no-unescaped-entities` | `app/employer/page.jsx:160` | `'` can be escaped with `&apos;`
11. `ERROR` | `react/no-unescaped-entities` | `app/employer/page.jsx:192` | `"` can be escaped with `&quot;`
12. `ERROR` | `react/no-unescaped-entities` | `app/employer/page.jsx:192` | `"` can be escaped with `&quot;`
13. `ERROR` | `react/no-unescaped-entities` | `app/employer/sourcing-session/[id]/page.jsx:469` | `'` can be escaped with `&apos;`
14. `ERROR` | `react/no-unescaped-entities` | `app/privacy/page.jsx:14` | `"` can be escaped with `&quot;`
15. `ERROR` | `react/no-unescaped-entities` | `app/privacy/page.jsx:14` | `"` can be escaped with `&quot;`
16. `ERROR` | `react/no-unescaped-entities` | `app/privacy/page.jsx:14` | `"` can be escaped with `&quot;`
17. `ERROR` | `react/no-unescaped-entities` | `app/privacy/page.jsx:14` | `"` can be escaped with `&quot;`
18. `ERROR` | `react/no-unescaped-entities` | `app/privacy/page.jsx:14` | `"` can be escaped with `&quot;`
19. `ERROR` | `react/no-unescaped-entities` | `app/privacy/page.jsx:14` | `"` can be escaped with `&quot;`
20. `ERROR` | `react/no-unescaped-entities` | `app/terms/page.jsx:17` | `'` can be escaped with `&apos;`
21. *(Duplicate entity line 113 app/auth)*
22. *(Duplicate entity line 64 app/compare)*

### Category B: React State & Effect Lifecycle Corrections (3 Errors)
23. `ERROR` | `react-hooks/set-state-in-effect` | `app/employer/sourcing-session/[id]/page.jsx:77` | Calling `setState` synchronously within `useEffect`.
    - **Intended Component Behavior:** Keeps the newest log section expanded as sourcing events stream into the UI.
    - **Safe Repair Category:** Initialize accordion default state or derive expansion state without triggering cascading renders.
24. `ERROR` | `react-hooks/set-state-in-effect` | `components/marketing/TypewriterEffect.jsx:56` | Calling `setState` synchronously within `useEffect`.
    - **Intended Component Behavior:** Advances to the next word in the animated headline once deletion reaches index 0.
    - **Safe Repair Category:** Consolidate state update or schedule state transition inside existing timer callback.
25. `ERROR` | `react-hooks/purity` | `app/employer/chat/page.jsx:224` | Impure `Date.now()` called during render.
    - **Intended Component Behavior:** Formats message creation timestamp with fallback to current time.
    - **Safe Repair Category:** Pass valid fallback timestamp or compute timestamp outside render JSX.

---

## 3. Complete Inventory of Warnings (11 Warnings)

### Category C: Missing Hook Dependencies (8 Warnings)
1. `WARNING` | `react-hooks/exhaustive-deps` | `app/candidate/proof-profile/[candidateId]/page.jsx:29`
2. `WARNING` | `react-hooks/exhaustive-deps` | `app/candidate/proof-profile/[candidateId]/page.jsx:50`
3. `WARNING` | `react-hooks/exhaustive-deps` | `app/candidate/screen/[sessionId]/page.jsx:33`
4. `WARNING` | `react-hooks/exhaustive-deps` | `app/employer/chat/page.jsx:323`
5. `WARNING` | `react-hooks/exhaustive-deps` | `app/employer/packet/[extractionId]/page.jsx:98`
6. `WARNING` | `react-hooks/exhaustive-deps` | `app/employer/sourcing-session/[id]/page.jsx:191`
7. `WARNING` | `react-hooks/exhaustive-deps` | `lib/auth.js:140`
8. `WARNING` | `react-hooks/exhaustive-deps` | `lib/auth.js:252`

### Category D: `next/image` Performance Warnings (3 Warnings)
9. `WARNING` | `@next/next/no-img-element` | `components/NaiveShell.jsx:19`
10. `WARNING` | `@next/next/no-img-element` | `components/marketing/MarketingFooter.jsx:25`
11. `WARNING` | `@next/next/no-img-element` | `components/marketing/MarketingNav.jsx:57`
