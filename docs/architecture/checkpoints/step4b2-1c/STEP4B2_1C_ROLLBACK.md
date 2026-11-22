# Step 4B2.1C Safe Rollback Guide

**Objective:** Revert Step 4B2.1C test file modifications and documentation back to the approved `step4b2-1b-build-passed` Git tag.

---

## 1. Safety Boundaries

- **Repository Scope:** Operates strictly inside `/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo`.
- **Precondition:** Confirm working directory is inside `careertwin-monorepo`.
- **Target Tag:** `step4b2-1b-build-passed`.

---

## 2. Preferred Rollback Execution Commands

Execute from inside `careertwin-monorepo`:

```bash
# 1. Confirm working directory is inside careertwin-monorepo
pwd

# 2. Reset tracked files and commits to step4b2-1b-build-passed tag
git reset --hard step4b2-1b-build-passed

# 3. Clean untracked/ignored build artifacts inside apps/web only (dry-run first)
git clean -ndx -- apps/web/node_modules apps/web/.next
git clean -fdx -- apps/web/node_modules apps/web/.next
```
