# Sourcing Effect Behavior Correction

**Date:** August 1, 2026  
**Target:** `apps/web/app/employer/sourcing-session/[id]/page.jsx`  

---

## 1. Behavior Analysis Corrections

1. **Polling Rerender Impact:**  
   The `useEffect(() => { if (isLast) setOpen(true); }, [isLast]);` does **not** rerun merely because polling triggers a parent component re-render. React compares `isLast` by value across renders; if `isLast` remains `true` (or `false`), the Effect body does not execute on ordinary polling updates.

2. **Dependency Transitions:**  
   The Effect executes:
   - On initial component mount (when `isLast` is evaluated for the first time).
   - Whenever `isLast` genuinely changes value (e.g. from `false` to `true`).

3. **Normal Append-Only Log Pattern:**  
   In normal log streaming, the current last group remains `isLast = true` while events pour into it. When a new group arrives, the previous last group's `isLast` prop becomes `false` (transitioning `true → false`). It does not transition `false → true`.

4. **Redundancy on Initial Mount:**  
   On initial mount of the last group, `const [open, setOpen] = useState(isLast);` already initializes `open` to `true`. The Effect then immediately runs after mount and calls `setOpen(true)` synchronously inside the Effect body. This call is redundant and queues an unnecessary extra render pass.

5. **Elimination of Lint Violation:**  
   Removing line 77 removes the redundant Effect, completely eliminating the `react-hooks/set-state-in-effect` violation on `sourcing-session/[id]/page.jsx`.

6. **Preservation of Local State:**  
   If an unusual list contraction or reordering ever caused `isLast` to transition `false → true`, the repaired component will preserve its current user-set local `open` state rather than forcibly expanding itself.
