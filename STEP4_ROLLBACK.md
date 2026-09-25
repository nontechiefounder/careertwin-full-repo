# Step 4A Rollback Plan & Execution Guide

**Scope:** Complete procedures to revert all Step 4A foundation changes.  
**Impact Assessment:** Low / Zero Risk. No source repositories (1–4), databases, or git histories were modified.

---

## 1. Rollback Overview

Step 4A added only non-executable scaffolding and documentation inside `careertwin-monorepo` and 5 review artifacts in the workspace root. Rollback requires removing these created files. Source directories (`01-live-mvp-readonly`, `02-backend-starter-readonly`, `03-ip-specs-readonly`, `04-golden-dataset-readonly`) remain 100% unaffected.

---

## 2. Step-by-Step Rollback Instructions

### Option A: Remove Monorepo Scaffolding & Restore Empty State
To reset `careertwin-monorepo` back to its empty initial state:

```bash
# Navigate to workspace root
cd "/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build"

# Empty the contents of careertwin-monorepo
rm -rf careertwin-monorepo/*
rm -rf careertwin-monorepo/.* 2>/dev/null || true
```

### Option B: Remove Step 4 Review Artifacts
To remove the Step 4 review artifact files created in the workspace root:

```bash
cd "/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build"

rm -f STEP4_FOUNDATION_SUMMARY.md
rm -f STEP4_FILE_TREE.txt
rm -f STEP4_EXCLUSION_REPORT.md
rm -f STEP4_SECRET_SCAN_REPORT.md
rm -f STEP4_ROLLBACK.md
```

---

## 3. Verification Post-Rollback

After running the rollback commands:
1. `careertwin-monorepo` will return to an empty directory.
2. Read-only source folders 1–4 remain unchanged.
3. No environment or lockfile cleanups are necessary because no dependencies or environments were installed.
