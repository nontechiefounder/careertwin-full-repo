# ESLint Warning Raw Inventory

**Date:** August 1, 2026  
**Source of Truth Command:** `npm exec --offline eslint -- . --format json`  
**Total Warnings:** 11  

---

## Raw ESLint Warning Output

```json
[
  {
    "filePath": "app/candidate/proof-profile/[candidateId]/page.jsx",
    "line": 29,
    "column": 37,
    "ruleId": "react-hooks/exhaustive-deps",
    "message": "React Hook useEffect has a missing dependency: 'fetchData'. Either include it or remove the dependency array."
  },
  {
    "filePath": "app/candidate/proof-profile/[candidateId]/page.jsx",
    "line": 50,
    "column": 6,
    "ruleId": "react-hooks/exhaustive-deps",
    "message": "React Hook useEffect has a missing dependency: 'generate'. Either include it or remove the dependency array."
  },
  {
    "filePath": "app/candidate/screen/[sessionId]/page.jsx",
    "line": 33,
    "column": 37,
    "ruleId": "react-hooks/exhaustive-deps",
    "message": "React Hook useEffect has a missing dependency: 'fetchData'. Either include it or remove the dependency array."
  },
  {
    "filePath": "app/employer/chat/page.jsx",
    "line": 323,
    "column": 6,
    "ruleId": "react-hooks/exhaustive-deps",
    "message": "React Hook useEffect has missing dependencies: 'router' and 'sendMessage'. Either include them or remove the dependency array."
  },
  {
    "filePath": "app/employer/packet/[extractionId]/page.jsx",
    "line": 98,
    "column": 39,
    "ruleId": "react-hooks/exhaustive-deps",
    "message": "React Hook useEffect has a missing dependency: 'fetchPacket'. Either include it or remove the dependency array."
  },
  {
    "filePath": "app/employer/sourcing-session/[id]/page.jsx",
    "line": 188,
    "column": 6,
    "ruleId": "react-hooks/exhaustive-deps",
    "message": "React Hook useEffect has a missing dependency: 'fetchData'. Either include it or remove the dependency array."
  },
  {
    "filePath": "components/NaiveShell.jsx",
    "line": 19,
    "column": 7,
    "ruleId": "@next/next/no-img-element",
    "message": "Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image`."
  },
  {
    "filePath": "components/marketing/MarketingFooter.jsx",
    "line": 25,
    "column": 17,
    "ruleId": "@next/next/no-img-element",
    "message": "Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image`."
  },
  {
    "filePath": "components/marketing/MarketingNav.jsx",
    "line": 57,
    "column": 9,
    "ruleId": "@next/next/no-img-element",
    "message": "Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image`."
  },
  {
    "filePath": "lib/auth.js",
    "line": 140,
    "column": 6,
    "ruleId": "react-hooks/exhaustive-deps",
    "message": "React Hook useEffect has a missing dependency: 'syncTokenToCookie'. Either include it or remove the dependency array."
  },
  {
    "filePath": "lib/auth.js",
    "line": 252,
    "column": 6,
    "ruleId": "react-hooks/exhaustive-deps",
    "message": "React Hook useCallback has a missing dependency: 'syncTokenToCookie'. Either include it or remove the dependency array."
  }
]
```
