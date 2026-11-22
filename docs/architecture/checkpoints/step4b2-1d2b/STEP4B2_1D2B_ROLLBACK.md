# Step 4B2.1D2B Rollback Guide

**Rollback Target:** `step4b2-1d2b-pre-typewriter-fix` (Commit `98bec50`)

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
git clean -ndx -- apps/web/.next apps/web/__tests__/components/TypewriterEffect.test.jsx

# 3. Hard reset to pre-change tag
git reset --hard step4b2-1d2b-pre-typewriter-fix

# 4. Remove untracked test and build artifacts
git clean -fdx -- apps/web/.next apps/web/__tests__/components/TypewriterEffect.test.jsx
```

After executing these commands, `components/marketing/TypewriterEffect.jsx` will be restored to commit `98bec50` baseline.
