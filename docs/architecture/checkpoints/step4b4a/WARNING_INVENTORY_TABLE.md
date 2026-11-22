# Warning Inventory Table

**Date:** August 1, 2026  
**Total Warnings:** 11  

---

## Warning Details

| ID | File Path | Line:Col | Rule ID | Scope / Container | Flagged Expression | Omitted Values | Category |
|---|---|---|---|---|---|---|---|
| **W01** | `app/candidate/proof-profile/[candidateId]/page.jsx` | 29:37 | `react-hooks/exhaustive-deps` | `ProofProfilePage` component | `useEffect(() => { fetchData(); }, [candidateId])` | `fetchData` | Candidate Data Loading |
| **W02** | `app/candidate/proof-profile/[candidateId]/page.jsx` | 50:6 | `react-hooks/exhaustive-deps` | `ProofProfilePage` component | `useEffect(() => { if (...) generate(); }, [...])` | `generate` | Candidate AI Generation |
| **W03** | `app/candidate/screen/[sessionId]/page.jsx` | 33:37 | `react-hooks/exhaustive-deps` | `ScreeningSessionPage` component | `useEffect(() => { fetchData(); }, [sessionId])` | `fetchData` | Candidate Screening Data |
| **W04** | `app/employer/chat/page.jsx` | 323:6 | `react-hooks/exhaustive-deps` | `ChatPage` component | `useEffect(() => { ... setMessages([greeting]); }, [user])` | `router`, `sendMessage` | Interactive Chat Greeting |
| **W05** | `app/employer/packet/[extractionId]/page.jsx` | 98:39 | `react-hooks/exhaustive-deps` | `DecisionPacketPage` component | `useEffect(() => { fetchPacket(); }, [extractionId])` | `fetchPacket` | Employer Packet Data |
| **W06** | `app/employer/sourcing-session/[id]/page.jsx` | 188:6 | `react-hooks/exhaustive-deps` | `SourcingSessionPage` component | `useEffect(() => { fetchData(true); ... }, [id])` | `fetchData` | Polling & Sourcing Data |
| **W07** | `components/NaiveShell.jsx` | 19:7 | `@next/next/no-img-element` | `CTLogo` component | `<img src="/logo.svg" alt="CareerTWiN Logo" ... />` | N/A (Image element) | Static Visual Asset |
| **W08** | `components/marketing/MarketingFooter.jsx` | 25:17 | `@next/next/no-img-element` | `MarketingFooter` component | `<img src="/logo.svg" alt="CareerTWiN Logo" ... />` | N/A (Image element) | Static Visual Asset |
| **W09** | `components/marketing/MarketingNav.jsx` | 57:9 | `@next/next/no-img-element` | `MarketingNav` component | `<img src="/logo.svg" alt="CareerTWiN Logo" ... />` | N/A (Image element) | Static Visual Asset |
| **W10** | `lib/auth.js` | 140:6 | `react-hooks/exhaustive-deps` | `AuthProvider` component | `useEffect(() => { ... getInitialSession(); }, [])` | `syncTokenToCookie` | Authentication Session |
| **W11** | `lib/auth.js` | 252:6 | `react-hooks/exhaustive-deps` | `AuthProvider` component | `useCallback(async () => { ... }, [])` (`logout`) | `syncTokenToCookie` | Authentication Session |
