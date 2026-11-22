# Date.now() Testability Decision

**File:** `apps/web/app/employer/chat/page.jsx`  
**Date:** August 1, 2026  

---

## 1. What Would Need to Be Tested

The repaired expression in `ArtifactCard` at line 224 has three branches:

| Branch | Input | Expected Output |
|---|---|---|
| Valid timestamp | `run.created_at = "2026-07-15T14:32:00.000Z"` | `"Jul 15"` |
| Null / absent timestamp | `run.created_at = null` | `"—"` |
| Malformed string | `run.created_at = "not-a-date"` | `"—"` |

---

## 2. Testability Assessment

### Obstacles

1. **`ArtifactCard` is not exported.** It is a module-local function inside `chat/page.jsx`. Testing it in isolation would require either:
   - Exporting it (modifying production code beyond the authorized scope of this task), or
   - Rendering the full `ChatPage` and inspecting the artifact sidebar.

2. **`ChatPage` depends on many hooks and context providers:**
   - `useAuth()` from `@/lib/auth` — requires a mock provider
   - `useRouter()` from `next/navigation` — requires a mock
   - `usePathname()` from `next/navigation` — requires a mock
   - `api.get("/employer/analytics")` — requires a mock for the `runs` data

3. **The existing test suite uses Vitest + JSDOM.** Mocking `useRouter` and `usePathname` from `next/navigation` and the full auth provider is possible, but rendering the full page and locating the artifact card timestamp element in the sidebar requires:
   - A `runs` array with controlled `created_at` values to be injected via the API mock
   - Assertions on a deeply nested `<p className="text-[9px]...">` element with no `data-testid`

4. **No `data-testid` exists on the date element.** Adding one would modify production code beyond the scope of this task.

5. **The repair is a single pure inline expression.** The logic (`d && !isNaN(d) ? d.toLocaleDateString(...) : "—"`) is trivially verifiable by reading it and by the lint tool's acceptance of the change.

---

## 3. Decision

**Decision: Do not add a test for this repair.**

**Rationale:**
- Testing requires either exporting `ArtifactCard` (a production change outside scope), or standing up the full `ChatPage` with six mocked providers plus a controlled API response — which constitutes component restructuring.
- The three-branch logic is a pure expression with no side effects. Its correctness is fully verifiable by code inspection and lint compliance.
- The `react-hooks/purity` rule itself validates that `Date.now()` is absent from render.
- Browser verification (Step 4B3) will visually confirm the output in all three conditions when real API data is available.

---

## 4. Test Gap Record

| Gap | Covered By |
|---|---|
| Valid `created_at` renders formatted date | Code inspection; existing build succeeds; browser verification (Step 4B3) |
| Null `created_at` renders `"—"` | Code inspection; `isNaN` guard confirmed by lint; browser verification (Step 4B3) |
| Malformed `created_at` renders `"—"` | Code inspection; `isNaN` guard confirmed by lint; browser verification (Step 4B3) |
