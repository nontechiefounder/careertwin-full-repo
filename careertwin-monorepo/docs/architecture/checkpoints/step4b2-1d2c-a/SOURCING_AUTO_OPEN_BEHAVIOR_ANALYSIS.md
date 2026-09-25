# Sourcing Auto-Open Behavior Analysis

**Authorized File (Read-Only):** `apps/web/app/employer/sourcing-session/[id]/page.jsx`  
**Target Subcomponent:** `function ActionGroup({ group, isLast, agentRunning })` (lines 71–147)  
**Target Lint Error:** `react-hooks/set-state-in-effect` on line 77  
**Date:** August 1, 2026  

---

## 1. Analysis Questions & Answers

### 1. The component containing this Effect
The `ActionGroup` subcomponent (lines 71–147) inside `app/employer/sourcing-session/[id]/page.jsx`.

### 2. The component props
- `group`: An action batch object containing `{ id, events: [...], completed: boolean }`.
- `isLast`: Boolean indicating whether this `ActionGroup` is the last element (`i === groups.length - 1`) in the `groups` array rendered by `SourcingSessionPage`.
- `agentRunning`: Boolean indicating whether the sourcing agent process is currently active.

### 3. How `open` state is initialized
`const [open, setOpen] = useState(isLast);`  
When `ActionGroup` mounts, `open` is initialized to `true` if `isLast` is `true`, or `false` if `isLast` is `false`.

### 4. How the user opens or closes the section
The user clicks the pill button (`<button onClick={() => setOpen(o => !o)} ...>`), which toggles local state `open`.

### 5. What `isLast` represents
Whether this group is at the bottom of the rendered log feed (`groups[groups.length - 1]`).

### 6. Whether `isLast` can change from `false` to `true`
No. In normal log streaming, new groups are appended to the end of `groups`. An existing group at `i < groups.length - 1` (`isLast = false`) will remain non-last as subsequent groups arrive.

### 7. Whether `isLast` can change from `true` to `false`
Yes. When a new `ActionGroup` is appended to `groups`, the previously-last group changes position from `i = N-1` to `i = N-2`, so its `isLast` prop transitions from `true` to `false`.

### 8. How sourcing log items are keyed
In `SourcingSessionPage` (line 477):  
`<ActionGroup key={group.id || i} group={group} isLast={i === groups.length - 1} agentRunning={isRunning} />`

### 9. Whether new log items mount as new components
Yes. When a new action batch starts, `groupEvents` creates a new group object with a unique `group.id` (`ev.id`). This causes React to mount a new `ActionGroup` component instance.

### 10. Whether existing items are reused or reordered
Existing items retain their keys (`group.id`). They re-render in place when `groups` updates.

### 11. Intended experience
- Newest action batch starts expanded (`open = true`) so the employer sees live progress.
- Older action batches default to collapsed (`open = false`) to avoid vertical clutter.
- Employer can click any pill to toggle expand/collapse.
- User's manual toggle choices must be preserved during polling updates.

### 12. Whether the Effect currently reopens an item the user intentionally closed
Yes. If `isLast` is `true`, `useEffect(() => { if (isLast) setOpen(true); }, [isLast])` will call `setOpen(true)` whenever `isLast` is evaluated as a changed dependency, potentially overriding a user's intentional close action.

### 13. Whether the Effect creates repeated or cascading renders
Yes. On initial mount of the last `ActionGroup`:
1. `useState(isLast)` initializes `open` to `true`.
2. React mounts and renders the component.
3. `useEffect` runs synchronously after paint, evaluates `isLast === true`, and calls `setOpen(true)`.
4. Calling `setState` inside the Effect body triggers an unnecessary extra render cycle.

### 14. Whether live polling, streaming or agent updates change the list
Yes. `SourcingSessionPage` polls `/api/employer/sourcing-sessions/${id}` every 3 seconds (`setInterval(() => fetchData(false), 3000)`). Every response updates `events`, re-executing `groupEvents(events)` and re-rendering `groups`.
