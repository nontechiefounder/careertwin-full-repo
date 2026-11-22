# Local Build Artifact Cleanup Plan

**Target Scope:** `careertwin-monorepo/apps/web`  
**Date:** July 31, 2026  
**Status:** Preview-First Cleanup Procedure (Not executed in this task)  

---

## 1. Git Ignored File Protection Explanation

Standard `git clean -fd` only removes **untracked files that are NOT ignored** by `.gitignore`.  
Ignored directories and files—such as `node_modules/`, `.next/`, and `.env.local`—remain in the local working directory even after `git clean -fd`.

To preview and clean ignored build artifacts without risking committed source files or parent directories, use `git clean -xdf` with scoped path flags.

---

## 2. Safe Preview-First Cleanup Procedure

### Step A: Dry-Run Preview (NO Files Deleted)
Execute from `careertwin-monorepo/apps/web`:

```bash
# 1. Preview untracked & ignored files inside apps/web only
git clean -ndx -- apps/web/node_modules apps/web/.next apps/web/.env.local
```

### Step B: Scoped Cleanup Execution
Execute ONLY after confirming the dry-run output lists only the target build directories:

```bash
# 2. Safely remove ignored build artifacts inside apps/web only
git clean -fdx -- apps/web/node_modules apps/web/.next apps/web/.env.local
```

---

## 3. Safety Guarantees & Constraints

- **Scoped strictly to `apps/web`:** Will never target parent directories (`careertwin-monorepo/` root, `01-live-mvp-readonly/`, etc.).
- **No wildcard dot-directory deletions:** Avoids dangerous commands like `rm -rf .*`.
- **Zero committed file risk:** Only cleans untracked/ignored temporary build artifacts.
