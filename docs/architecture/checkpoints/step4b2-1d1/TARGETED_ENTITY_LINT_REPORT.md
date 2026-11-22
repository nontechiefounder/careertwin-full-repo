# Targeted Entity ESLint Report

**Target Paths:**
- `app/auth/page.jsx`
- `app/candidate/onboarding/page.jsx`
- `app/compare/page.jsx`
- `app/contact/page.jsx`
- `app/employer/intake/page.jsx`
- `app/employer/page.jsx`
- `app/employer/sourcing-session/[id]/page.jsx`
- `app/privacy/page.jsx`
- `app/terms/page.jsx`

**Date:** July 31, 2026  
**Command Executed:** `npx eslint app/auth/page.jsx app/candidate/onboarding/page.jsx app/compare/page.jsx app/contact/page.jsx app/employer/intake/page.jsx app/employer/page.jsx 'app/employer/sourcing-session/[id]/page.jsx' app/privacy/page.jsx app/terms/page.jsx`  

---

## 1. Targeted Findings Summary

- **Total `react/no-unescaped-entities` Errors Remaining:** 0 (PASSED)
- **Other Errors (Not Authorized for Fix):** 1
  - `app/employer/sourcing-session/[id]/page.jsx:77` | `react-hooks/set-state-in-effect`
- **Other Warnings (Not Authorized for Fix):** 1
  - `app/employer/sourcing-session/[id]/page.jsx:191` | `react-hooks/exhaustive-deps`

All unescaped entities in the target files have been successfully resolved.
