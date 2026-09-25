# Date.now() Proposed Diff

**File:** `apps/web/app/employer/chat/page.jsx`  
**Line:** 224  
**Date:** August 1, 2026  

---

## 1. Exact Current Expression (line 224)

```jsx
{new Date(run.created_at || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
```

---

## 2. Exact Proposed Replacement

```jsx
{(() => { const d = run.created_at ? new Date(run.created_at) : null; return d && !isNaN(d) ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"; })()}
```

This is the minimum possible change: a single-expression inline IIFE that replaces exactly the expression on line 224, inside the existing `<p>` tag. No surrounding lines are modified.

---

## 3. Behavior Table

| Condition | Input | Output | Notes |
|---|---|---|---|
| Valid ISO timestamp | `"2026-07-15T14:32:00.000Z"` | `"Jul 15"` | Same output as before — no visible change |
| Null timestamp | `null` | `"—"` | Em dash; previously fabricated today's date |
| Undefined timestamp | `undefined` | `"—"` | Em dash; previously fabricated today's date |
| Empty string | `""` | `"—"` | Em dash; `""` is falsy — handled correctly |
| Malformed string | `"not-a-date"` | `"—"` | `isNaN(d)` catches `Invalid Date` |
| Future valid ISO | `"2099-01-01T00:00:00.000Z"` | `"Jan 1"` | Correct — no year shown by design |

---

## 4. Expected Visual Difference

- **When `created_at` is a valid timestamp:** Zero visible change. Renders identically to before.
- **When `created_at` is absent or invalid:** Previously rendered today's date (e.g. `"Aug 1"`) — a fabricated and dynamically changing value. Now renders `"—"` — a deterministic neutral label.

---

## 5. Behavioral Risk

- **Risk level:** Zero for valid-date path (no change in logic).
- **Risk level:** Low for null/invalid path — the em dash is smaller than the date string and sits in a `text-[9px] text-white/20` paragraph with `font-mono` styling. The em dash character is within the same character-width range and inherits the same classes.
- **No layout shift** is expected. The `<p>` element already accommodates single-character through multi-character content (e.g. `"—"` vs `"Jul 15"`).
- **No state, effect, API call, sorting, or ordering is affected.**
- **No component restructuring required.**

---

## 6. Why the Replacement Is Deterministic

- `run.created_at` is a prop derived from API data already loaded into component state before render. It does not change between renders unless the `runs` array is updated.
- The `isNaN(d)` check is a pure, synchronous, side-effect-free evaluation of a `Date` object's validity.
- `d.toLocaleDateString(...)` called with a fixed locale string (`"en-US"`) and fixed options object produces the same output for the same input on every render.
- **No call to `Date.now()`, `new Date()` (without argument), `Math.random()`, `setTimeout`, or any other impure function appears in the replacement.**

---

## 7. Minimum Change Confirmation

- One line modified (line 224).
- No surrounding lines touched.
- No helper function added or extracted.
- No import added or removed.
- No class name or style attribute changed.
- No state or effect modified.
