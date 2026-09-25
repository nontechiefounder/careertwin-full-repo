# Visual and Runtime Defect Register

**Date:** August 1, 2026  
**Task:** Step 4B3A  

---

## 1. Defect Severity Definitions

- **P0 (Critical):** Security exposure, data leakage, application crash, or authentication bypass.
- **P1 (High):** Blocked core navigation, unusable form, serious responsive break, or repeated runtime failure.
- **P2 (Medium):** Incorrect content, visual inconsistency, overflow, missing asset, or minor interaction defect.
- **P3 (Low):** Minor spacing, alignment, or cosmetic polish issue.

---

## 2. Unauthenticated Smoke Observation Summary

| Severity Category | Unauthenticated Observation |
|---|---|
| **P0 (Critical)** | No unauthenticated data exposure was observed. Bypass testing was outside scope. |
| **P1 (High)** | All tested public and dynamic routes rendered without blocked navigation or usable form failures in unauthenticated mode. |
| **P2 / P3 (Visual/Cosmetic)** | 18 responsive baseline screenshots captured. **Screenshots are subject to independent visual review** before claiming zero cosmetic defects. |

---

## 3. Scope & Boundary Notes

- **Unauthenticated Data Exposure:** Ordinary unauthenticated requests exposed no protected candidate or employer records in the tested scenarios.
- **Bypass Testing:** Authentication bypass, role authorization, and tenant isolation were **not tested** in this task.
- **Independent Visual Review:** The captured screenshots serve as a baseline and require independent visual review for cosmetic polish.
