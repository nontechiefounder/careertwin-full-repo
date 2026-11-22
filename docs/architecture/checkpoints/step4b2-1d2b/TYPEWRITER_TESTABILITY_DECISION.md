# TypewriterEffect Testability Decision

**File:** `apps/web/components/marketing/TypewriterEffect.jsx`  
**Date:** August 1, 2026  

---

## 1. Testable Behaviors

The repaired animation has five testable behaviors:

| # | Behavior | Description |
|---|---|---|
| 1 | Typing advance | `display` grows one character per `speed` ms tick |
| 2 | Pause at complete | After full word, no change for `pause` ms |
| 3 | Deletion | `display` shrinks one character per `speed/2` ms tick |
| 4 | Word transition at `charIdx === 1` | `deleting → false`, `wordIdx` increments, `charIdx → 0`, `display → ""` |
| 5 | Timer cleanup on unmount | No pending timer fires after unmount |

---

## 2. Feasibility Assessment

### Can tests be added without modifying production code?

**Yes.** `TypewriterEffect` is a `default export` from the component file. It can be imported directly under `__tests__/components/TypewriterEffect.test.jsx` without any production export change.

### Setup requirements

- `@testing-library/react` is already present (used in `ProtectedRoute.test.jsx`).
- `vi.useFakeTimers()` from Vitest is available.
- `vi.advanceTimersByTime()` can advance the animation without real waiting.
- No mock providers needed — the component has no external dependencies (no auth, no router, no API calls).

### Risk of restructuring

**None.** The component is self-contained. The test imports it as-is, renders it with a controlled `words` prop and a fast `speed`, and uses fake timers.

---

## 3. Decision

**Decision: Add a narrow test.**

The component is isolated, exports without modification, and is fully exercisable with Vitest fake timers. All five behaviors can be verified without exporting internals or restructuring production code.

Test file location: `apps/web/__tests__/components/TypewriterEffect.test.jsx`
