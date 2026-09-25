# Step 4B2.1D1 Safe Rollback Guide

**Objective:** Revert Step 4B2.1D1 entity repairs and documentation back to the approved `step4b2-1d1-pre-entity-fixes` Git tag.

---

## 1. Safety Boundaries

- **Repository Scope:** Operates strictly inside `/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo`.
- **Precondition:** Confirm working directory is inside `careertwin-monorepo`.
- **Target Tag:** `step4b2-1d1-pre-entity-fixes`.

---

## 2. Preferred Rollback Execution Commands

Execute from inside `careertwin-monorepo`:

```bash
# 1. Confirm working directory is inside careertwin-monorepo
pwd

# 2. Reset tracked files and commits to step4b2-1d1-pre-entity-fixes tag
git reset --hard step4b2-1d1-pre-entity-fixes

# 3. Clean untracked/ignored build artifacts inside apps/web only (dry-run first)
git clean -ndx -- apps/web/node_modules apps/web/.next
git clean -fdx -- apps/web/node_modules apps/web/.next
```
