# Frontend Source Inventory Corrections

**Target Document:** `docs/architecture/checkpoints/step4b1-1/FRONTEND_SOURCE_INVENTORY_CORRECTIONS.md`  
**Supersedes/Refines:** `docs/architecture/checkpoints/step4b1/FRONTEND_SOURCE_INVENTORY.md`  
**Date:** July 31, 2026  

---

## 1. Verified Route Count Corrections

- **Initial Step 4B1 Inventory Estimate:** Listed general page areas without enumerating exact static vs. dynamic sub-routes and route handler files.
- **Step 4B1.1 Actual Filesystem Audit:**
  - **App Router Pages:** **21 Pages** (14 static page routes, 7 dynamic page routes).
  - **API Route Handlers:** **28 Endpoints** (Excluding excluded `app/api/dev/*` routes).
  - **Layout Components:** **2 Layouts** (`app/layout.js`, `app/employer/layout.jsx`).

---

## 2. Legacy Component Dependency Correction (`NaiveShell.jsx`)

- **Step 4B1 Status:** `components/NaiveShell.jsx` was initially excluded as an unreviewed obsolete item, creating potential import errors across 14 UI page components.
- **Step 4B1.1 Correction:** In accordance with the Part 1 Decision Rule, `components/NaiveShell.jsx` was audited, confirmed to contain zero credentials, zero real candidate records, and zero production mutations, and was copied unchanged to `apps/web/components/NaiveShell.jsx`. SHA-256 hash verified identical to source (`cb0c2663...`). All 14 page imports are fully satisfied.

---

## 3. Data & Script Exclusions Audit

- **`data/talent_vault.json`:** Classified as `C. REAL_OR_PUBLIC_PERSON_DATA` (6,570 scraped records). Purged from working tree and git history; added to `.gitignore`.
- **`scripts/mass_seed.js`:** Audited as an unneeded operational script that loads `talent_vault.json` and calls Crustdata APIs. Purged from working tree and git history.
