# Sourcing Log Disclosure UX Contract

**Date:** August 1, 2026  
**Target Component:** `ActionGroup` in `apps/web/app/employer/sourcing-session/[id]/page.jsx`  

---

## 1. User Experience Scenarios

| Scenario | Given Condition | Expected UX Behavior |
|---|---|---|
| **A. Initial Page Load** | Page loads with existing historical log groups | Newest (last) group renders expanded (`open = true`). Historical groups render collapsed (`open = false`). |
| **B. First Log Appears** | Session starts with 1 initial group | Group mounts expanded (`open = true`). |
| **C. New Log Appended** | Agent starts a new action batch | A new `ActionGroup` mounts at the bottom with `isLast = true` and opens automatically (`open = true`). |
| **D. Last Item Becomes Non-Last** | New group arrives | Previous last group's `isLast` becomes `false`. Its current `open` state remains unchanged (does not forcibly collapse or reopen). |
| **E. User Closes Newest Log** | User clicks toggle on newest log | Log collapses (`open = false`). Polling re-renders MUST NOT force it open again. |
| **F. User Opens Older Log** | User clicks toggle on older log | Older log expands (`open = true`). Multiple logs can be expanded simultaneously. |
| **G. Polling Update (3s)** | Data refreshed via polling | Log entries update inside groups. All user open/close states remain preserved. |
| **H. Empty Log List** | `events = []` | Empty state placeholder shown; no `ActionGroup` rendered. |
| **I. Component Remount** | Route re-navigated or remounted | Initial state `useState(isLast)` evaluates: last item starts open, older items start closed. |
| **J. React Strict Mode** | Development double-render | Component mounts cleanly without double-triggering state updates or extra render passes. |
