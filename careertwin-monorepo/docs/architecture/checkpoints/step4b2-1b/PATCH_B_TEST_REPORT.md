# Patch B Vitest Execution Report

**Target Application:** `careertwin-monorepo/apps/web`  
**Date:** July 31, 2026  
**Command Executed:** `./node_modules/vitest/vitest.mjs run` (Offline non-watch test mode)  
**Status:** Infrastructure Installed — Test Suite Code Fixes Required  

---

## 1. Execution Summary

- **Module Resolution:** `@testing-library/jest-dom` **RESOLVED SUCCESSFULLY** from `__tests__/setup.js`.
- **Total Test Suites:** 4 test suites
- **Passed Test Suites:** 0
- **Failed Test Suites:** 4 test suites
- **Total Tests Executed:** 4 individual tests
- **Passed Tests:** 2 passed
- **Failed Tests:** 2 failed

---

## 2. Detailed Test Results & Failure Classification

### Passed Tests (2)
1. `__tests__/api/candidate.test.js` > `GET returns 401 if not logged in` (PASSED)
2. `__tests__/api/candidate.test.js` > `GET returns profile if logged in` (PASSED)

### Unmasked Test Code & Syntax Failures (4 Suites)
1. `__tests__/components/ProtectedRoute.test.js`:  
   - **Error:** `Failed to parse source for import analysis because the content contains invalid JS syntax.`  
   - **Cause:** File contains JSX syntax in a `.js` extension without `.jsx` file extension or Vite JSX transform configuration for test files.

2. `__tests__/pages/AuthPage.test.js`:  
   - **Error:** `RolldownError: Parse failure: Unexpected JSX expression.`  
   - **Cause:** File contains JSX syntax in a `.js` extension without `.jsx` file extension or Vite JSX transform configuration.

3. `__tests__/api/candidate.test.js` > `POST upserts profile data`:  
   - **Error:** `AssertionError: expected 500 to be 200` (`TypeError: supabase.from(...).upsert(...).select is not a function`).  
   - **Cause:** Test mock `upsertMock` does not chain `.select()` expected by `app/api/candidate/profile/route.js`.

4. `__tests__/api/employer.test.js` > `POST creates a new hiring run`:  
   - **Error:** `AssertionError: expected 500 to be 200` (`TypeError: supabase.from(...).insert(...).select is not a function`).  
   - **Cause:** Test mock `insertMock` does not chain `.select()` expected by `app/api/employer/hiring-runs/route.js`.

---

## 3. Governance Protocol Action

In accordance with Step 4B2.1B instructions:
- Test source files were **NOT** modified or renamed to force test passes.
- Test infrastructure dependency `@testing-library/jest-dom` was successfully installed.
- Unmasked test code repairs are documented for founder review.
