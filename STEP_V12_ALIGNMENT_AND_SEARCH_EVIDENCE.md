# workBYLiNE Genome — V12 Alignment & Seeded Search Evidence

- **Date:** 2026-11-22
- **Lifecycle Status:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`
- **Prior `v12` Commit:** `fix/v12-security-repairs` (`5eaa46f29325886e415ae33dc7759d521c1b4416`)
- **Current Branch:** `fix/v12-evidence-alignment`

---

## 1. Changed Files (`fix/v12-security-repairs` -> `fix/v12-evidence-alignment`)

- `apps/web/app/api/search/route.js` (removed nonexistent `linkedin_url` from `candidate_profiles` select; doubled `\` in `orQuery` for PostgREST double-quoted `.or(...)` literal `%`/`_` escaping)
- `MANIFEST_SHA256.txt` (regenerated for all tracked Git files excluding `MANIFEST_SHA256.txt`)
- `STEP_V12_ALIGNMENT_AND_SEARCH_REPORT.md`
- `STEP_V12_ALIGNMENT_AND_SEARCH_EVIDENCE.md`
- `evidence/v12_1/seeded_search_disposable_receipts.txt`
- `evidence/v12_1/V12_1_ALIGNMENT_DIFF.patch`
- `evidence/v12_1/V12_1_CHANGED_FILES.txt`

---

## 2. Raw Seeded Disposable `/api/search` Receipt (`http://127.0.0.1:54421`)

Command: `npx vitest run --environment node --no-file-parallelism __tests__/security/_v12_search_probe.test.js` (against disposable Supabase `http://127.0.0.1:54421`, synthetic `User A` & `User B` JWTs, seeded `hiring_runs` cleaned up in `finally`) -> **exit `0`, 1/1 passed**:
- `unauthenticated_status`: `401`
- `userA_OReilly` (`q=O'Reilly`): `1` row — `1bcb69cf-ed74-4148-b6d6-0e4095ac5748` (`"O'Reilly Media Architect"`)
- `userA_NodeJs` (`q=Node.js`): `1` row — `ea940b6b-d143-449f-ab8d-c756fb4e3139` (`"Node.js Core Maintainer"`)
- `userA_LiteralPctUnderscore` (`q=100%_Engineer`): `1` row — `502c3587-11f7-43b2-a260-6561275fad28` (`"100%_Engineer"`; did NOT match `"1000X_Engineer"` or `"Acme Role"`)
- `userA_FilterInjectionAttempt_count` (`q=Staff,id.neq.0`): `0` rows
- `userB_OReilly` (`q=O'Reilly`): `1` row — `13c1b3b8-7eab-424f-8071-5ad61bf4c2a2` (`"O'Reilly Secret Role"`)
- `cross_tenant_leak_count`: `0`

Full raw output preserved in `evidence/v12_1/seeded_search_disposable_receipts.txt`.

---

## 3. Source-to-Receipt & Manifest Scope Mapping

- **Git Bundle Runtime Logs Clarification:** Branches `review/workbyline-v10-candidate` through `fix/v12-evidence-alignment` retain the 12 historical `v10` `logs/guarded_verify_20261122T000858Z_78719/` files in Git history, while the `v12` guarded verification receipt `logs/guarded_verify_20261122T124350Z_23172/` is packaged in `WorkByLine_Parth_Local_Review_v12.zip` and `WorkByLine_Founder_Audit_v12.zip` (`5eaa46f29325886e415ae33dc7759d521c1b4416`).
- **Focused Vitest Regression After Final `search/route.js` Edit:** Verified `V11SecurityRepairs.test.js`, `AuthPage.test.jsx`, and `ApiAuthorizationCharacterization.test.js` pass (`0` failures).
- **Unavailable Scanners (`NOT VERIFIED`):** `semgrep`, `codeql`, `coderabbit`, `gitleaks`, `trivy`, `osv-scanner`, `snyk`, `bandit` (`NOT_FOUND`); `npm audit` (`ENOTFOUND registry.npmjs.org`).
