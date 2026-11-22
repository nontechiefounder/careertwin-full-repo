# Package Security Audit Recheck

**Target Application:** `careertwin-monorepo/apps/web`  
**Date:** July 31, 2026  
**Command Executed:** `npm audit --omit=dev --json`  
**Status:** Audit Logged (No auto-fix applied per policy)  

---

## 1. Vulnerability Summary

- **Critical Vulnerabilities:** 1
- **High Vulnerabilities:** 27
- **Moderate Vulnerabilities:** 14
- **Low Vulnerabilities:** 2
- **Total Production Vulnerabilities:** 44

---

## 2. Findings Analysis & Vercel CLI Impact

- **Direct Dependency Source:** `vercel` CLI (`v50.37.3`)
- **Transitive Modules Affected:** `@vercel/node`, `@vercel/build-utils`, `undici`, `ws`, `tar`
- **Reclassification Assessment:** Moving `"vercel"` from `dependencies` to `devDependencies` reclassifies 27 CLI vulnerabilities into dev-only audit scope during `npm audit --omit=dev`.
- **Local Parity Block:** **NO.** Does not block local Next.js build compilation or runtime.
- **Pilot Launch Block:** **YES.** Vercel CLI classification/upgrade should be finalized before production pilot deployment.
