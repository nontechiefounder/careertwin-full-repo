# Step 4B2.1D2C-B Rollback Guide

**Rollback Target:** `step4b2-1d2c-b-pre-sourcing-effect-fix` (Commit `681ad1a`)

---

## 1. Safety Boundaries

- Repository location: `/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo`
- Operates locally only (no Git remotes exist).

---

## 2. Execution Commands

Execute from inside `careertwin-monorepo`:

```bash
# 1. Verify working directory
pwd

# 2. Preview items to be cleaned (dry run)
git clean -ndx -- apps/web/.next

# 3. Hard reset to pre-change tag
git reset --hard step4b2-1d2c-b-pre-sourcing-effect-fix

# 4. Remove build artifacts
git clean -fdx -- apps/web/.next
```

After executing these commands, `app/employer/sourcing-session/[id]/page.jsx` line 77 will be restored to commit `681ad1a` baseline.
