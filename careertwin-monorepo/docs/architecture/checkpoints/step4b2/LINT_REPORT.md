# Static Lint Quality Gate Report

**Target Application:** `careertwin-monorepo/apps/web`  
**Date:** July 31, 2026  
**Command Executed:** `npm run lint` (`eslint`)  
**Exit Code:** 1 (FAILED)  

---

## 1. Execution Summary

- **Exit Code:** 1
- **Duration:** 5 seconds
- **Total Problems:** 36 problems (25 Errors, 11 Warnings)
- **Status:** **FAILED — Quality Gate Blocked**

---

## 2. Categorized Failure Breakdown

### A. Unescaped HTML Entities in JSX (18 Errors)
- `app/employer/intake/page.jsx` (Line 460: unescaped `'`)
- `app/employer/page.jsx` (Lines 160, 192: unescaped `'` and `"`)
- `app/employer/sourcing-session/[id]/page.jsx` (Line 469: unescaped `'`)
- `app/privacy/page.jsx` (Line 14: unescaped `"`)
- `app/terms/page.jsx` (Line 17: unescaped `'`)

### B. React Hooks Rules Violation (3 Errors)
- `app/employer/sourcing-session/[id]/page.jsx` (Line 77: `react-hooks/set-state-in-effect` - Calling `setState` synchronously within `useEffect`)
- `components/marketing/TypewriterEffect.jsx` (Line 56: `react-hooks/set-state-in-effect`)

### C. Warnings (11 Warnings)
- Missing hook dependencies in `app/employer/packet/[extractionId]/page.jsx`, `app/employer/sourcing-session/[id]/page.jsx`, `lib/auth.js` (`react-hooks/exhaustive-deps`).
- HTML `<img>` tag usage instead of `next/image` in `components/NaiveShell.jsx`, `components/marketing/MarketingFooter.jsx`, `components/marketing/MarketingNav.jsx`.

---

## 3. Governance Protocol Action

In accordance with the Step 4B2 Failure Rule:
- Source code was **NOT** modified to fix lint errors in this task.
- Lint failure is documented as a blocker for Step 4B2.1 repair task.
