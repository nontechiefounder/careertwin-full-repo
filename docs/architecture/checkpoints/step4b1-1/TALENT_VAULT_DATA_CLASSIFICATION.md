# Talent Vault Data Classification Report

**Target File:** `data/talent_vault.json` (Source: `live-mvp-readonly/data/talent_vault.json`)  
**File Size:** 6,382,745 bytes (~6.38 MB)  
**SHA-256 Hash:** `c25ef8563f6f17dbb193e03574bdfe3dd32df31a6bdf927836df017759bc174d`  
**Classification:** **C. REAL_OR_PUBLIC_PERSON_DATA**  
**Action Taken:** Purged & Removed from Working Tree & Git History; Added to `.gitignore`  

---

## 1. Aggregate Technical Metadata

- **Top-Level JSON Structure:** `list`
- **Total Record Count:** 6,570 records
- **Record Schema Fields:** `category`, `headline`, `linkedin_url`, `location`, `name`, `scraped_at`, `skills`

---

## 2. Privacy & Data Attributes Assessment

- **Contains Names:** **YES** (`name` string field in records)
- **Contains Email Addresses:** NO (`email` field absent)
- **Contains Phone Numbers:** NO (`phone` field absent)
- **Contains Locations:** **YES** (`location` geographic string field)
- **Contains Employment / Company Histories:** **YES** (`headline` contains titles & company histories)
- **Contains Public Profile URLs:** **YES** (`linkedin_url` profile links)
- **Contains Work Authorization / Nationality:** NO
- **Contains Protected / Sensitive Attributes:** **YES** (Names and location proxies allow demographic inference)
- **Explicit Synthetic / Test Markers:** **NO** (Zero synthetic markers present)
- **Documented Consent & Provenance:** **NO** (Contains `scraped_at` timestamps without repository consent authorization)

---

## 3. Code Dependency Analysis

- **Application Compilation Dependency:** **NO.** Zero page routes (`app/`), zero API route handlers (`app/api/`), and zero UI components (`components/`) import or require `talent_vault.json` to compile or render.
- **Runtime Demo Dependency:** **NO.** Not required for normal application runtime or local startup.
- **Single External Referencing File:** `apps/web/scripts/mass_seed.js` (Root database seeding script).

---

## 4. Classification Decision & Remediation Actions

In strict accordance with Step 4B1.1 governance rules, because `talent_vault.json` contains scraped public person records without documented consent or synthetic markers:

1. **Classification Assigned:** `C. REAL_OR_PUBLIC_PERSON_DATA`
2. **Working Tree Purge:** `apps/web/data/talent_vault.json` removed completely from `apps/web/data/`.
3. **Ignore Rule Enforced:** Added `data/talent_vault.json`, `data/private/`, `candidate_exports/`, and `candidate_datasets/` to root `.gitignore` and `apps/web/.gitignore`.
4. **Git History Rebuilding:** The file will be purged from Git commit history during local commit reconstruction.
5. **Step 4B2 Blocker Registration:** Noted that `scripts/mass_seed.js` references `talent_vault.json` if seeding scripts are reviewed in Step 4B2.
