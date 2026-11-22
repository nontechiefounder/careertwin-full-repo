# Warning Risk Register

**Date:** August 1, 2026  
**Task:** Step 4B4A  

---

## 1. Severity Classifications

- **BLOCKER:** Could expose data, break authentication, produce duplicate provider calls, or corrupt state.
- **HIGH:** Could cause stale or repeated business-data behavior during normal usage.
- **MEDIUM:** Could create inconsistent UI state, unnecessary calls, or confusing behavior.
- **LOW:** Performance, cleanup, or maintainability concern with limited user impact.
- **ACCEPT:** Current behavior is intentional and safe, requiring written justification.

---

## 2. Risk Register

| ID | File Path | Line | Rule ID | Severity | Confidence | Blocks Synthetic Demo | Blocks Auth Demo | Blocks Pilot | Blocks Prod | Recommended Disposition |
|---|---|---|---|---|---|---|---|---|---|---|
| **W01** | `app/candidate/proof-profile/[candidateId]/page.jsx` | 29 | `exhaustive-deps` | **MEDIUM** | High | No | No | Yes | Yes | Wrap `fetchData` in `useCallback` |
| **W02** | `app/candidate/proof-profile/[candidateId]/page.jsx` | 50 | `exhaustive-deps` | **LOW** | High | No | No | No | Yes | Wrap `generate` in `useCallback` |
| **W03** | `app/candidate/screen/[sessionId]/page.jsx` | 33 | `exhaustive-deps` | **MEDIUM** | High | No | No | Yes | Yes | Wrap `fetchData` in `useCallback` |
| **W04** | `app/employer/chat/page.jsx` | 323 | `exhaustive-deps` | **HIGH** | High | No | Yes | Yes | Yes | Retain `[user]` dep; refactor chip actions |
| **W05** | `app/employer/packet/[extractionId]/page.jsx` | 98 | `exhaustive-deps` | **MEDIUM** | High | No | No | Yes | Yes | Wrap `fetchPacket` in `useCallback` |
| **W06** | `app/employer/sourcing-session/[id]/page.jsx` | 188 | `exhaustive-deps` | **MEDIUM** | High | No | No | Yes | Yes | Wrap `fetchData` in `useCallback` |
| **W07** | `components/NaiveShell.jsx` | 19 | `no-img-element` | **LOW** | High | No | No | No | No | Convert to `<Image />` or ACCEPT |
| **W08** | `components/marketing/MarketingFooter.jsx` | 25 | `no-img-element` | **LOW** | High | No | No | No | No | Convert to `<Image />` or ACCEPT |
| **W09** | `components/marketing/MarketingNav.jsx` | 57 | `no-img-element` | **LOW** | High | No | No | No | No | Convert to `<Image />` or ACCEPT |
| **W10** | `lib/auth.js` | 140 | `exhaustive-deps` | **MEDIUM** | High | No | Yes | Yes | Yes | Add `syncTokenToCookie` to deps |
| **W11** | `lib/auth.js` | 252 | `exhaustive-deps` | **LOW** | High | No | Yes | Yes | Yes | Add `syncTokenToCookie` to `logout` deps |

---

## 3. Summary Totals

| Severity | Count | Warnings |
|---|---|---|
| **BLOCKER** | 0 | None |
| **HIGH** | 1 | W04 (`chat/page.jsx:323`) |
| **MEDIUM** | 5 | W01, W03, W05, W06, W10 |
| **LOW** | 5 | W02, W07, W08, W09, W11 |
| **ACCEPT** | 0 | None accepted permanently without formal review |

- **Blocking Unauthenticated Synthetic Demo:** **0** (All 11 warnings allow unauthenticated public demo execution).
- **Blocking Authenticated Demo:** **3** (W04, W10, W11 touch auth and chat state).
- **Blocking Real-Company Pilot:** **6** (All data-loading and auth warnings must be clean).
- **Blocking Production Launch:** **11** (Clean lint baseline required for production release).
