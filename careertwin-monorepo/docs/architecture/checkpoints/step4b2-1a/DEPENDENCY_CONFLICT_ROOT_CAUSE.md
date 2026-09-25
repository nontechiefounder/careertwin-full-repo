# Dependency Conflict Root Cause Analysis

**Target Application:** `careertwin-monorepo/apps/web`  
**Date:** July 31, 2026  
**Status:** Diagnostic Analysis Complete (No file changes made)  

---

## 1. Root Cause Analysis

### A. Standard `npm ci` Failure
Standard `npm ci` fails with `ERESOLVE could not resolve` due to a strict peer dependency conflict in `package.json`:
- `package.json` specifies `"date-fns": "^4.1.0"`
- `package.json` specifies `"react-day-picker": "8.10.1"`
- `react-day-picker@8.10.1` explicitly declares peer dependency `date-fns@"^2.28.0 || ^3.0.0"`.

Because npm 7+ and npm 11 enforce strict peer dependency resolution by default during `npm ci`, npm refuses to complete installation unless peer constraints are satisfied or `--legacy-peer-deps` is passed.

### B. Lockfile Provenance
The original lockfile (`package-lock.json`) was generated in an environment that used legacy peer resolution or an older npm version (e.g. npm 6) where peer conflicts were logged as non-blocking warnings rather than hard installation errors.

### C. Missing `react-is` Dependency
- `recharts@3.8.1` (installed via `"recharts": "^3.6.0"`) imports `import { isFragment } from 'react-is'` in `node_modules/recharts/es6/util/ReactUtils.js`.
- `react-is` is absent from top-level `dependencies` and `devDependencies` in `package.json`.
- `react-is` exists only as isolated dev sub-dependencies under `pretty-format` (`17.0.2`) and `prop-types` (`16.13.1`).
- During `next build` with Turbopack under React 19, module resolution fails because `react-is` is not available at top-level `node_modules/react-is`.

---

## 2. Answers to Diagnostic Questions

1. **Why did standard `npm ci` fail?**  
   Strict peer conflict: `date-fns@^4.1.0` in root conflicts with `react-day-picker@8.10.1` peer declaration `date-fns@"^2.28.0 || ^3.0.0"`.

2. **Was this lockfile originally created with peer conflicts?**  
   Yes. It was created with un-enforced peer conflicts under an older package manager configuration.

3. **Is `date-fns` 4 incompatible with `react-day-picker` 8.10.1?**  
   Declared peer range excludes v4 because `react-day-picker@8.10.1` predates `date-fns` v4 release. However, UI component `calendar.jsx` functions when peer resolution is bypassed.

4. **Does the current application actually use `react-day-picker`?**  
   Yes. `components/ui/calendar.jsx` imports `DayPicker` from `react-day-picker`.

5. **Does the current application actually use `date-fns` directly?**  
   Yes. `components/ui/calendar.jsx` and `app/employer/intake/page.jsx` import `format`, `addDays`, `subDays` from `date-fns`.

6. **Does the current application actually use Recharts?**  
   Yes. `app/employer/page.jsx` imports chart components from `recharts`.

7. **Why is `react-is` absent?**  
   Omitted from top-level `dependencies` in the original MVP `package.json`.

8. **Would adding `react-is` alone repair the dependency graph or merely hide one symptom?**  
   Adding `react-is` fixes the `next build` Turbopack module resolution error, but does not resolve the `date-fns` vs `react-day-picker` `npm ci` peer conflict. Both issues must be addressed coherently.

9. **What is the smallest coherent dependency correction?**  
   Add `"react-is": "^19.0.0"` to `dependencies` and `"@testing-library/jest-dom": "^6.4.5"` to `devDependencies`, while handling `react-day-picker` peer resolution explicitly.

10. **What dependency correction preserves the existing UI and behavior?**  
    Adding top-level `"react-is"` and `"@testing-library/jest-dom"` to `package.json` preserves 100% of existing UI, components, and tests without changing React 19 or Next.js 16.
