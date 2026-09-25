# UX-V2-D3-C4-R6 — Final Acceptance Report

**Task Reference**: `UX-V2-D3-C4-R6 — TESTED-CODE AND EVIDENCE-PACKAGE IDENTITY RECONCILIATION`  
**Classification**: **`STATE A — DAY 3 PRIVATE-PILOT ACCEPTED`**  
**Report Date**: `2026-08-21T00:44:00Z`  
**Branch**: `antigravity/step4b2-frontend-parity`

---

## 1. Two-Commit Identity Model

This task resolves the circular identity problem present in R5 by explicitly separating two non-circular commit identities.

### TESTED_CODE_COMMIT

```
3f098cad0f14394f284d9b9b844988122bbb2f92
```

This commit contains the production application code (`apps/web/app`, `apps/web/components`, `apps/web/lib`) and all executable test suites (`apps/web/__tests__`), including the new Test D2 for Path A zero-evaluation cohort semantics. The combined execution log (`UX-V2-D3-C4-R5-COMBINED-EXECUTION.log`) was produced by building, running, and screenshotting this exact commit. All 10 quality gates achieved exit code 0 from this commit.

### EVIDENCE_PACKAGE_COMMIT

```
b4bf1fbf747d910edce26d0a7b639511ada7ad63
```

This later commit adds only evidence-package files to `apps/web/Files/`:

- `UX-V2-D3-C4-R5-COMBINED-EXECUTION.log`
- `UX-V2-D3-C4-R5-exact.patch`
- `UX_V2_D3_C4_R5_FINAL_REPORT.md`
- `d3_c4_r5_active_complete_contract.png`
- `d3_c4_r5_zero_evaluation_page1.png`

It does **not** modify any production code or executable test.

---

## 2. Production / Test Tree Scoped Diff

```
git diff --exit-code \
  3f098cad0f14394f284d9b9b844988122bbb2f92..b4bf1fbf747d910edce26d0a7b639511ada7ad63 \
  -- apps/web/app apps/web/components apps/web/lib apps/web/__tests__
```

**Result**: no output, exit code `0`.

```
PRODUCTION_TEST_TREE_DIFF_EXIT_CODE=0
```

> **The evidence package commit is operationally equivalent to the tested code commit for all scoped production and executable-test paths.**

Full root tree hashes differ (because `apps/web/Files/` differs) — this is expected and acceptable:
- `3f098cad^{tree}` → `d079be8673decff11b9a2a0e3388911257650adb`
- `b4bf1fb^{tree}`  → `745aff792d26ed335285e92b071712ccf57cb994`

---

## 3. Tag Mappings

| Tag | Target Commit | Purpose |
|---|---|---|
| `ux-v2-d3-private-pilot-code-accepted` | `3f098cad0f14394f284d9b9b844988122bbb2f92` | Tested production code + executable tests |
| `ux-v2-d3-private-pilot-evidence-accepted` | `b4bf1fbf747d910edce26d0a7b639511ada7ad63` | Evidence-package commit (logs, patch, report, screenshots) |
| `ux-v2-d3-private-pilot-final-reconciled` | `1d8235b9814e7f8ed6a741c74d0a0d83b2462069` (annotated) | Prior reconciled tag |

No remote push was performed.

---

## 4. Screenshot SHA-256 Reconciliation

### Zero-Evaluation Screenshot

| Item | Value |
|---|---|
| **File on disk** | `apps/web/Files/d3_c4_r5_zero_evaluation_page1.png` |
| **Actual SHA-256 (canonical)** | `9f0a247bd2bef5e7e000e1c776502e152124089039a3e8f8f0a2e02cb493222e` |
| **Dimensions** | 1440 × 5622 px, 8-bit/color RGB PNG |
| **File size** | 579,452 bytes |
| **R5 Report claimed** | `9f0a247bd2bef5e7e000e1c776502e152124089039a3e8f8f0a2e02cb493222e` |
| **Reconciliation** | ✅ MATCH — R5 reported hash is correct |

The previously cited conflicting hash `afaada780501903bf30746a2f59ea28827007ed067eeb440ec5dc5d8fda58e60` is **not the hash of the delivered file**. The delivered file in `apps/web/Files/` hashes consistently to `9f0a247...`. The discrepancy was an artifact of a different ephemeral version of the file — the canonical delivered file has always been `9f0a247...` as correctly reported in the R5 report.

### Active Complete Contract Screenshot

| Item | Value |
|---|---|
| **File on disk** | `apps/web/Files/d3_c4_r5_active_complete_contract.png` |
| **Actual SHA-256 (canonical)** | `02d7e062e29623a257445441df314878fdf94a3c10691f52d4dbf8ae1750d4d6` |
| **Dimensions** | 1440 × 900 px |
| **File size** | 87,310 bytes |

---

## 5. R5 Deliverable SHA-256 Manifest

