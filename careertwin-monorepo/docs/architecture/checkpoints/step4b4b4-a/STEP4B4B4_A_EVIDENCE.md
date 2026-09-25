# Step 4B4B4-A Execution Evidence

**Date:** August 2, 2026  
**Task:** Evidence artifact for Step 4B4B4-A (Frontend Authentication Security Boundary Analysis & W10/W11 Audit).

---

## 1. Exact Source Excerpts

### A. W10 & W11 Flagged Code Snippets (`lib/auth.js`)

```javascript
// Helper to sync token to cookie for server-side access
const syncTokenToCookie = useCallback((token) => {
  if (typeof document === 'undefined') return;
  const projectHost = process.env.NEXT_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0];
  const cookieName = `sb-${projectHost}-auth-token`;
  
  if (token) {
    const cookieValue = JSON.stringify({ access_token: token });
    document.cookie = `${cookieName}=${encodeURIComponent(cookieValue)}; path=/; SameSite=Lax`;
    console.log(`[Auth] Synced token to cookie: ${cookieName}`);
  } else {
    document.cookie = `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    console.log(`[Auth] Cleared auth cookie`);
  }
}, []); // Line 14 - Stable reference

// W10: Line 140
useEffect(() => {
  // ... initialization & onAuthStateChange listener
}, []); // Missing dependency: syncTokenToCookie

// W11: Line 252
const logout = useCallback(async () => {
  // ... sign out & cleanup
}, []); // Missing dependency: syncTokenToCookie
```

### B. Commented-Out Role Redirect in `ProtectedRoute.jsx:15-18`

```jsx
} else if (allowedRole && user.role !== allowedRole) {
  // router.replace('/');
  console.log("Dev: Bypassing role check for", allowedRole);
}
```

### C. Hardcoded Credentials in `app/api/auth/signin/route.js:18-41`

```javascript
-    [REDACTED: known hardcoded development credential condition removed]
    return NextResponse.json({
        user: {
            id: '00000000-0000-0000-0000-000000000000',
-    [REDACTED: synthetic mock user and mock session response removed]
            user_metadata: { role: 'employer', name: 'Admin Tester', company: 'CareerTWiN Dev' },
            is_mock: true
        },
        session: { access_token: 'mock-token', ... }
    });
}
```

### D. Mock Token Supabase Stubbing in `lib/supabaseServer.js:33-77`

```javascript
if (sessionToken === 'mock-token') {
  return {
    auth: {
      getUser: async () => ({
-    [REDACTED: synthetic mock user and mock session response removed]
      })
    },
    from: () => ({ /* stubbed database queries returning empty mock data */ }),
    isMock: true
  };
}
```

---

## 2. Targeted ESLint Output (`lib/auth.js`)

- **Command:** `npm exec --offline eslint -- 'lib/auth.js'`
- **Result:** **0 ERRORS, 2 WARNINGS**

```
apps/web/lib/auth.js
  140:6  warning  React Hook useEffect has a missing dependency: 'syncTokenToCookie'. Either include it or remove the dependency array    react-hooks/exhaustive-deps
  252:6  warning  React Hook useCallback has a missing dependency: 'syncTokenToCookie'. Either include it or remove the dependency array  react-hooks/exhaustive-deps

✖ 2 problems (0 errors, 2 warnings)
```

---

## 3. Effective ESLint Configuration Inspection

- **Command:** `npm exec --offline eslint -- --print-config 'lib/auth.js'`
- **`no-undef` Status:** **`None` / Not configured** in flat ruleset.
- **`react-hooks/exhaustive-deps` Status:** **Warning (level 1)** (`[1]`).

---

## 4. Application-Wide ESLint Output

- **Command:** `npm exec --offline eslint -- . --format json`
- **Result:** **0 ERRORS, 5 WARNINGS**

```
Total errors: 0
Total warnings: 5
- components/NaiveShell.jsx:19 (@next/next/no-img-element)
- components/marketing/MarketingFooter.jsx:25 (@next/next/no-img-element)
- components/marketing/MarketingNav.jsx:57 (@next/next/no-img-element)
- lib/auth.js:140 (react-hooks/exhaustive-deps)
- lib/auth.js:252 (react-hooks/exhaustive-deps)
```

---

## 5. Full Vitest Suite Execution Output

- **Command:** `npm exec --offline vitest run`
- **Result:** **8 test files passed, 56 / 56 tests passed** (100% green).

```
 ✓ __tests__/components/TypewriterEffect.test.jsx (5 tests)
 ✓ __tests__/components/ProtectedRoute.test.jsx (4 tests)
 ✓ __tests__/pages/AuthPage.test.jsx (3 tests)
 ✓ __tests__/api/candidate.test.js (3 tests)
 ✓ __tests__/pages/SourcingSessionPolling.test.jsx (9 tests)
 ✓ __tests__/pages/EmployerChatGreeting.test.jsx (16 tests)
 ✓ __tests__/pages/OneShotDataLoading.test.jsx (15 tests)

 Test Files  8 passed (8)
      Tests  56 passed (56)
```

---

## 6. Next.js Production Build Output

- **Command:** `node node_modules/next/dist/bin/next build`
- **Result:** **Exit Code 0** (21 page routes, 28 API handlers).

---

## 7. Environment & Security Check

- **`.env.local` File:** Present on disk, untracked by Git.
- **Keys Detected:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `CRUSTDATA_API_KEY`.
- **Secret Values Printed:** **NONE**.
- **Credential Rotation Status:** **Unconfirmed**.
- **Authenticated Browser Status:** **BLOCKED**.

---

## 8. Source Integrity & Package Hashes

- [x] Production source code (`apps/web/**`): **ZERO MODIFICATIONS**
- [x] Test files (`apps/web/__tests__/**`): **ZERO MODIFICATIONS**
- [x] `package.json` SHA256: `4c6f469f83690a45f50a77de1265e194da2459d8009a9b174a476de7e1b298bc` (Unchanged)
- [x] `package-lock.json` SHA256: `5e2b91af2a5cca1863026532467b7e6a7c6fccb90f2355554c99fd128bb77365` (Unchanged)
- [x] Git remote: None
- [x] Push / Deployment: None
