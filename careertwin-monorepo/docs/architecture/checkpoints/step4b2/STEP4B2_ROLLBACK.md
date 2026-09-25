# Step 4B2 Safe Rollback Guide

**Objective:** Safely revert Step 4B2 documentation, dependencies, and temporary untracked build files back to the approved `step4b1-1-frontend-baseline` Git tag.

---

## 1. Safety Rules & Scope

- **Repository Scope:** Reverts changes inside `/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo` only.
- **Safety Precondition:** Confirm your terminal working directory is inside `careertwin-monorepo`.
- **Target Tag:** `step4b1-1-frontend-baseline`.
- **Parent Directory Protection:** Does NOT target parent directories or touch read-only source folders.

---

## 2. Preferred Git Rollback Execution Commands

Run the following commands inside `careertwin-monorepo`:

```bash
# 1. Confirm working directory is inside careertwin-monorepo
pwd

# 2. Reset git HEAD and working tree to step4b1-1-frontend-baseline
git reset --hard step4b1-1-frontend-baseline

# 3. Clean untracked files (such as node_modules, .next, .env.local, and step4b2 docs)
git clean -fd
```

---

## 3. Command Explanation & Safety Guarantees

- `git reset --hard step4b1-1-frontend-baseline`: Restores tracked repository files back to the exact commit tagged `step4b1-1-frontend-baseline`.
- `git clean -fd`: Safely removes untracked directories (`node_modules`, `.next`, `docs/architecture/checkpoints/step4b2/`) within the local Git working tree.
