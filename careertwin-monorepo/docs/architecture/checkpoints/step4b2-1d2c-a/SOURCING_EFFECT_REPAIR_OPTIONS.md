# Sourcing Effect Repair Options

**Date:** August 1, 2026  
**Target:** `apps/web/app/employer/sourcing-session/[id]/page.jsx` line 77 (`react-hooks/set-state-in-effect`)  

---

## 1. Option Evaluations

### OPTION A: Remove Redundant Effect (Initialize via `useState(isLast)`)

- **Implementation:** Remove line 77 (`useEffect(() => { if (isLast) setOpen(true); }, [isLast]);`). Rely entirely on `const [open, setOpen] = useState(isLast)`.
- **Files Modified:** `apps/web/app/employer/sourcing-session/[id]/page.jsx` (1 line deleted)
- **Props Changed:** None
- **User Close Actions Respected:** Yes. Removing the Effect prevents polling or re-renders from overwriting user's explicit close action.
- **New Log Arrival Behavior:** When a new action batch arrives, `groupEvents` creates a new group with a unique `id`. React mounts a new `ActionGroup` instance, and `useState(isLast)` initializes `open` to `true` on mount.
- **Strict Mode Behavior:** Clean. No effect execution.
- **Lint Outcome:** 0 errors (completely resolves `react-hooks/set-state-in-effect`).
- **Testability:** High.
- **Regression Risk:** Very Low.
- **Suitability:** **RECOMMENDED (Minimal Parity Repair)**.

---

### OPTION B: Parent-Controlled Open State

- **Implementation:** Move disclosure state up to `SourcingSessionPage` using `const [openGroups, setOpenGroups] = useState({})`. Pass `isOpen` and `onToggle` as props to `ActionGroup`.
- **Files Modified:** `apps/web/app/employer/sourcing-session/[id]/page.jsx` (multiple sections)
- **Props Changed:** Yes (`ActionGroup` signature changes)
- **User Close Actions Respected:** Yes.
- **New Log Arrival Behavior:** Parent updates `openGroups` map when a new group appears.
- **Strict Mode Behavior:** Clean.
- **Lint Outcome:** 0 errors.
- **Regression Risk:** Medium (requires modifying parent page component state logic).
- **Suitability:** Not recommended for minimal foundation repair.

---

### OPTION C: Ref-Based Previous Value Tracking

- **Implementation:** Use `useRef` to track `prevIsLast`. Inside `useEffect`, check `if (!prevIsLast && isLast) setOpen(true)`.
- **Files Modified:** `apps/web/app/employer/sourcing-session/[id]/page.jsx`
- **Props Changed:** None.
- **User Close Actions Respected:** Partial.
- **Strict Mode Behavior:** Complex ref mutation in render/effect.
- **Lint Outcome:** Would still trigger `react-hooks/set-state-in-effect` unless deferred or ref-checked.
- **Regression Risk:** Medium.
- **Suitability:** Not recommended.

---

### OPTION D: Derived Display State

- **Implementation:** Derive open state dynamically from `isLast` combined with a `userClosed` local state boolean.
- **Files Modified:** `apps/web/app/employer/sourcing-session/[id]/page.jsx`
- **Props Changed:** None.
- **User Close Actions Respected:** Yes.
- **Strict Mode Behavior:** Clean.
- **Lint Outcome:** 0 errors.
- **Regression Risk:** Low, but adds unnecessary state logic compared to Option A.
- **Suitability:** Secondary alternative.

---

## 2. Option Comparison Matrix

| Option | Lines Changed | Props Changed | User Close Respected | Extra Render Eliminated | Recommended |
|---|---|---|---|---|---|
| **Option A** | 1 line deleted | No | Yes | Yes | **YES** |
| **Option B** | ~20 lines | Yes | Yes | Yes | No |
| **Option C** | ~8 lines | No | Partial | No | No |
| **Option D** | ~5 lines | No | Yes | Yes | No |
