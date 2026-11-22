# Sourcing Effect Proposed Diff

**Target File:** `apps/web/app/employer/sourcing-session/[id]/page.jsx`  
**Date:** August 1, 2026  

---

## 1. Exact Source Removal

```diff
--- a/apps/web/app/employer/sourcing-session/[id]/page.jsx
+++ b/apps/web/app/employer/sourcing-session/[id]/page.jsx
@@ -74,6 +74,4 @@ function ActionGroup({ group, isLast, agentRunning }) {
   const done = group.completed || !isLast;
   const count = group.events.length;

-  // Keep last group open as events pour in
-  useEffect(() => { if (isLast) setOpen(true); }, [isLast]);

   return (
```

---

## 2. Boundary Confirmations

- **`ActionGroup` Export:** Unchanged (`function ActionGroup...`). Not exported.
- **Top-level `useEffect` Import:** Unchanged. `useEffect` is still used elsewhere in `page.jsx` for initial data fetching, polling interval, and scroll-to-bottom effects.
- **Lines Removed:** Exactly 2 lines (1 comment line, 1 `useEffect` statement line).
- **Other Source Code:** Zero changes.
