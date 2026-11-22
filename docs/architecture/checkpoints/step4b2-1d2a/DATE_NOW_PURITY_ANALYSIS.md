# Date.now() Purity Analysis

**Authorized File:** `apps/web/app/employer/chat/page.jsx`  
**Lint Rule Violated:** `react-hooks/purity` at line 224  
**Date:** August 1, 2026  

---

## 1. What `run` Represents

`run` is a single element of the `runs` state array, typed as a hiring run record sourced from the Supabase `hiring_runs` table via the API route `GET /api/employer/analytics`. Each hiring run corresponds to a role brief created by an employer. The variable is used as a prop to the `ArtifactCard` sub-component (`function ArtifactCard({ run, onClick, active })`).

---

## 2. Where `run.created_at` Originates

The `runs` array is populated in a `useEffect` hook on mount:

```js
useEffect(() => {
  api.get("/employer/analytics").then(res => {
    const r = res.data?.runs || [];
    setRuns(r);
    if (r.length > 0) setActiveRun(r[0]);
  }).catch(() => {});
}, []);
```

The API route `app/api/employer/analytics/route.js` queries Supabase and includes `created_at` in the select:

```js
.order('created_at', { ascending: false });
```

The `created_at` column is a standard Supabase timestamp written by the API when a hiring run is created (e.g. `app/api/employer/hiring-runs/route.js` line 56: `created_at: new Date().toISOString()`). It is an ISO 8601 UTC string (`"2026-07-15T14:32:00.000Z"`).

---

## 3. Whether `created_at` Can Be Absent, Null, Malformed or Invalid

**Can be absent / null:**
- The `analytics` API route reads from Supabase and does not guarantee every field is present. Older seeded records or records written before the `created_at` column was standardized may have `null` or `undefined`.
- The `api.get().catch(() => {})` swallows errors, so partial API responses are also possible.

**Can be malformed or invalid:**
- Any non-date string (e.g. `""`, a garbage value) passed to `new Date(...)` produces an Invalid Date object whose `toLocaleDateString()` returns `"Invalid Date"` — a visible rendering error.

**Can be a valid ISO string:**
- When the column is populated correctly, `run.created_at` is a valid ISO 8601 string parseable by `new Date(...)`.

---

## 4. What the UI Currently Displays When `created_at` Is Valid

`new Date("2026-07-15T14:32:00.000Z").toLocaleDateString("en-US", { month: "short", day: "numeric" })`

Produces: **`Jul 15`** (locale-formatted short date, no year).

This is pure visual metadata displayed in the bottom of each `ArtifactCard` — it tells the employer roughly when the hiring run was created.

---

## 5. What It Currently Displays When `created_at` Is Missing

With the current code `new Date(run.created_at || Date.now())`:
- When `run.created_at` is `null`, `undefined`, or `""` (falsy), `Date.now()` is called **during render**.
- This produces today's date — e.g. `Aug 1` — which **fabricates a false creation date** for a historical record.
- This is the `react-hooks/purity` violation: calling `Date.now()` during render is a side effect. Its value changes between renders, making the component non-deterministic.

---

## 6. Whether the Date Is Only Visual Metadata or Part of an Audit/Decision Record

The date display is **visual metadata only**:
- It appears in the bottom of an `ArtifactCard` in the right sidebar panel (`<p className="text-[9px] text-white/20 font-mono mt-1.5">`).
- It is not used for sorting (sorting is done by the API with `.order('created_at', { ascending: false })`).
- It is not used for filtering, comparison, or any decision pathway.
- It is purely a human-readable label to orient the employer to when the run was started.

There is no audit or decision-record implication. However, fabricating today's date (`Date.now()`) for a record that has no timestamp is **incorrect product behavior** — it misrepresents historical data.

---

## 7. Existing Missing-Value Convention in CareerTWiN

The em dash `—` is the established CareerTWiN convention for an unavailable or null value:

| File | Line | Usage |
|---|---|---|
| `app/employer/shortlist/[roleId]/page.jsx` | 16 | `score == null ? <span>—</span> : score.toFixed(2)` |
| `app/employer/packet/[extractionId]/page.jsx` | 179 | `score != null ? score.toFixed(2) : "—"` |
| `app/pricing/page.jsx` | 106–111, 180, 283 | Feature table missing entries rendered as `"—"` |

**Peer implementation (same date field, different page):**  
`app/employer/page.jsx` line 317 displays the same `run.created_at` using `new Date(run.created_at).toLocaleDateString(...)` without any fallback. This peer does not use `Date.now()` and does not handle the null case at all — meaning if `created_at` is null on that page, it renders `"Invalid Date"`.

The repair in the chat page should be consistent with the em-dash convention established by shortlist and packet pages, and should also silently handle the invalid-date case that the peer `employer/page.jsx` does not.

---

## 8. Product Rule Applied

> Do not fabricate today's date when stored historical data has no timestamp.

- A valid `created_at` must display using the existing `{ month: "short", day: "numeric" }` format.
- An absent or invalid `created_at` must display a **deterministic neutral fallback**: `—` (em dash), consistent with the established CareerTWiN UI convention.
- No timer, no `Date.now()`, no changing value.
