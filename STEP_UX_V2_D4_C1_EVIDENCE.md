# STEP_UX_V2_D4_C1_EVIDENCE

## 1. Git Metadata Location Outputs

### 1.1 `git rev-parse --absolute-git-dir`
```text
Exit Code: 0
/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo/.git
```

### 1.2 `git rev-parse --git-path index`
```text
Exit Code: 0
.git/index
```

### 1.3 `git rev-parse --git-path objects`
```text
Exit Code: 0
.git/objects
```

### 1.4 `git rev-parse --verify HEAD`
```text
Exit Code: 0
583ddd8100e3c1f6ec8956f0d99a7c9b58d0145c
```

### 1.5 `git branch --show-current`
```text
Exit Code: 0
antigravity/step4b2-frontend-parity
```

### 1.6 Index Filesystem Check
```text
Path: /Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo/.git/index
Exists: False
Index-related files in .git directory: ['index.lock', 'index 2']
```

### 1.7 `.git/objects/pack` Inventory
```text
pack-d51c61854d89461ae6aa70214ed475981649e7dc.idx:
  Size: 8,772 bytes | Mode: 0400 (-r--------) | Uid: 501 | Gid: 20
  Flags: hidden | Attributes: com.apple.provenance (11)
  Modify: Fri Jul 31 21:00:01 2026

pack-d51c61854d89461ae6aa70214ed475981649e7dc.pack:
  Size: 460,782 bytes | Mode: 0400 (-r--------) | Uid: 501 | Gid: 20
  Flags: hidden
  Modify: Fri Jul 31 21:00:01 2026

pack-d51c61854d89461ae6aa70214ed475981649e7dc.rev:
  Size: 1,152 bytes | Mode: 0400 (-r--------) | Uid: 501 | Gid: 20
  Flags: hidden | Attributes: com.apple.provenance (11)
  Modify: Fri Jul 31 21:00:01 2026
```

---

## 2. Commit Object Accessibility Outputs

### 2.1 `git cat-file -e HEAD^{commit}`
```text
Exit Code: 0
Stdout: (empty)
Stderr: (empty)
```

### 2.2 `git cat-file -e HEAD^{tree}`
```text
Exit Code: 0
Stdout: (empty)
Stderr: (empty)
```

### 2.3 `git ls-tree -r --name-only HEAD`
```text
Exit Code: 0
Total Paths Returned: 701
Stderr: (empty)
```

### 2.4 `git show HEAD:apps/web/run_gates.sh`
```text
Exit Code: 0
Committed Stream Bytes: 24,191
Committed Stream SHA-256: e6f5348667c5608b7655835b261291edc846baa71e7227e24ea6d7870bdb17cd
Working Runner Bytes: 24,191
Working Runner SHA-256: e6f5348667c5608b7655835b261291edc846baa71e7227e24ea6d7870bdb17cd
Exact Comparison Result: True (Match)
```

### 2.5 `git log -1 --format=%H -- apps/web/run_gates.sh`
```text
Exit Code: 0
80d3ad27df2676a52409dc02de01f33a791edf3c
```

---

## 3. Index Accessibility Outputs

### 3.1 `git ls-files --stage`
```text
Command: git -C /Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo ls-files --stage
Exit Code: 0
Stdout Line Count: 0
Stdout:
(empty)
Stderr:
(empty)
```

### 3.2 `git status --porcelain=v1 --untracked-files=all`
```text
Command: git -C /Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo status --porcelain=v1 --untracked-files=all
Exit Code: 0
Stdout Line Count: 1409
Stdout (first 10 lines):
 D .env.example
 D .gitignore
 D AGENTS.md
 D FOUNDER_BUILD_PROTOCOL.md
 D README.md
 D apps/web/.env.example
 D apps/web/.gitignore
 D apps/web/AGENTS.md
 D apps/web/CLAUDE.md
 D apps/web/Files/UX-V2-D3-C4-R5-COMBINED-EXECUTION.log
Stderr:
(empty)
```

### 3.3 `git diff --no-ext-diff --exit-code`
```text
Command: git -C /Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo diff --no-ext-diff --exit-code
Exit Code: 0
Stdout Line Count: 0
Stdout:
(empty)
Stderr:
(empty)
```

### 3.4 `git diff --cached --no-ext-diff --exit-code`
```text
Command: git -C /Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo diff --cached --no-ext-diff --exit-code
Exit Code: 128
Stdout Line Count: 1044
Stdout (first 5 lines):
diff --git a/.env.example b/.env.example
deleted file mode 100644
index f971b50..0000000
--- a/.env.example
+++ /dev/null
Stderr:
fatal: mmap failed: Operation timed out
```

---

## 4. Object Database Integrity Check

### 4.1 `git fsck --full --no-dangling`
```text
Command: git -C /Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo fsck --full --no-dangling
Exit Code: 128
Stdout Line Count: 0
Stdout:
(empty)
Stderr:
fatal: mmap failed: Operation timed out
```

---

## 5. Summary Classification
* **Classification:** `STATE B — GIT METADATA OR FILESYSTEM ACCESS BLOCKER; ROOT CAUSE NOT YET CONFIRMED`
* **Object Graph Access:** Commit & tree navigation verified (701 paths enumerable via `git ls-tree`).
* **Sequential Blob Traversal:** Inaccessible / timed out (`fatal: mmap failed: Operation timed out` on packfile).
* **Index Status:** `.git/index` absent on disk.
