# STEP_UX_V2_D4_C1_R1_EVIDENCE

## 1. Source Recording Outputs (Read-Only)

```text
Source Repository: /Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo
Git Directory: /Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/careertwin-monorepo/.git
HEAD: 583ddd8100e3c1f6ec8956f0d99a7c9b58d0145c
Branch: antigravity/step4b2-frontend-parity
Tracked Paths in HEAD: 701
Runner SHA-256: e6f5348667c5608b7655835b261291edc846baa71e7227e24ea6d7870bdb17cd
Runner Last-Change Commit: 80d3ad27df2676a52409dc02de01f33a791edf3c

Packfile Inventory:
  pack-d51c61854d89461ae6aa70214ed475981649e7dc.idx: 8,772 B, sha256=ad4098278230...
  pack-d51c61854d89461ae6aa70214ed475981649e7dc.pack: 460,782 B, sha256=477a36bead3f...
  pack-d51c61854d89461ae6aa70214ed475981649e7dc.rev: 1,152 B, sha256=b6f63925e01a...

Index Candidates in Source:
  .git/index: ABSENT
  .git/index 2: 97,813 B, sha256=583e373a70c6...
  .git/index.lock: 0 B, sha256=e3b0c44298fc...
```

---

## 2. Non-Destructive Copy & Inventory Verification

* **Destination:** `/Users/darshilparmar/Developer/CareerTWiN-Recovery/careertwin-monorepo-583ddd8-20260924T113234Z`
* **Total Files Copied:** 60,024
* **Total Volume Copied:** 2,046.67 MB

---

## 3. Candidate Object Search & Exact `hash-object` Matching

### 3.1 Target: `996df5b92ae969aa819a4dac1bc18eeaa35e7170`
```text
Candidate File: .../apps/web/Files/UX-V2-D4-C1-AUDIT/__tests__/security/HostedP0EndToEndUAT.test.js
Command: git hash-object .../HostedP0EndToEndUAT.test.js
Output: 996df5b92ae969aa819a4dac1bc18eeaa35e7170
Match: EXACT
Write Command: git hash-object -w .../HostedP0EndToEndUAT.test.js
Exit Code: 0 (Wrote blob 996df5b92ae969aa819a4dac1bc18eeaa35e7170)
```

### 3.2 Target: `b13e72df67428c5299f2f68ffa80aa6c82fdafa4`
```text
Candidate File: .../apps/web/Files/UX-V2-D4-C1-AUDIT/__tests__/packet/CandidateTrustPacketE2E.test.js
Command: git hash-object .../CandidateTrustPacketE2E.test.js
Output: b13e72df67428c5299f2f68ffa80aa6c82fdafa4
Match: EXACT
Write Command: git hash-object -w .../CandidateTrustPacketE2E.test.js
Exit Code: 0 (Wrote blob b13e72df67428c5299f2f68ffa80aa6c82fdafa4)
```

---

## 4. Post-Restoration Object & Graph Checks

### 4.1 `git cat-file -e` for Restored Blobs
```text
Command: git -C ... cat-file -e 996df5b92ae969aa819a4dac1bc18eeaa35e7170
Exit Code: 0

Command: git -C ... cat-file -e b13e72df67428c5299f2f68ffa80aa6c82fdafa4
Exit Code: 0
```

### 4.2 `git fsck --full --no-dangling`
```text
Command: git -C /Users/darshilparmar/Developer/CareerTWiN-Recovery/careertwin-monorepo-583ddd8-20260924T113234Z fsck --full --no-dangling
Exit Code: 0
Stdout: (empty)
Stderr: (empty)
```

### 4.3 `git diff --cached --no-ext-diff --exit-code`
```text
Command: git -C /Users/darshilparmar/Developer/CareerTWiN-Recovery/careertwin-monorepo-583ddd8-20260924T113234Z diff --cached --no-ext-diff --exit-code
Exit Code: 0
Stdout: (empty - 0 diff lines)
```

### 4.4 `git status --porcelain=v1`
```text
Command: git -C /Users/darshilparmar/Developer/CareerTWiN-Recovery/careertwin-monorepo-583ddd8-20260924T113234Z status --porcelain=v1
Exit Code: 0
Output:
 D apps/web/__tests__/packet/CandidateTrustPacketE2E.manual.js
 M apps/web/app/api/employer/packets/[extractionId]/action/route.js
 M apps/web/app/api/employer/packets/[extractionId]/generate/route.js
?? apps/web/Files/UX-V2-D4-C1-CANCELLED-ATTEMPT.log
?? apps/web/Files/UX-V2-D4-C1-COMBINED-EXECUTION.log
?? apps/web/Files/UX-V2-D4-C1-FINAL-CANDIDATE-583ddd8100e3c1f6ec8956f0d99a7c9b58d0145c-20260829T180237Z-41036.log
?? apps/web/Files/UX-V2-D4-C1-FINAL-CANDIDATE-583ddd8100e3c1f6ec8956f0d99a7c9b58d0145c-20260829T181003Z-41224.log
?? apps/web/Files/UX-V2-D4-C1-GATE1-STALLED-34a7201-20260826T122318Z.log
?? apps/web/Files/UX-V2-D4-C1-STALLED-34a7201-20260826T122442Z.log
?? apps/web/Files/UX-V2-D4-C1-STALLED-34a7201-20260826T122558Z.log
?? apps/web/Files/UX-V2-D4-C1-WATCHDOG-PASS-34a7201-20260826T122709Z.log
?? apps/web/Files/gate4_employer_intake_route_actions_playwright.log
?? apps/web/Files/gate5_brief_playwright.log
?? recovery-evidence/
```

### 4.5 `git diff`
```text
Command: git -C /Users/darshilparmar/Developer/CareerTWiN-Recovery/careertwin-monorepo-583ddd8-20260924T113234Z diff
Exit Code: 0
Total Diff Lines: 521 lines
```

---

## 5. Reachability Determination Outputs

```text
Blob b13e72df67428c5299f2f68ffa80aa6c82fdafa4:
  DIRECTLY REACHABLE from current HEAD tree (085936f0d99b3d1772c4ce6bbe885cb8a98791fd):
  - apps/web/Files/UX-V2-D4-C1-AUDIT/__tests__/packet/CandidateTrustPacketE2E.test.js
  - apps/web/__tests__/packet/CandidateTrustPacketE2E.manual.js

Blob 996df5b92ae969aa819a4dac1bc18eeaa35e7170:
  DIRECTLY REACHABLE from current HEAD tree (085936f0d99b3d1772c4ce6bbe885cb8a98791fd):
  - apps/web/Files/UX-V2-D4-C1-AUDIT/__tests__/security/HostedP0EndToEndUAT.test.js
```

---

## 6. Worktree Preservation Package Outputs

* **Preservation Directory:** `/Users/darshilparmar/Developer/CareerTWiN-Recovery/worktree-preservation-583ddd8-20260924T130715Z`
* **Artifacts Preserved:**
  - `tracked_worktree_modifications.patch` (521 lines)
  - `tracked_working_copies/` (exact working files for modified routes)
  - `untracked_evidence/` (10 log files + `recovery-evidence/`)
  - `MANIFEST.sha256` (bit-level verification manifest)
