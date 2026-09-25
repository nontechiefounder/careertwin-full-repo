# Warning Repair Options

**Date:** August 1, 2026  
**Task:** Step 4B4A  

---

## 1. Proposed Repair Options

### W01 (`app/candidate/proof-profile/[candidateId]/page.jsx:29`)
- **Option 1 (Smallest):** Wrap `fetchData` in `useCallback` with `[candidateId]` and add `fetchData` to `useEffect` dependency array `[candidateId, fetchData]`.
- **Option 2 (Structural):** Move `fetchData` function definition inside `useEffect(() => { async function fetchData() { ... } fetchData(); }, [candidateId])`.
- **Recommended Option:** Option 1 (Preserves `fetchData` for manual refresh calls).

### W02 (`app/candidate/proof-profile/[candidateId]/page.jsx:50`)
- **Option 1 (Smallest):** Wrap `generate` in `useCallback` with `[candidateId]` and add `generate` to `useEffect` dependencies.
- **Option 2 (Structural):** Move auto-generation trigger into `fetchData` callback when proof profile is absent.
- **Recommended Option:** Option 1.

### W03 (`app/candidate/screen/[sessionId]/page.jsx:33`)
- **Option 1 (Smallest):** Wrap `fetchData` in `useCallback` with `[sessionId]` and add to `useEffect` dependencies.
- **Option 2 (Structural):** Move `fetchData` inside `useEffect`.
- **Recommended Option:** Option 1.

### W04 (`app/employer/chat/page.jsx:323`)
- **Option 1 (Smallest):** Extract chip action handlers out of inline `greeting` object definition; wrap greeting builder in `useCallback`.
- **Option 2 (Structural):** Define chip navigation actions as static route strings (`chip.href = "/employer/intake"`) instead of closures over `router` / `sendMessage`.
- **Recommended Option:** Option 2 (Eliminates functions inside state objects).

### W05 (`app/employer/packet/[extractionId]/page.jsx:98`)
- **Option 1 (Smallest):** Wrap `fetchPacket` in `useCallback` with `[extractionId]` and add to `useEffect` dependencies.
- **Option 2 (Structural):** Move `fetchPacket` inside `useEffect`.
- **Recommended Option:** Option 1.

### W06 (`app/employer/sourcing-session/[id]/page.jsx:188`)
- **Option 1 (Smallest):** Wrap `fetchData` in `useCallback` with `[id]` and add to `useEffect` dependencies.
- **Option 2 (Structural):** Extract polling logic into custom `usePollingEffect(fetchData, 3000, [id])` hook.
- **Recommended Option:** Option 1.

### W07, W08, W09 (`NaiveShell.jsx:19`, `MarketingFooter.jsx:25`, `MarketingNav.jsx:57`)
- **Option 1 (Smallest):** Replace `<img>` with Next.js `<Image src="/logo.svg" alt="CareerTWiN Logo" width={24} height={24} className="..." />`.
- **Option 2 (Structural):** Inline SVG component or keep `<img>` and configure narrow ESLint override comment for static SVG logo component.
- **Recommended Option:** Option 1.

### W10 & W11 (`lib/auth.js:140` and `:252`)
- **Option 1 (Smallest):** Add `syncTokenToCookie` to `useEffect` dependencies `[syncTokenToCookie]` on line 140 and `useCallback` dependencies `[syncTokenToCookie]` on line 252.
- **Option 2 (Structural):** Extract cookie synchronization into an independent dedicated `useEffect([token])`.
- **Recommended Option:** Option 1 (Zero runtime change since `syncTokenToCookie` is already memoized with `[]`).
