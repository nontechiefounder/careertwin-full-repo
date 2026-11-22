# Minimal Frontend Repair Plan (4-Patch Sequence)

**Target Application:** `careertwin-monorepo/apps/web`  
**Date:** July 31, 2026  
**Status:** Prepared for Founder Review (Zero Execution in this Task)  

---

## 1. Patch Sequence Overview

The proposed repair is structured into 4 independently reviewable, atomic patches:

```
[PATCH A: Runtime & Dependency Graph]
       ↓
[PATCH B: Test Infrastructure]
       ↓
[PATCH C: Lint Errors & Lifecycle Fixes]
       ↓
[PATCH D: Production Dependency Security Audit]
```

---

## 2. Detailed Patch Specifications

### PATCH A — Runtime & Dependency Graph
- **Proposed File Changes:** `apps/web/package.json`, `apps/web/package-lock.json`
- **Package Modifications:**
  1. Add `"react-is": "^19.0.0"` to `dependencies` (resolves Recharts build crash in `next build`).
  2. Align `react-day-picker` peer resolution or specify `peerDependenciesMeta` so `npm ci` succeeds cleanly without `--legacy-peer-deps`.
  3. Move `"vercel": "^50.37.3"` from `dependencies` to `devDependencies` (removes CLI tool from production runtime bundle).
- **Lockfile Change:** YES (Updated deterministically via clean `npm install`).
- **Tests to Run:** `npm run build`
- **Success Criteria:** `npm ci` passes cleanly without flags; `next build` compiles 21 routes without missing module errors.

### PATCH B — Test Infrastructure
- **Proposed File Changes:** `apps/web/package.json`, `apps/web/package-lock.json`
- **Package Modifications:** Add `"@testing-library/jest-dom": "^6.4.5"` to `devDependencies`.
- **Lockfile Change:** YES.
- **Tests to Run:** `npm test` (`npx vitest run`)
- **Success Criteria:** All 4 test suites (`AuthPage.test.js`, `ProtectedRoute.test.js`, `candidate.test.js`, `employer.test.js`) execute and pass cleanly.

### PATCH C — Lint Errors & Lifecycle Fixes
- **Proposed File Changes:**
  - `app/auth/page.jsx`
  - `app/candidate/onboarding/page.jsx`
  - `app/compare/page.jsx`
  - `app/contact/page.jsx`
  - `app/employer/intake/page.jsx`
  - `app/employer/page.jsx`
  - `app/employer/sourcing-session/[id]/page.jsx`
  - `app/privacy/page.jsx`
  - `app/terms/page.jsx`
  - `components/marketing/TypewriterEffect.jsx`
  - `app/employer/chat/page.jsx`
- **Code Modifications:**
  1. Escape unescaped JSX quotes using `&apos;` and `&quot;` (22 text entity fixes).
  2. Refactor synchronous `setState` in `useEffect` in `sourcing-session/[id]/page.jsx` and `TypewriterEffect.jsx` to prevent cascading renders.
  3. Extract `Date.now()` out of JSX render in `chat/page.jsx`.
  4. Fix missing hook dependencies.
- **Rules Bypassed or Suppressed:** **ZERO.** No `eslint-disable` comments added; no rules disabled.
- **Tests to Run:** `npm run lint`
- **Success Criteria:** Exit code 0 with 0 errors and 0 warnings.

### PATCH D — Production Dependency Security Audit
- **Command to Run:** `npm audit --omit=dev --json`
- **Target Result:** 0 critical/high production runtime vulnerabilities (achieved by classifying `vercel` CLI as a dev dependency).
