# Test Infrastructure Root Cause Analysis

**Target Application:** `careertwin-monorepo/apps/web`  
**Date:** July 31, 2026  
**Command Executed:** `npm exec --offline vitest run`  
**Status:** Diagnostic Complete — Root Cause Identified  

---

## 1. Test Setup Analysis

1. **Is `@testing-library/jest-dom` imported by the test setup?**  
   **YES.** `__tests__/setup.js` line 1 contains `import '@testing-library/jest-dom';`.

2. **Is it listed in `package.json`?**  
   **NO.** Omitted from `dependencies` and `devDependencies` in the source MVP `package.json`.

3. **Is it present in `package-lock.json`?**  
   **NO.** Not locked or referenced in `package-lock.json`.

4. **Is it present transitively in `node_modules`?**  
   **NO.** Not installed transitively by any other testing package.

5. **Is the test setup otherwise valid for the installed Vitest version?**  
   **YES.** `vitest.config.mjs` correctly configures `./__tests__/setup.js` as the global setup file using `@vitejs/plugin-react-swc` and `jsdom` environment.

6. **Are there likely additional failures hidden behind the missing module?**  
   Once `@testing-library/jest-dom` is present, the 4 test files (`AuthPage.test.js`, `ProtectedRoute.test.js`, `candidate.test.js`, `employer.test.js`) will execute. Some API tests may require mocked environment variables (`NEXT_PUBLIC_SUPABASE_URL`) to pass cleanly under Vitest.

7. **What is the minimal correct test dependency repair?**  
   Add `"@testing-library/jest-dom": "^6.4.5"` to `devDependencies` in `package.json`.

8. **Should the dependency be in `devDependencies`?**  
   **YES.** Testing utilities belong strictly in `devDependencies`.
