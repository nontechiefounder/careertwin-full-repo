# Step 4B2.1D2C Implementation Proposal

**Date:** August 1, 2026  
**Task:** Proposed implementation details for Step 4B2.1D2C (Sourcing Session Lifecycle Repair).  

---

## 1. Recommended Repair Option

**Option A:** Remove the redundant `useEffect` on line 77 of `apps/web/app/employer/sourcing-session/[id]/page.jsx`.

---

## 2. Proposed Production Source Diff

```diff
--- a/apps/web/app/employer/sourcing-session/[id]/page.jsx
+++ b/apps/web/app/employer/sourcing-session/[id]/page.jsx
@@ -68,13 +68,14 @@ function StepDot({ type, isActive }) {
 }

 // ── Single collapsible action-batch pill ─────────────────────────
-function ActionGroup({ group, isLast, agentRunning }) {
+export function ActionGroup({ group, isLast, agentRunning }) {
   const [open, setOpen] = useState(isLast);
   const done = group.completed || !isLast;
   const count = group.events.length;

-  // Keep last group open as events pour in
-  useEffect(() => { if (isLast) setOpen(true); }, [isLast]);
+  return (
```

---

## 3. Proposed Files for Modification

1. `apps/web/app/employer/sourcing-session/[id]/page.jsx` (Add `export` to `ActionGroup`; remove line 77 `useEffect`)
2. `apps/web/__tests__/components/ActionGroup.test.jsx` (New unit test file covering `ActionGroup` open/close behaviors)

---

## 4. Expected UI Behavior Before and After

- **Before:** Last group opens automatically on mount. If user closes the last group, polling or component updates could trigger the Effect and force it open again. Extra render cycle on initial mount.
- **After:** Last group opens automatically on mount via `useState(isLast)`. User can close any group without polling re-renders forcing it open. Zero extra render passes queued by effects.

---

## 5. User-Control & Strict Mode Implications

- User's manual toggle choice is 100% preserved.
- React Strict Mode executes `useState(isLast)` without any side effects or extra renders.

---

## 6. Test Plan Summary

Add `__tests__/components/ActionGroup.test.jsx` with 5 fake/mock unit tests verifying:
1. `isLast=true` starts open
2. `isLast=false` starts closed
3. User toggle expands/collapses group
4. Re-rendering with updated events preserves user toggle state
5. Unmounting cleans up without errors

---

## 7. Success Criteria & Verification

- `npm exec --offline eslint -- .` yields **0 errors** across the entire application codebase.
- `npm exec --offline vitest run` passes all tests (including new `ActionGroup` tests).
- `node node_modules/next/dist/bin/next build` exits with code 0.
- Application page route count remains 21; API handler count remains 28.

---

## 8. Rollback Plan

Tag `step4b2-1d2c-pre-sourcing-fix` will be created before applying any source change.
Rollback command: `git reset --hard step4b2-1d2c-pre-sourcing-fix`.
