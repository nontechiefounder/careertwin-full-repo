# Dependency Security Audit Report

**Target Application:** `careertwin-monorepo/apps/web`  
**Date:** July 31, 2026  
**Command Run:** `npm audit --omit=dev --json`  
**Status:** Audit Completed (No fixes applied per Step 4B2 policy)  

---

## 1. Vulnerability Summary Matrix

- **Critical Vulnerabilities:** 1
- **High Vulnerabilities:** 27
- **Moderate Vulnerabilities:** 14
- **Low Vulnerabilities:** 2
- **Total Production Vulnerabilities:** 44

---

## 2. Affected Direct & Transitive Dependencies

- **Direct Dependencies Affected:** `vercel` (`v50.37.3`)
- **Transitive Dependencies Affected:** `@vercel/node`, `@vercel/build-utils`, `undici`, `ws`, `tar`

---

## 3. Remediation Requirements & Impact Assessment

- **Major Version Upgrades Required:** YES (`isSemVerMajor: true` for `vercel` update to `v58.4.4`).
- **Blocks Local Parity Verification?** **NO.** Local compilation, linting, testing, and building proceed using preserved dependencies without modification.
- **Blocks Future Pilot Launch?** **YES.** Upgrading vulnerable production dependencies must be scheduled in subsequent maintenance milestones prior to pilot customer deployment.
