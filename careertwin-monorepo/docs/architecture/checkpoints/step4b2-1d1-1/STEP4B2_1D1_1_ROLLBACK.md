# Step 4B2.1D1.1 Safe Rollback Guide

**Objective:** Revert Step 4B2.1D1.1 source change back to the approved `step4b2-1d1-entity-lint-fixed` tag.

---

## 1. Safety Boundaries

- **Repository Scope:** Operates strictly inside `/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo`.
- **Precondition:** Confirm working directory is inside `careertwin-monorepo`.
- **Rollback Target Tag:** `step4b2-1d1-entity-lint-fixed`.

---

## 2. Rollback Execution Commands

Execute from inside `careertwin-monorepo`:

```bash
# 1. Confirm working directory
pwd

# 2. Preview what will be cleaned (dry-run first)
git clean -ndx -- apps/web/node_modules apps/web/.next

# 3. Reset to the approved baseline
git reset --hard step4b2-1d1-entity-lint-fixed

# 4. Clean build artifacts scoped to apps/web
git clean -fdx -- apps/web/node_modules apps/web/.next
```
