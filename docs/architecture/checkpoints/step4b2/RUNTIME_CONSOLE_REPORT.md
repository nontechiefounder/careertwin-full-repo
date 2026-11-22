# Runtime Console & Diagnostics Report

**Target Application:** `careertwin-monorepo/apps/web`  
**Date:** July 31, 2026  
**Status:** Build Error Diagnosed — Local Runtime Launch Blocked  

---

## 1. Quality Gate Diagnostics Log

### A. Lint Diagnostics
- `25 errors`, `11 warnings` reported during `npm run lint`.
- Errors caused by unescaped quotes in JSX and `setState` calls directly in `useEffect`.

### B. Test Diagnostics
- `4 test suites failed` during `npx vitest run`.
- Error: `Failed to resolve import "@testing-library/jest-dom" from "__tests__/setup.js"`.

### C. Build Diagnostics
- Exit code 1 during `npm run build`.
- Error: `Module not found: Can't resolve 'react-is'` from `node_modules/recharts/es6/util/ReactUtils.js`.

---

## 2. Browser Console Diagnostics Status

- **Browser Sessions Launched:** 0 (Server startup blocked by build error).
- **Console Errors Logged:** N/A.
- **Hydration Errors:** N/A.
