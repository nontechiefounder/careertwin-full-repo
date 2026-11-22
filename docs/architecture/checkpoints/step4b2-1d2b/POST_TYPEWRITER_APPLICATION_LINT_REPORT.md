# Post-Typewriter Application-Wide Lint Report

**Date:** August 1, 2026  
**Command:** `npm exec --offline eslint -- .`  

---

## 1. Application-Wide Summary

- **Total Errors:** 1
- **Total Warnings:** 11
- **`react/no-unescaped-entities` errors:** 0 (globally clean)
- **`react-hooks/purity` errors:** 0 (globally clean)
- **`react-hooks/set-state-in-effect` errors:** 1 remaining (pre-existing in `app/employer/sourcing-session/[id]/page.jsx`)

---

## 2. Error Reconciliation

| File | Line | Rule | Status |
|---|---|---|---|
| `components/marketing/TypewriterEffect.jsx` | 56 | `react-hooks/set-state-in-effect` | **RESOLVED (0 errors)** |
| `app/employer/sourcing-session/[id]/page.jsx` | 77 | `react-hooks/set-state-in-effect` | Pre-existing (out of scope) |

---

## 3. Warnings (11)

All 11 pre-existing `react-hooks/exhaustive-deps` warnings remain unchanged across the codebase. No new errors or warnings were introduced.
