# Calendar & date-fns Compatibility Risk Note

**Target Application:** `careertwin-monorepo/apps/web`  
**Date:** July 31, 2026  
**Change:** `date-fns` aligned from `^4.1.0` to `^3.6.0`  

---

## 1. Source Files & Component Dependency Mapping

- **Component:** `components/ui/calendar.jsx` (Imports `DayPicker` from `react-day-picker@8.10.2`)
- **Pages Utilizing Calendar/Date Pickers:**
  - `app/employer/intake/page.jsx` (Role target start dates & intake deadlines)
  - `app/employer/page.jsx` (Employer dashboard analytics date filters)
  - `app/employer/sourcing-session/[id]/page.jsx` (Sourcing session timestamp logs)

---

## 2. Compatibility & Regression Risk Analysis

1. **`react-day-picker@8.10.2` Peer Alignment:** `react-day-picker` 8.10.2 natively targets `date-fns` `^3.0.0`. Aligning `date-fns` to `^3.6.0` eliminates peer resolution warnings and ensures 100% API compatibility for `DayPicker` components.
2. **Functions Used:** `format`, `addDays`, `subDays`, `isValid`, `parseISO`.
3. **Timezone & Formatting Behavior:** `date-fns` v3 and v4 share identical string formatting tokens (`yyyy-MM-dd`, `MMM d, yyyy`). Visual date formatting on intake forms and dashboard cards remains identical.
4. **Visual Testing Requirement:** Calendar popovers and date inputs must be visually verified during Step 4B3 runtime smoke testing.
