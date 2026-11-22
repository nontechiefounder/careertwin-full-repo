# Vercel Dependency Classification Report

**Target Package:** `vercel` (`v50.37.3`) in `apps/web/package.json`  
**Date:** July 31, 2026  

---

## 1. Classification Analysis

1. **Where is `vercel` listed?**  
   Listed under `dependencies` (production runtime dependencies) in `apps/web/package.json`.

2. **Is it imported in source code or tests?**  
   **NO.** Static code search across `app/`, `components/`, `lib/`, `hooks/`, and `__tests__/` confirms zero code imports or references to `vercel`.

3. **Is it invoked by a package script?**  
   **NO.** Not referenced in `dev`, `build`, `start`, `lint`, or `test` scripts.

4. **Is it required for local runtime or `next build`?**  
   **NO.** Next.js local development server (`next dev`) and production builder (`next build`) operate without `vercel` CLI.

5. **Is it only a deployment CLI tool?**  
   **YES.** The `vercel` npm package provides the Vercel Command Line Interface (CLI) for deployment operations.

6. **Should it remain a runtime dependency?**  
   **NO.** Placing a deployment CLI tool in production runtime `dependencies` inflates client/server bundle audits and introduces 27 transitive high/critical CLI vulnerabilities into `npm audit --omit=dev`.

7. **Impact of moving or removing `vercel`:**  
   Moving `vercel` to `devDependencies` or removing it from `apps/web` eliminates 27 transitive security vulnerabilities from `npm audit --omit=dev` without affecting Next.js compilation or local runtime.
