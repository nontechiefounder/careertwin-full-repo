# Step 4B1 Safe Rollback Guide

**Objective:** Safely revert all Step 4B1 frontend copy changes and return `careertwin-monorepo` to the Step 4A foundation tag (`step4a-foundation`).

---

## 1. Safety Rules & Scope

- **Scope:** Reverts untracked files and commits inside `careertwin-monorepo` only.
- **Safety Precondition:** Ensure your terminal working directory is inside `/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo`.
- **Target Tag:** `step4a-foundation` (Created at the end of Step 4A).
- **Guarantees:** Does NOT modify parent directories or read-only source folders (`01-live-mvp-readonly`, etc.).

---

## 2. Preferred Git Rollback Commands

Run the following commands inside `careertwin-monorepo`:

```bash
# 1. Verify you are inside careertwin-monorepo
pwd

# 2. Reset repository history back to Step 4A foundation tag
git reset --hard step4a-foundation

# 3. Remove untracked files and directories created during Step 4B1
git clean -fd
```

### Command Explanation:
- `git reset --hard step4a-foundation`: Restores tracked files and git HEAD back to the exact commit tagged `step4a-foundation`.
- `git clean -fd`: Safely removes untracked files (`apps/web/*`) and untracked review directories inside `careertwin-monorepo`.
