# Step 4B3A Rollback Guide

**Rollback Target:** `step4b3a-pre-browser-smoke` (Commit `d3767c7`)

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
git clean -ndx -- docs/architecture/checkpoints/step4b3a

# 3. Hard reset to pre-test tag
git reset --hard step4b3a-pre-browser-smoke

# 4. Remove step4b3a artifacts and screenshots
git clean -fdx -- docs/architecture/checkpoints/step4b3a
```
