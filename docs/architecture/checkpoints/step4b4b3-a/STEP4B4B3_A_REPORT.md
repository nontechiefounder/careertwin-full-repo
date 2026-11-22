# Step 4B4B3-A Execution Report

**Date:** August 2, 2026  
**Task:** Analysis of Employer Chat Greeting Hook Warning W04 & Behavior-Preserving Repair Design  
**Status:** COMPLETED — Analysis & Documentation Only. Zero production source or test code modified.

---

## 1. Executive Summary

Step 4B4B3-A conducted a comprehensive architectural analysis of warning W04 (`react-hooks/exhaustive-deps`) in `apps/web/app/employer/chat/page.jsx` near line 323. The flagged `useEffect` initializes the AI greeting message and attaches clickable suggestion chips. Currently, those chips store function closures over `router` and `sendMessage` directly inside the `messages` component state.

Adding `sendMessage` blindly to `useEffect`'s dependency array would create a critical UX regression: because `sendMessage` reads the chat input field (`input`), every single keystroke creates a new `sendMessage` function instance, causing `useEffect` to execute `setMessages([greeting])` on **every keystroke**, wiping out the user's entire conversation history.

A behavior-preserving repair design (Option D: Static Action Descriptors + Guarded Functional State Update) has been formulated and documented for future implementation.

---

## 2. Baseline Verification

- **Branch:** `antigravity/step4b2-frontend-parity`
- **HEAD Commit:** `11bce6b` (`fix(web): stabilize sourcing session polling`)
- **Base Tag:** `step4b4b2-sourcing-polling-fixed`
- **Working Tree:** Clean
- **Git Remote:** None
- **Package Manifest Hashes:**
  - `package.json` SHA256: `4c6f469f83690a45f50a77de1265e194da2459d8009a9b174a476de7e1b298bc` (Match)
  - `package-lock.json` SHA256: `5e2b91af2a5cca1863026532467b7e6a7c6fccb90f2355554c99fd128bb77365` (Match)
- **ESLint Warning Count:** 0 errors, exactly 6 warnings remaining (W04, W07–W11)
- **Vitest Suite:** 7 test files, 40 / 40 tests passed
- **Next.js Production Build:** Exit code 0 (21 page routes, 28 API handlers)

---

## 3. Complete Chat State & Greeting Analysis

### A. State Variable Inventory in `ChatPage`
1. `input` (`string`): Controls the current chat text input value.
2. `sending` (`boolean`): Tracks whether an AI chat message API request is in-flight.
3. `runs` (`array`): Stores hiring runs loaded from `/api/employer/analytics`.
4. `activeRun` (`object | null`): Holds the currently selected hiring run for artifact context.
5. `artifactTab` (`string`): Filter tab selection ("all", "active", "review", "done").
6. `messages` (`array`): The conversation history containing user and assistant message objects.
7. `chatEndRef` (`ref`): Ref attached to the bottom DOM element for smooth auto-scroll.

### B. Message Object & Greeting Shape
The `messages` state holds objects with the structure:
```json
{
  "id": "greeting",
  "role": "assistant",
  "time": "10:42 AM",
  "content": "Hi Jane 👋 I'm your CareerTWiN hiring AI...",
  "chips": [
    { "label": "Start a new role intake", "action": "[Function: action]" },
    { "label": "Review my pipeline", "action": "[Function: action]" }
  ]
}
```

### C. Analysis of `sendMessage` & Re-render Triggers
- `sendMessage` is an unmemoized inline function defined inside `ChatPage`.
- It reads `input`, `activeRun`, `runs`, and `user`.
- Its function identity changes on **every single render pass** when `input` updates (user typing), `activeRun` updates, `runs` updates, or `sending` state toggles.
- **The Keystroke Reset Vulnerability:** If `sendMessage` is added to `useEffect`'s dependency array `[user, sendMessage]`, every character typed into the text input (`setInput("a")`) creates a new `sendMessage` reference, triggering `useEffect` -> `setMessages([greeting])`. This **erases all previous messages and resets the chat to the initial greeting on every keystroke**.

---

## 4. Required Chat UX Contract

The proposed repair must strictly guarantee the following runtime behaviors across all 15 evaluated scenarios:

| Scenario | Trigger / Event | Required UX Outcome |
|---|---|---|
| **A** | Initial render while auth is loading | No greeting rendered until `user` object resolves. |
| **B** | `user` becomes available | Greeting initializes with user's first name (`user.name.split(' ')[0]`). |
| **C** | Greeting appears | Greeting message rendered with 4 clickable suggestion chips. |
| **D** | User types in chat input (`setInput`) | Messages array **must never reset**. Text input updates smoothly. |
| **E** | User sends a message (`sendMessage`) | User message appended to history; greeting **must never recreate**. |
| **F** | API response appends message | AI response appended to history; chips attached safely. |
| **G** | Active hiring run changes (`setActiveRun`) | Messages array **must never reset**. Artifact panel updates context. |
| **H** | Hiring runs array refreshes (`setRuns`) | Messages array **must never reset**. |
| **I** | Same user object re-renders | Greeting **must never re-fire** or overwrite existing conversation. |
| **J** | User identity genuinely changes | Greeting updates name only if messages array is uninitialized. |
| **K** | User logs out | Auth provider handles redirection to `/auth`. |
| **L** | Component unmounts and remounts | Clean fresh mount with greeting initialization. |
| **M** | User clicks a send-text chip | Text sent via `sendMessage`; conversation history preserved. |
| **N** | User clicks a navigation chip | Navigates via `router.push`; no state corruption. |
| **O** | Chat contains existing messages | Functional state update `setMessages(prev => prev.length > 0 ? prev : ...)` prevents overwrite. |

