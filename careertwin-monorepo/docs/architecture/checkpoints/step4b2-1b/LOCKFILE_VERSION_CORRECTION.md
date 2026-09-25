# Lockfile Version Verification & Correction

**Target File:** `careertwin-monorepo/apps/web/package-lock.json`  
**Date:** July 31, 2026  

---

## 1. File Inspection Baseline

- **Source of Truth:** `apps/web/package-lock.json`
- **Actual `lockfileVersion` Value:** `2`
- **Node.js Version:** `v24.16.0`
- **npm Version:** `11.13.0`
- **`package.json` SHA-256:** `0079745c23d8b690b1d228959c478f0bf980f52957470e79fd363e831e013842`
- **`package-lock.json` SHA-256:** `acbcc7bb7c0d569830b3112d0d987f96c00f08f0635c6fb134ca227c96eaa5b6`

---

## 2. Reconciliation & Provenance Note

The actual `lockfileVersion` stored in `apps/web/package-lock.json` is `2` (the v2 format compatible with npm 7+ and npm 8–10, which includes both `dependencies` and modern `packages` schema). Any preliminary references suggesting lockfile format differences are hereby reconciled to `lockfileVersion: 2`.
