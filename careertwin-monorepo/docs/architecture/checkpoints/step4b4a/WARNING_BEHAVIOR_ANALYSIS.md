# Warning Behavior Analysis

**Date:** August 1, 2026  
**Task:** Step 4B4A  

---

## 1. Analysis of `react-hooks/exhaustive-deps` Warnings

### W01 (`app/candidate/proof-profile/[candidateId]/page.jsx:29`)
- **Flagged Code:** `useEffect(() => { fetchData(); }, [candidateId]);`
- **Omitted Dependency:** `fetchData`
- **If Added Blindly:** `fetchData` is a standard inline function defined inside the component body (`const fetchData = async () => { ... }`). If `fetchData` is added to the dependency array without wrapping it in `useCallback`, `fetchData` will be re-created on every render pass, causing `useEffect` to fire on every render pass, triggering an **infinite API fetch loop** (`GET /api/candidate/proof-profile/...`).
- **Structural Disposition:** Wrap `fetchData` in `useCallback` with `[candidateId]` dependency, or move `fetchData` inside the `useEffect` body.
- **Classification:** Architectural debt / potential infinite loop if blindly "fixed".

### W02 (`app/candidate/proof-profile/[candidateId]/page.jsx:50`)
- **Flagged Code:** `useEffect(() => { if (!loading && !generating && !data?.proof_profile && data?.candidate && !hasTriggered.current) { hasTriggered.current = true; generate(); } }, [loading, generating, data?.proof_profile, data?.candidate]);`
- **Omitted Dependency:** `generate`
- **If Added Blindly:** `generate` is defined inline. If added without `useCallback`, every state update (`generating = true`) re-executes the Effect. The `hasTriggered.current` ref currently guards against infinite execution, but adding `generate` creates unnecessary effect re-evaluations.
- **Structural Disposition:** Wrap `generate` in `useCallback` or pass it as a stable ref/callback.
- **Classification:** Minor architectural debt guarded by `useRef`.

### W03 (`app/candidate/screen/[sessionId]/page.jsx:33`)
- **Flagged Code:** `useEffect(() => { fetchData(); }, [sessionId]);`
- **Omitted Dependency:** `fetchData`
- **If Added Blindly:** `fetchData` is an inline function. Adding `fetchData` without `useCallback` causes an **infinite API fetch loop** on every render pass.
- **Structural Disposition:** Wrap `fetchData` in `useCallback` with `[sessionId]` or move inside `useEffect`.
- **Classification:** Potential request loop if blindly fixed.

### W04 (`app/employer/chat/page.jsx:323`)
- **Flagged Code:** `useEffect(() => { ... setMessages([greeting]); }, [user]);`
- **Omitted Dependencies:** `router`, `sendMessage`
- **If Added Blindly:** `sendMessage` is an inline async function that depends on `input`, `activeRun`, `runs`, and `user`. If `sendMessage` is added to the dependency array, every keystroke in `input` changes `sendMessage`, causing `useEffect` to re-run and **reset the chat messages array to the initial greeting** on every keystroke!
- **Structural Disposition:** Keep `[user]` dependency (greeting should only re-initialize when user identity changes). Extract chip action handlers or use stable callbacks.
- **Classification:** False-positive suggestion — adding suggested dependencies would cause critical state-reset bugs.

### W05 (`app/employer/packet/[extractionId]/page.jsx:98`)
- **Flagged Code:** `useEffect(() => { fetchPacket(); }, [extractionId]);`
- **Omitted Dependency:** `fetchPacket`
- **If Added Blindly:** `fetchPacket` is defined inline. Adding it without `useCallback` causes an **infinite API fetch loop**.
- **Structural Disposition:** Wrap `fetchPacket` in `useCallback` with `[extractionId]` or move inside `useEffect`.
- **Classification:** Potential request loop if blindly fixed.

### W06 (`app/employer/sourcing-session/[id]/page.jsx:188`)
- **Flagged Code:** `useEffect(() => { fetchData(true); const interval = setInterval(() => fetchData(false), 3000); return () => clearInterval(interval); }, [id]);`
- **Omitted Dependency:** `fetchData`
- **If Added Blindly:** Adding `fetchData` without `useCallback` causes the 3-second interval to be **cleared and re-created on every render pass**, destroying polling timing and creating rapid API bursts.
- **Structural Disposition:** Wrap `fetchData` in `useCallback` with `[id]` dependency or move `fetchData` definition outside.
- **Classification:** Timer/polling instability risk if blindly fixed.

### W10 (`lib/auth.js:140`)
- **Flagged Code:** `useEffect(() => { ... getInitialSession(); ... }, []);`
- **Omitted Dependency:** `syncTokenToCookie`
- **If Added Blindly:** `syncTokenToCookie` is defined above using `useCallback(..., [])`. Adding it to `[]` is technically safe because `syncTokenToCookie` has `[]` dependencies, but `useEffect` is intentionally configured with `[]` to run **once on mount** as the single session initialization invariant.
- **Structural Disposition:** Add `syncTokenToCookie` to dependency array (since it is already memoized with `[]`), or document the single-mount invariant.
- **Classification:** Minor linter dissatisfaction; current behavior is safe.

### W11 (`lib/auth.js:252`)
- **Flagged Code:** `const logout = useCallback(async () => { ... syncTokenToCookie(null); ... }, []);`
- **Omitted Dependency:** `syncTokenToCookie`
- **If Added Blindly:** `syncTokenToCookie` is memoized with `[]`. Adding `syncTokenToCookie` to `useCallback`'s dependency array `[syncTokenToCookie]` is completely safe and eliminates the warning without changing runtime behavior.
- **Structural Disposition:** Add `syncTokenToCookie` to `logout`'s `useCallback` dependency array.
- **Classification:** Low-risk missing memoized dependency.

---

## 2. Analysis of `@next/next/no-img-element` Warnings (W07, W08, W09)

- **W07 (`components/NaiveShell.jsx:19`):** `<img src="/logo.svg" alt="CareerTWiN Logo" ... />`
- **W08 (`components/marketing/MarketingFooter.jsx:25`):** `<img src="/logo.svg" alt="CareerTWiN Logo" ... />`
- **W09 (`components/marketing/MarketingNav.jsx:57`):** `<img src="/logo.svg" alt="CareerTWiN Logo" ... />`

### Why `<img>` Was Used
All three instances render `/logo.svg` — a tiny (few hundred bytes) local SVG brand asset. The original author used raw `<img>` tags for instant SVG rendering without configuring Next.js Image loader props (`width`, `height`).

### Potential Issues vs Reality
Next.js flags `<img>` because for large bitmap images (JPEG/PNG), `next/image` provides auto-WebP conversion, layout shift prevention, and responsive sizing. For a local 1KB vector SVG logo, `<img>` causes zero measurable LCP degradation or bandwidth overhead. Replacing `<img>` with `<Image src="/logo.svg" width={32} height={32} alt="..." />` is a trivial cosmetic enhancement.
