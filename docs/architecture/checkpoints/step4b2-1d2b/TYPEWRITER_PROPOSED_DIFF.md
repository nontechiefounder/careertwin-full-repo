# TypewriterEffect Proposed Diff

**File:** `apps/web/components/marketing/TypewriterEffect.jsx`  
**Date:** August 1, 2026  

---

## 1. Exact Current Transition (lines 55–58)

```js
if (deleting && charIdx === 0) {
  setDeleting(false);
  setWordIdx(w => w + 1);
}
```

**Problem:**
- `setDeleting(false)` and `setWordIdx(w => w + 1)` are called synchronously in the effect body with no timer.
- This triggers immediate state updates inside an effect — the `react-hooks/set-state-in-effect` violation.
- Under React Strict Mode (development), this block runs twice per effect invocation, causing `wordIdx` to double-increment — a latent bug skipping every other word in development.

---

## 2. Exact Proposed Replacement

**Merge the word-transition into the final deletion timer callback.**

The last deletion step fires when `charIdx === 1` (deleting phase, `charIdx > 0`). After the timer fires, `charIdx` is decremented to 0. At that exact moment, deletion is complete. The transition to the next word can be performed **inside that same timer callback**, removing the need for Phase D as a separate synchronous effect branch.

**Before — Phase C branch (lines 47–53) + Phase D branch (lines 55–58):**
```js
if (deleting && charIdx > 0) {
  const t = setTimeout(() => {
    setDisplay(current.slice(0, charIdx - 1));
    setCharIdx(c => c - 1);
  }, speed / 2);
  return () => clearTimeout(t);
}

if (deleting && charIdx === 0) {
  setDeleting(false);
  setWordIdx(w => w + 1);
}
```

**After — unified Phase C+D branch:**
```js
if (deleting && charIdx > 0) {
  const t = setTimeout(() => {
    if (charIdx === 1) {
      setDisplay("");
      setDeleting(false);
      setWordIdx(w => w + 1);
      setCharIdx(0);
    } else {
      setDisplay(current.slice(0, charIdx - 1));
      setCharIdx(c => c - 1);
    }
  }, speed / 2);
  return () => clearTimeout(t);
}
```

The `if (deleting && charIdx === 0)` branch is **removed entirely** — it is no longer reachable because the transition is completed inside the timer at `charIdx === 1`.

---

## 3. Behavior Comparison

### Typing Phase (Phase A)
- **Before:** Unchanged.
- **After:** Unchanged. No modification to lines 34–40.

### Pause Phase (Phase B)
- **Before:** Unchanged.
- **After:** Unchanged. No modification to lines 42–45.

### Deletion Phase (Phase C) — `charIdx > 1`
- **Before:** `setDisplay(current.slice(0, charIdx - 1))` + `setCharIdx(c => c - 1)` in timer.
- **After:** Same — `charIdx > 1` does not enter the new `charIdx === 1` branch.

### Transition Step (Phase C final tick — `charIdx === 1`)
- **Before:** Timer fires → `setDisplay("")` + `setCharIdx(0)` → effect re-runs → **synchronous** `setDeleting(false)` + `setWordIdx(w => w + 1)` (violation).
- **After:** Timer fires → `setDisplay("")` + `setDeleting(false)` + `setWordIdx(w => w + 1)` + `setCharIdx(0)` — all inside the same timer callback. No synchronous effect-body setState.

---

## 4. Timing Implications

| Phase | Before | After |
|---|---|---|
| Typing speed | `speed` ms/char | Unchanged |
| Deletion speed | `speed / 2` ms/char | Unchanged |
| Pause at full word | `pause` ms | Unchanged |
| Word transition delay | 0 ms (instantaneous — synchronous) | `speed / 2` ms (included in the final deletion tick) |

**Visible timing difference:** The word transition now takes one additional `speed / 2` ms (default: 37.5 ms) compared to before. This is imperceptible — it is subsumed into the last deletion tick and produces no observable change in the animation rhythm.

---

## 5. Strict Mode Implications

- **Before:** Strict Mode double-invocation caused `setWordIdx(w => w + 1)` to fire twice, skipping every other word in development.
- **After:** The transition is inside a `setTimeout` callback. Strict Mode does **not** double-invoke timer callbacks — it only double-invokes the effect setup function. The cleanup (`clearTimeout(t)`) cancels the first timer before the second invocation schedules a new one. The word increment fires exactly once per deletion cycle in both development and production.

---

## 6. Risk Level

- **Risk level:** Very low.
- The public component interface (props: `words`, `speed`, `pause`, `className`) is unchanged.
- The JSX return is unchanged.
- The cursor blink effect is unchanged.
- The dependency array of the typing effect is unchanged (`[charIdx, deleting, wordIdx, words, speed, pause]`).
- All timer cleanup paths are preserved or improved.
- The only behavioral change is a 37.5 ms (imperceptible) reduction in the synchronous-to-async transition timing.
- Strict Mode word-skipping bug is eliminated as a side effect.

---

## 7. Minimum Change Confirmation

- Lines changed: 9 (Phase C timer callback expanded; Phase D synchronous block removed)
- No new imports
- No new state variables
- No new effects
- No new dependencies
- No class names or marketing text changed
- No component props changed
- No export interface changed
