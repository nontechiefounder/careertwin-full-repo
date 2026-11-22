# Node.js & Package Baseline Specification

**Target Application:** `careertwin-monorepo/apps/web`  
**Date:** July 31, 2026  

---

## 1. System Environment Baseline

- **Operating System:** macOS 15.6.1 (`darwin`)
- **System Architecture:** `arm64` (Apple Silicon)
- **Node.js Version:** `v24.16.0`
- **npm Package Manager Version:** `11.13.0`

---

## 2. Package Manifest & Lockfile Baseline

- **Package Manifest File:** `apps/web/package.json`
- **Package Manifest SHA-256:** `0079745c23d8b690b1d228959c478f0bf980f52957470e79fd363e831e013842`
- **Package Lockfile File:** `apps/web/package-lock.json`
- **Package Lockfile SHA-256:** `acbcc7bb7c0d569830b3112d0d987f96c00f08f0635c6fb134ca227c96eaa5b6`
- **Lockfile Format Version:** `lockfileVersion: 2`
- **Engines Field in package.json:** None specified

---

## 3. Registered Package Scripts

- `"dev"`: `next dev --webpack`
- `"build"`: `next build`
- `"start"`: `next start`
- `"lint"`: `eslint`
- `"test"`: `vitest`
