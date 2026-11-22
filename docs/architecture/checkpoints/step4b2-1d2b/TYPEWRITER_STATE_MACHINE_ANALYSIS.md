# TypewriterEffect State Machine Analysis

**File:** `apps/web/components/marketing/TypewriterEffect.jsx`  
**Date:** August 1, 2026  

---

## 1. State Variables

| Variable | Type | Initial Value | Purpose |
|---|---|---|---|
| `display` | `string` | `""` | The currently rendered substring of the active word |
| `wordIdx` | `number` | `0` | Index into the `words` array (unbounded; access via `% words.length`) |
| `charIdx` | `number` | `0` | Number of characters currently typed or to be deleted next |
| `deleting` | `boolean` | `false` | Whether the machine is in the deletion phase |
| `cursorVisible` | `boolean` | `true` | Whether the blinking cursor `|` is visible at this moment |

---

## 2. Effects and Timers

### Effect 1 — Cursor Blink (lines 25–28)

```js
useEffect(() => {
  const t = setInterval(() => setCursorVisible(v => !v), 530);
  return () => clearInterval(t);
}, []);
```

- **Dependency array:** `[]` — runs once on mount, never re-runs.
- **Mechanism:** `setInterval` fires every 530 ms to toggle `cursorVisible`.
- **Cleanup:** `clearInterval(t)` on unmount.
- **Strict Mode implication:** React Strict Mode double-invokes effects in development. The cleanup (`clearInterval`) runs before the second invocation, so only one live interval exists at any time.

### Effect 2 — Typing/Deleting State Machine (lines 31–59)

```js
useEffect(() => { ... }, [charIdx, deleting, wordIdx, words, speed, pause]);
```

- **Dependency array:** `[charIdx, deleting, wordIdx, words, speed, pause]`
- **Re-runs** on every state change that advances the animation.
- **Cleanup:** Every branch that schedules a `setTimeout` returns `() => clearTimeout(t)`. The synchronous branch on lines 55–58 does **not** return a cleanup — there is nothing to clean.

---

## 3. Animation Phases

### Phase A — Typing (`!deleting && charIdx <= current.length`)

**Condition:** `deleting === false` AND `charIdx <= current.length`

```js
const t = setTimeout(() => {
  setDisplay(current.slice(0, charIdx));
  setCharIdx(c => c + 1);
}, speed);
return () => clearTimeout(t);
```

- Each tick reveals one more character: `setDisplay(current.slice(0, charIdx))`.
- `charIdx` increments by 1.
- Timer delay: `speed` ms (default 75 ms/char).
- When `charIdx === 0`, `display` becomes `""` (empty start).
- When `charIdx === current.length`, `display` becomes the full word.
- Cleanup: timer cancelled if dependencies change before it fires.

### Phase B — Pause at Full Word (`!deleting && charIdx > current.length`)

**Condition:** `deleting === false` AND `charIdx > current.length`  
(Entered when typing phase increments `charIdx` past `current.length`)

```js
const t = setTimeout(() => setDeleting(true), pause);
return () => clearTimeout(t);
```

- Waits `pause` ms (default 1800 ms) before beginning deletion.
- Timer delay: `pause` ms.
- Cleanup: timer cancelled if dependencies change.

### Phase C — Deleting (`deleting && charIdx > 0`)

**Condition:** `deleting === true` AND `charIdx > 0`

```js
const t = setTimeout(() => {
  setDisplay(current.slice(0, charIdx - 1));
  setCharIdx(c => c - 1);
}, speed / 2);
return () => clearTimeout(t);
```

- Each tick removes one character from the right: `setDisplay(current.slice(0, charIdx - 1))`.
- `charIdx` decrements by 1.
- Timer delay: `speed / 2` ms (default 37.5 ms/char — twice as fast as typing).
- When `charIdx` reaches 1, timer fires and sets `charIdx` to 0, `display` to `""`.
- Cleanup: timer cancelled if dependencies change.

### Phase D — Word Transition (`deleting && charIdx === 0`) ← VIOLATION

**Condition:** `deleting === true` AND `charIdx === 0`

```js
// Lines 55–58 — SYNCHRONOUS STATE UPDATES INSIDE EFFECT BODY
setDeleting(false);
setWordIdx(w => w + 1);
```

- **No timer.** Both `setState` calls fire synchronously during the effect body execution.
- This causes React to re-render immediately inside the effect — a violation of `react-hooks/set-state-in-effect`.
- React batches these two calls in React 18, so only one re-render occurs.
- Transition: `deleting` returns to `false`, `wordIdx` increments, `charIdx` is still `0`.
- The next effect run enters Phase A for the new word, starting from `charIdx === 0`.

---

## 4. Timing Values

| Parameter | Default | Applies To |
|---|---|---|
| `speed` | 75 ms | Each character typed (Phase A) |
| `speed / 2` | 37.5 ms | Each character deleted (Phase C) |
| `pause` | 1800 ms | Pause at full word before deletion begins (Phase B) |
| Cursor interval | 530 ms | Independent of typing animation |

---

## 5. Cleanup Behavior

| Phase | Timer Type | Cleanup |
|---|---|---|
| A (typing) | `setTimeout` | `clearTimeout(t)` on each effect re-run |
| B (pause) | `setTimeout` | `clearTimeout(t)` on each effect re-run |
| C (deleting) | `setTimeout` | `clearTimeout(t)` on each effect re-run |
| D (transition) | None | No cleanup needed (synchronous) — but this is the violation |
| Cursor blink | `setInterval` | `clearInterval(t)` on unmount |

---

## 6. React Strict Mode Implications

In React Strict Mode (development only), effects are intentionally run twice — the first run executes and its cleanup is called, then the effect runs again. For Phases A, B, and C this is safe because:

- Each `setTimeout` is cancelled by its `clearTimeout` cleanup before the second run.
- Only one pending timer exists at any given time.

For Phase D (the synchronous transition), Strict Mode double-invocation means `setDeleting(false)` and `setWordIdx(w => w + 1)` would be called **twice** in development — incrementing `wordIdx` by 2 instead of 1 per complete deletion cycle. This is a latent bug in addition to the lint error. The fix must prevent this double-increment.

---

## 7. Mount Locations

The component is mounted in `apps/web/app/page.jsx` at two call sites:

- **Line 163:** `<TypewriterEffect ... />` — in the hero section
- **Line 187:** `<TypewriterEffect ... />` — in a secondary marketing section

The component is **not** used on the authentication page, employer dashboard, or any other route. It is a marketing component, isolated to the public landing page (`/`).
