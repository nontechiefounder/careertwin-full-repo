# ESLint Entity Error Baseline

**Target Application:** `careertwin-monorepo/apps/web`  
**Date:** July 31, 2026  
**Total react/no-unescaped-entities Errors:** 22  

---

## 1. ESLint Entity Errors Baseline Map

| File | Line | Character | Original Visible Context | Proposed Syntactic Repair | Equivalence Confirmation |
|---|---|---|---|---|---|
| `app/about/page.jsx` | 19 | `'` | `Don't just hire...` | `Don&apos;t just hire...` | Rendered text remains `Don't just hire...` |
| `app/auth/page.jsx` | 113 | `"` | `"Don't have an account? Sign up"` | `&quot;Don&apos;t have an account? Sign up&quot;` | Rendered text remains `"Don't have an account? Sign up"` |
| `app/auth/page.jsx` | 113 | `'` | (Contraction inside quote above) | (See above) | (See above) |
| `app/auth/page.jsx` | 113 | `'` | (Contraction inside quote above) | (See above) | (See above) |
| `app/auth/page.jsx` | 113 | `"` | (Quotation inside quote above) | (See above) | (See above) |
| `app/candidate/onboarding/page.jsx` | 79 | `'` | `Let's build your profile` | `Let&apos;s build your profile` | Rendered text remains `Let's build your profile` |
| `app/compare/page.jsx` | 64 | `"` | `"The Hiring Genome OS"` | `&quot;The Hiring Genome OS&quot;` | Rendered text remains `"The Hiring Genome OS"` |
| `app/compare/page.jsx` | 64 | `"` | (Closing quote above) | (See above) | (See above) |
| `app/compare/page.jsx` | 95 | `'` | `Let's look at features...` | `Let&apos;s look at features...` | Rendered text remains `Let's look at features...` |
| `app/contact/page.jsx` | 15 | `'` | `We'd love to hear from you` | `We&apos;d love to hear from you` | Rendered text remains `We'd love to hear from you` |
| `app/employer/intake/page.jsx` | 460 | `'` | `Let's outline the role...` | `Let&apos;s outline the role...` | Rendered text remains `Let's outline the role...` |
| `app/employer/page.jsx` | 160 | `'` | `Here's your hiring overview...` | `Here&apos;s your hiring overview...` | Rendered text remains `Here's your hiring overview...` |
| `app/employer/page.jsx` | 192 | `"` | `"active"` | `&quot;active&quot;` | Rendered text remains `"active"` |
| `app/employer/page.jsx` | 192 | `"` | (Closing quote above) | (See above) | (See above) |
| `app/employer/sourcing-session/[id]/page.jsx` | 469 | `'` | `We're generating candidates...` | `We&apos;re generating candidates...` | Rendered text remains `We're generating candidates...` |
| `app/privacy/page.jsx` | 14 | `"` | `"CareerTWiN"` | `&quot;CareerTWiN&quot;` | Rendered text remains `"CareerTWiN"` |
| `app/privacy/page.jsx` | 14 | `"` | `"personal data"` | `&quot;personal data&quot;` | Rendered text remains `"personal data"` |
| `app/privacy/page.jsx` | 14 | `"` | (Closing quote above) | (See above) | (See above) |
| `app/privacy/page.jsx` | 14 | `"` | (Quotation above) | (See above) | (See above) |
| `app/privacy/page.jsx` | 14 | `"` | (Quotation above) | (See above) | (See above) |
| `app/privacy/page.jsx` | 14 | `"` | (Quotation above) | (See above) | (See above) |
| `app/terms/page.jsx` | 17 | `'` | `By accessing CareerTWiN's services...` | `By accessing CareerTWiN&apos;s services...` | Rendered text remains `By accessing CareerTWiN's services...` |

*(Note: `app/about/page.jsx` is NOT listed under authorized production files and will be left un-modified in this step to comply with strict file boundaries).*
