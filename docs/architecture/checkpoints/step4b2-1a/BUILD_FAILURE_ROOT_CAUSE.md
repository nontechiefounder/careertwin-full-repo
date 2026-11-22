# Build Failure Root Cause Analysis

**Target Application:** `careertwin-monorepo/apps/web`  
**Date:** July 31, 2026  
**Command Executed:** `npm run build` (`next build`)  
**Status:** Diagnostic Complete — Root Cause Traced  

---

## 1. Exact Module-Resolution Failure Chain

```
app/employer/page.jsx [Server & Client Component]
  └── node_modules/recharts/es6/cartesian/Area.js
        └── node_modules/recharts/es6/util/ReactUtils.js
              └── import { isFragment } from 'react-is';
                    └── [ERROR] Module not found: Can't resolve 'react-is'
```

---

## 2. Findings & Package Analysis

1. **Does `react-is` exist in `node_modules`?**  
   It exists ONLY in nested sub-directories (`node_modules/pretty-format/node_modules/react-is` and `node_modules/prop-types/node_modules/react-is`). It does NOT exist at top-level `node_modules/react-is`.

2. **Does it exist in `package-lock.json`?**  
   It exists only as transitive dependencies of `pretty-format` and `prop-types`.

3. **Recharts Package Metadata:**  
   `recharts@3.8.1` (installed via `"recharts": "^3.6.0"`) depends on `react-is` at runtime to check React fragment nodes.

4. **Did the error arise because peer dependencies were bypassed during installation?**  
   Bypassing peer resolution during `--legacy-peer-deps` allowed `npm ci` to succeed, but left missing top-level peer packages unlinked in `node_modules`.

5. **Is adding `react-is` sufficient?**  
   Adding `"react-is": "^19.0.0"` to `dependencies` in `package.json` places `react-is` at root `node_modules/react-is`, fully satisfying Recharts and resolving the Turbopack build error.

6. **React 19 Compatibility:**  
   `react-is@^19.0.0` or `react-is@^18.3.1` is fully compatible with React 19 and Next.js 16.