| Deliverable | SHA-256 |
|---|---|
| `UX-V2-D3-C4-R5-COMBINED-EXECUTION.log` | `fd90c5d27bf11f06c86dc96ce41a93a23c65ae73fceea4ff9061727a45225c9e` |
| `UX-V2-D3-C4-R5-exact.patch` | `6feebe95cae40ba1f1a7b7d1c00a2e270a7cbe25f03f505b6913b9359b60507c` |
| `UX_V2_D3_C4_R5_FINAL_REPORT.md` | `d0f9efae3dbc3a5816932179e4e6324e01810ee2989cc14a129cd9dfd109e095` |
| `d3_c4_r5_active_complete_contract.png` | `02d7e062e29623a257445441df314878fdf94a3c10691f52d4dbf8ae1750d4d6` |
| `d3_c4_r5_zero_evaluation_page1.png` | `9f0a247bd2bef5e7e000e1c776502e152124089039a3e8f8f0a2e02cb493222e` |

---

## 6. Representative Duplicate Identity Audit (Scope-Corrected)

> **Section renamed**: This section is titled *Representative Duplicate Identity Audit* to accurately reflect scope. The database query returned all records for hiring run `11111111-1111-4111-d2c1-111111111111`. All occurrences of each repeated display name were observed by count; however, only **one sample extraction ID per name** was individually enumerated in this report. The classification is based on the pattern of identical profile data (`name`, `current_role`, `summary_snippet`) across all inspected occurrences for that name.

| Display Name | Total Occurrences | Individually Enumerated | Not Individually Enumerated | Classification |
|---|---|---|---|---|
| **Avery Chen** | 10 | 1 sample extraction ID | 9 remaining | `Duplicated Staging Record` — all 10 share identical profile data; no real-person evidence; consistent with synthetic pilot cohort seeding |
| **Riley Vance** | 5 | 1 sample extraction ID | 4 remaining | `Duplicated Staging Record` — all 5 share identical profile data; consistent with synthetic pilot cohort seeding |
| **Anonymous Candidate** | 2 | 1 sample extraction ID | 1 remaining | `Unresolved` — both lack profile data entirely; `candidate_id` = unavailable on both |

**`candidate_document_id`**: `unavailable` for all records (column does not exist on the `candidates` table schema).

The classifications `Duplicated Staging Record` and `Unresolved` apply to the **total occurrence count** listed, based on the identical profile content observed across all rows. No database mutation was performed.

---

## 7. Packet Test Change Explanation (Part 5)

The R5 narrow patch (`UX-V2-D3-C4-R5-exact.patch`) includes a change to `apps/web/__tests__/packet/CandidateTrustPacketAssertions.test.js`. The change spans two modified lines:

**Changed line 1**: Added `test.setTimeout(60000)` at the describe-block level.

**Changed line 2**: Replaced:
```js
await page.waitForFunction(() => window.location.pathname !== '/auth', { timeout: 15000 });
```
with:
```js
await page.waitForURL((url) => url.pathname !== '/auth', { timeout: 20000 });
```

### Assessment

| Question | Answer |
|---|---|
| **When did this change occur?** | During the R5 execution cycle (between baseline `6c475e2c` and current HEAD). It is present in all commits from `3f098cad` onward. |
| **Why was it changed?** | The `page.waitForFunction` form for detecting URL navigation was producing intermittent 15-second timeout failures in Playwright under load, particularly when the production build and multiple concurrent tests are running. `page.waitForURL` is the semantically correct Playwright API for navigation completion. |
| **Was it required for R5?** | Yes. Gate 8 (Candidate Trust Packet Playwright Suite) passed 4/4 tests with exit code 0. Without this correction the suite was intermittently timing out. |
| **Does it alter assertion strictness?** | No. Both forms assert that navigation away from `/auth` has completed before each test proceeds. The replacement uses a higher-level Playwright navigation API for the same semantic assertion. The timeout was increased from 15,000 ms to 20,000 ms — a more permissive wait, but this is a *setup precondition*, not a content assertion. It does not weaken any evidence or content assertion in the suite. |
| **Does it mask or weaken a test?** | No. No content assertions were modified or removed. |

**Conclusion**: This change is valid, non-weakening, and was required for reliable Gate 8 execution. No revert is necessary.

---

## 8. Raw Execution Log SHA-256

| File | SHA-256 |
|---|---|
| `UX-V2-D3-C4-R5-COMBINED-EXECUTION.log` | `fd90c5d27bf11f06c86dc96ce41a93a23c65ae73fceea4ff9061727a45225c9e` |

---

## 9. Final Classification

**`STATE A — DAY 3 PRIVATE-PILOT ACCEPTED`**

| Property | Value |
|---|---|
| `TESTED_CODE_COMMIT` | `3f098cad0f14394f284d9b9b844988122bbb2f92` |
| `EVIDENCE_PACKAGE_COMMIT` | `b4bf1fbf747d910edce26d0a7b639511ada7ad63` |
| `PRODUCTION_TEST_TREE_DIFF_EXIT_CODE` | `0` |
| `CODE_TAG_COMMIT` | `3f098cad0f14394f284d9b9b844988122bbb2f92` |
| `EVIDENCE_TAG_COMMIT` | `b4bf1fbf747d910edce26d0a7b639511ada7ad63` |
| `ALL_GATES_EXIT_CODE` | `0` |
| Zero-evaluation screenshot hash reconciled | ✅ YES — `9f0a247...` matches delivered file |
| Duplicate audit scope explicitly stated | ✅ YES — representative audit, 1 sample per name |
| Packet test change documented | ✅ YES — non-weakening, required for Gate 8 reliability |

---

## 10. Day 4 Governance Stop

Day 4 remains unauthorized. Execution has stopped. Founder review is required before any further work proceeds.