---

## 5. Evaluation of Repair Options

### Option A: Static Action Descriptors (Declarative Chips)
Replace function closures inside chip objects with serializable action descriptors:
`{ label: "Start a new role intake", action: "navigate", href: "/employer/intake" }`
`{ label: "Review my pipeline", action: "send", text: "Give me a summary of my current hiring pipeline" }`
- **Pros:** Completely removes `router` and `sendMessage` closures from React state and Effect dependencies. Keeps messages state 100% serializable JSON.
- **Cons:** Requires updating chip click handling in `MessageBubble`.

### Option B: Stable Greeting Builder (`useCallback`)
Wrap `sendMessage` in `useCallback`.
- **Pros:** Standard React hook approach.
- **Cons:** **Fails.** `sendMessage` reads `input`, `activeRun`, and `runs`. Memoizing `sendMessage` still causes it to change identity whenever `input` or `runs` update, failing to prevent keystroke chat resets.

### Option C: Ref-Guarded Initialization Only
Keep function closures, but guard `useEffect` execution with `hasInitializedRef.current`.
- **Pros:** Minimal lines changed.
- **Cons:** Leaves unmemoized function closures inside React state (`messages`), violating state serializability and failing to address the underlying architectural code smell.

### Option D (RECOMMENDED): Static Action Descriptors + Guarded Functional State Update
Combine static serializable action descriptors with a guarded functional state update in `useEffect([user])`:
```jsx
useEffect(() => {
  if (!user) return;
  const firstName = user.name?.split(" ")?.[0] || "there";
  setMessages(prev => {
    if (prev.length > 0) return prev; // Never overwrite existing conversation
    return [{
      id: "greeting",
      role: "assistant",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      content: `Hi ${firstName} 👋 I'm your CareerTWiN hiring AI...\n\nWhat would you like to work on?`,
      chips: [
        { label: "Start a new role intake", action: "navigate", href: "/employer/intake" },
        { label: "Review my pipeline", action: "send", text: "Give me a summary of my current hiring pipeline" },
        { label: "Source for a role", action: "send", text: "Help me start sourcing candidates" },
        { label: "Review shortlist", action: "send", text: "Show me candidates ready for review" },
      ],
    }];
  });
}, [user]);
```
- **Chip Click Resolver in `ChatPage`:**
  ```jsx
  const handleChipClick = (chip) => {
    if (chip.action === "navigate" || chip.href) {
      router.push(chip.href);
    } else if (chip.action === "send" || chip.text) {
      sendMessage(chip.text || chip.label);
    } else if (typeof chip.action === "function") {
      chip.action(); // Backward compatibility for legacy function chips
    }
  };
  ```
- **Pros:** Completely eliminates W04 without adding `sendMessage` or `router` to dependencies; preserves serializability; guarantees zero keystroke message resets; preserves backward compatibility for any dynamic function chips returned by API responses.

---

## 6. Proposed Files to Change & Test Plan for Future Task

### Proposed Source Changes (1 file)
- `apps/web/app/employer/chat/page.jsx`

### Proposed Test Additions (1 new test file)
- `apps/web/__tests__/pages/EmployerChatGreeting.test.jsx`
  - Test 1: Greeting initializes with user first name when user resolves.
  - Test 2: Typing in input field does not reset conversation history.
  - Test 3: Sending a message does not recreate greeting.
  - Test 4: Clicking navigation chip calls `router.push`.
  - Test 5: Clicking send-text chip calls `sendMessage`.
  - Test 6: Existing conversation is preserved when user re-renders.
  - Test 7: Zero external provider endpoints contacted.

---

## 7. Effective ESLint Configuration Analysis

Inspection of the effective ESLint configuration via `npm exec --offline eslint -- --print-config 'app/employer/chat/page.jsx'` revealed:
- `no-undef`: **Not configured / Absent** in flat config ruleset.
- `react-hooks/exhaustive-deps`: **Warning (level 1)**.

### Recorded Wording Alignment
*"The current project ESLint run did not flag the undefined `useCallback` identifier in previous steps. The effective ESLint configuration requires separate inspection before attributing the gap to a specific preset or rule setting."*

---

## 8. Remaining ESLint Warnings (Exactly 6)

1. `app/employer/chat/page.jsx:323` (W04 — `react-hooks/exhaustive-deps` — Subject of this design)
2. `components/NaiveShell.jsx:19` (W07 — `@next/next/no-img-element`)
3. `components/marketing/MarketingFooter.jsx:25` (W08 — `@next/next/no-img-element`)
4. `components/marketing/MarketingNav.jsx:57` (W09 — `@next/next/no-img-element`)
5. `lib/auth.js:140` (W10 — `react-hooks/exhaustive-deps`)
6. `lib/auth.js:252` (W11 — `react-hooks/exhaustive-deps`)

---

## 9. Remaining Launch Blockers

- Credential rotation confirmation
- Mock-token removal
- Secure server-side authentication & session persistence
- Role authorization & tenant/org isolation
- Database PostgreSQL / RLS enforcement
- Production backend API integration

---

## 10. Commit & Founder Review Request

This task is analysis and documentation only. Zero source code or test files were modified.

- **Commit Message:** `docs(web): analyze chat greeting hook warning`
- **Tag:** None created

Request founder review and authorization of the proposed Option D repair design for Step 4B4B3-B implementation.
