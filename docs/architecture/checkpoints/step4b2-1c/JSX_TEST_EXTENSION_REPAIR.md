# JSX Test Extension Repair Report

**Target Files:**
1. `apps/web/__tests__/components/ProtectedRoute.test.js` → `ProtectedRoute.test.jsx`
2. `apps/web/__tests__/pages/AuthPage.test.js` → `AuthPage.test.jsx`

**Date:** July 31, 2026  
**Status:** Renamed via `git mv` (Tracked as Git renames)  

---

## 1. Failure Diagnosis & Resolution

- **Root Cause:** In Vitest / Vite (`@vitejs/plugin-react-swc`), JavaScript files with `.js` extensions are parsed as strict ES modules. Files containing JSX components (`<ProtectedRoute />`, `<AuthPage />`, `<div>`) trigger SWC syntax errors (`Unexpected JSX expression` / `invalid JS syntax`) when compiled under `.js`.
- **Resolution:** Renamed files from `.js` to `.jsx`. The `.jsx` extension instructs Vite/SWC to parse JSX syntax cleanly without changing test logic or modifying global Vitest configuration.
- **Git Tracking Verification:** Git recorded both changes as clean file renames (`100% rename match`). Zero application source files import these test files.
