# Sourcing Disclosure Test Plan

**Date:** August 1, 2026  
**Target Subcomponent:** `ActionGroup` in `apps/web/app/employer/sourcing-session/[id]/page.jsx`  

---

## 1. Test Cases

| # | Test Case | Target Assertion |
|---|---|---|
| 1 | **Last item initially open** | Rendering `<ActionGroup isLast={true} ... />` renders expanded step list container. |
| 2 | **Non-last item initially closed** | Rendering `<ActionGroup isLast={false} ... />` does NOT render expanded step list container. |
| 3 | **User can close open item** | Clicking the pill toggle on an open item hides the step list. |
| 4 | **User can open older item** | Clicking the pill toggle on a closed item shows the step list. |
| 5 | **Appending new item behavior** | Mounting a new `ActionGroup` with `isLast={true}` starts open. |
| 6 | **Previous last item behavior** | Re-rendering an existing `ActionGroup` with `isLast={false}` retains its current user toggle state. |
| 7 | **Polling update stability** | Re-rendering `ActionGroup` with updated `group.events` preserves user's manual close state. |
| 8 | **No post-unmount updates** | Unmounting `ActionGroup` produces zero memory leak or unmounted component state update warnings. |
| 9 | **Zero network requests** | Test runs completely offline using pure React testing library renders. |

---

## 2. Testability Architecture Assessment

- **Is `ActionGroup` currently exported?**  
  No. `ActionGroup` is a module-local function inside `apps/web/app/employer/sourcing-session/[id]/page.jsx`.

- **Recommended Export Strategy for Testing:**  
  Add a named export to `ActionGroup` (`export function ActionGroup(...)`).  
  This allows `__tests__/components/ActionGroup.test.jsx` to import `<ActionGroup>` directly without mounting the full `SourcingSessionPage` (which requires deep router, auth, and API mocks).

- **Alternative (Page-Level Testing):**  
  Testing `ActionGroup` through `SourcingSessionPage` would require mocking `use(params)`, `useRouter`, `useAuth`, and `api.get('/employer/sourcing-sessions/*')`. Testing `ActionGroup` via named export is far cleaner, isolated, and focused solely on the component contract.
