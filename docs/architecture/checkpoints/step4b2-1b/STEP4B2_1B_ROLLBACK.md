# Step 4B2.1B Safe Rollback Guide

**Objective:** Revert Step 4B2.1B package changes, documentation, and local commits back to the pre-repair diagnostic baseline tag (`step4b2-1a-diagnostic`).

---

## 1. Safety Boundaries

- **Repository Scope:** Reverts changes inside `/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo` only.
- **Safety Precondition:** Confirm current terminal working directory is inside `careertwin-monorepo`.
- **Target Baseline Tag:** `step4b2-1a-diagnostic`.

---

## 2. Preferred Git Rollback Commands

Execute the following commands from inside `careertwin-monorepo`:

```bash
# 1. Confirm working directory is inside careertwin-monorepo
pwd

# 2. Reset tracked files and commits to pre-repair diagnostic tag
git reset --hard step4b2-1a-diagnostic

# 3. Clean untracked/ignored build artifacts inside apps/web only (dry-run preview first)
git clean -ndx -- apps/web/node_modules apps/web/.next
git clean -fdx -- apps/web/node_modules apps/web/.next
```

---

## 3. Command Explanation & Guarantees

- `git reset --hard step4b2-1a-diagnostic`: Restores tracked repository files back to the exact commit tagged `step4b2-1a-diagnostic`.
- Scoped `git clean -fdx`: Safely removes ignored build artifacts (`node_modules`, `.next`) inside `apps/web` without touching parent directories or read-only folders.
