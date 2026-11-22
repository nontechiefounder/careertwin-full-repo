# Node Runtime Compatibility Analysis

**Target Application:** `careertwin-monorepo/apps/web`  
**Date:** July 31, 2026  

---

## 1. Environment Analysis

- **Local Machine Node Version:** `v24.16.0` (Local macOS default)
- **Local Machine npm Version:** `11.13.0`
- **`package.json` Engines Field:** None specified
- **Next.js 16.2.1 System Requirements:** Node.js `>=18.18.0` (Supports Node 18, 20, 22, and 24)

---

## 2. Findings & Recommended Runtime

1. **Is Node 24 explicitly specified by the project?**  
   No. `package.json` contains no `engines` field, and no `.nvmrc` file exists in the repository. Node 24 is merely the local developer machine default.

2. **Next.js 16 Compatibility with Node 24:**  
   Next.js `16.2.1` supports Node 24 for build and execution. However, npm `11.13.0` enforces strict peer dependency resolution by default during `npm ci`, which causes installation failures on lockfiles generated under older npm versions (npm 6–9).

3. **Recommended Node Runtime for Parity Testing:**  
   Node.js `v20.x` LTS (or `v22.x` LTS) is recommended as the official target runtime for production deployment parity (matching standard Vercel Node 20 runtime defaults), while maintaining local Node 24 compatibility.

4. **Policy Boundary:**  
   No Node version changes or `.nvmrc` file creations were made during this task.
