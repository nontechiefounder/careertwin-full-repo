# Visible Text Equivalence Report

**Target Files:** Modified JSX Pages  
**Date:** July 31, 2026  

---

## 1. Text Equivalence Audit

Below is a comparison of the decoded HTML entity rendering before and after Step 4B2.1D1 changes.

| File | Before (Source Text) | After (Source Text) | Decoded Rendered Output (Pre & Post) | Intentional Difference |
|---|---|---|---|---|
| `app/auth/page.jsx` | `"CareerTWiN cut our screening time by 70%. Every shortlist arrived with verified GitHub contributions and proof of impact. It's unlike anything we've ever used."` | `&quot;CareerTWiN cut our screening time by 70%. Every shortlist arrived with verified GitHub contributions and proof of impact. It&apos;s unlike anything we&apos;ve ever used.&quot;` | `"CareerTWiN cut our screening time by 70%. Every shortlist arrived with verified GitHub contributions and proof of impact. It's unlike anything we've ever used."` | **None** |
| `app/candidate/onboarding/page.jsx` | `We'll use this to build your proof-first profile...` | `We&apos;ll use this to build your proof-first profile...` | `We'll use this to build your proof-first profile...` | **None** |
| `app/compare/page.jsx` | `"{t.quote}"` | `&quot;{t.quote}&quot;` | `"{t.quote}"` | **None** |
| `app/compare/page.jsx` | `References don't check out.` | `References don&apos;t check out.` | `References don't check out.` | **None** |
| `app/contact/page.jsx` | `Let's talk` | `Let&apos;s talk` | `Let's talk` | **None** |
| `app/employer/intake/page.jsx` | `CareerTWiN's AI` | `CareerTWiN&apos;s AI` | `CareerTWiN's AI` | **None** |
| `app/employer/page.jsx` | `Let's get you started` | `Let&apos;s get you started` | `Let's get you started` | **None** |
| `app/employer/page.jsx` | `"New Role"` | `&quot;New Role&quot;` | `"New Role"` | **None** |
| `app/employer/sourcing-session/[id]/page.jsx` | `I'll keep you updated` | `I&apos;ll keep you updated` | `I'll keep you updated` | **None** |
| `app/privacy/page.jsx` | `"we," "our," or "us"` | `&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;` | `"we," "our," or "us"` | **None** |
| `app/terms/page.jsx` | `CareerTWiN's website` | `CareerTWiN&apos;s website` | `CareerTWiN's website` | **None** |

**Conclusion:** All entity corrections provide 100% byte-for-byte visual text rendering equivalence when decoded by the browser layout engine. There are zero differences.
