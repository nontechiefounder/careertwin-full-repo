# Step 4B1.1 Safe Git Rollback Guide

**Scope:** Procedures to revert Step 4B1.1 changes and reset `careertwin-monorepo` back to the Step 4A foundation tag (`step4a-foundation`).

---

## 1. Safety Boundaries

- **Local Git Repository Scope Only:** Operates strictly inside `/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo`.
- **Zero Parent Directory Manipulation:** Does NOT execute `rm -rf` commands or target parent directories.
- **Target Foundation Tag:** `step4a-foundation`.

---

## 2. Preferred Git Rollback Execution Commands

Execute the following commands from inside `careertwin-monorepo`:

```bash
# 1. Confirm current working directory is inside careertwin-monorepo
pwd

# 2. Reset tracked files and commits to Step 4A foundation tag
git reset --hard step4a-foundation

# 3. Clean untracked files inside careertwin-monorepo
git clean -fd
```

---

## 3. Post-Rollback Verification

- HEAD will point to commit `chore: establish controlled monorepo foundation`.
- All `apps/web/` copied frontend files will be removed.
- Read-only source repositories (`live-mvp-readonly`, etc.) remain 100% untouched.
