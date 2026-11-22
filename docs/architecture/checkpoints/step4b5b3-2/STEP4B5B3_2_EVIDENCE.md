# Step 4B5B3.2 Execution Evidence

**Date:** August 2, 2026  
**Task:** Verification logs, source diff, active/negative search output, test suite outputs, build logs, and package integrity for Step 4B5B3.2.

---

## 1. Exact Production Source Diff (`apps/web/lib/supabaseServer.js`)

```diff
diff --git a/apps/web/lib/supabaseServer.js b/apps/web/lib/supabaseServer.js
index f91209b..c22108c 100644
--- a/apps/web/lib/supabaseServer.js
+++ b/apps/web/lib/supabaseServer.js
@@ -32,46 +32,9 @@ export async function createSupabaseServerClient(request, useServiceRole = fals
-  // Mock token support for development and testing
-  if (sessionToken === 'mock-token') {
-    return {
-      auth: {
-        getUser: async () => ({
-          data: {
-            user: {
-              id: '00000000-0000-0000-0000-000000000000',
-              email: '[REDACTED: retired development identity]',
-              user_metadata: { role: 'employer', name: 'Admin Tester' }
-            }
-          },
-          error: null
-        })
-      },
-      from: () => ({
-        select: (cols) => ({ ... }),
-        insert: (data) => ({ ... }),
-        upsert: (data) => ({ ... }),
-        update: (data) => ({ ... })
-      }),
-      isMock: true
-    };
-  }
+  // Deprecated mock token negative rejection: fail closed before selecting service role or building client
+  const isDeprecatedMock = sessionToken === 'mock-token';
+  const effectiveSessionToken = isDeprecatedMock ? null : sessionToken;
+  const effectiveUseServiceRole = isDeprecatedMock ? false : useServiceRole;
 
   const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
-  const supabaseKey = useServiceRole 
+  const supabaseKey = effectiveUseServiceRole 
     ? (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
     : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 
@@ -85,7 +48,7 @@ export async function createSupabaseServerClient(request, useServiceRole = fals
   return createClient(supabaseUrl, supabaseKey, {
-    global: { headers: (sessionToken && !useServiceRole) ? { Authorization: `Bearer ${sessionToken}` } : {} },
+    global: { headers: (effectiveSessionToken && !effectiveUseServiceRole) ? { Authorization: `Bearer ${effectiveSessionToken}` } : {} },
   });
 }
```

---

## 2. Active-Behavior vs Negative-Detection Source Search

### Active Behavior Search (`apps/web/lib/supabaseServer.js`)
- **Mock-client creation paths:** **0 active occurrences**
- **`isMock` client properties:** **0 active occurrences**
- **Synthetic user objects:** **0 active occurrences**
- **Stubbed database query chains:** **0 active occurrences**

### Negative Detection Search (`apps/web/lib/supabaseServer.js`)
- **Negative detection literals (`mock-token` check):** 1 occurrence (`sessionToken === 'mock-token'`, strictly used to reject deprecated mock tokens before client construction).

---

## 3. Targeted Test Execution Output (`ServerMockSessionDecommission.test.js` & `ApiAuthorizationCharacterization.test.js`)

- **Command:** `npm exec --offline vitest run __tests__/security/ServerMockSessionDecommission.test.js __tests__/security/ApiAuthorizationCharacterization.test.js`

```
 ✓ __tests__/security/ServerMockSessionDecommission.test.js (10 tests) 15ms
 ✓ __tests__/security/ApiAuthorizationCharacterization.test.js (25 tests) 18ms

 Test Files  2 passed (2)
      Tests  35 passed (35)
```

---

## 4. Targeted ESLint Verification Output

- **Command:** `npm exec --offline eslint -- 'lib/supabaseServer.js' '__tests__/security/ServerMockSessionDecommission.test.js' '__tests__/security/ApiAuthorizationCharacterization.test.js'`
- **Result:** **0 ERRORS, 0 WARNINGS**.

---

## 5. Application-Wide ESLint Verification Output

- **Command:** `npm exec --offline eslint -- . --format json`
- **Result:** **0 ERRORS, 3 WARNINGS** (W07, W08, W09 untouched `@next/next/no-img-element` warnings).

---

## 6. Full Vitest Test Suite Execution Output

- **Command:** `npm exec --offline vitest run`
- **Result:** **13 test files passed, test-password-not-secret / test-password-not-secret tests passed** (100% green).

```
 ✓ __tests__/components/TypewriterEffect.test.jsx (5 tests)
 ✓ __tests__/components/ProtectedRoute.test.jsx (4 tests)
 ✓ __tests__/pages/AuthPage.test.jsx (3 tests)
 ✓ __tests__/pages/SourcingSessionPolling.test.jsx (9 tests)
 ✓ __tests__/pages/EmployerChatGreeting.test.jsx (16 tests)
 ✓ __tests__/pages/OneShotDataLoading.test.jsx (15 tests)
 ✓ __tests__/components/AuthProviderLifecycle.test.jsx (9 tests)
 ✓ __tests__/api/candidate.test.js (3 tests)
 ✓ __tests__/api/employer.test.js (1 test)
 ✓ __tests__/security/AuthSigninDecommission.test.js (8 tests)
 ✓ __tests__/security/ApiAuthorizationCharacterization.test.js (25 tests)
 ✓ __tests__/security/ClientMockSessionDecommission.test.jsx (15 tests)
 ✓ __tests__/security/ServerMockSessionDecommission.test.js (10 tests)

 Test Files  13 passed (13)
      Tests  test-password-not-secret passed (test-password-not-secret)
```

---

## 7. Next.js Production Build Output

- **Command:** `node node_modules/next/dist/bin/next build`
- **Result:** **Exit Code 0** (21 page routes, 28 API route-handler paths compiled cleanly).

---

## 8. Source Integrity & Package Hashes

- [x] Only authorized production file modified (`apps/web/lib/supabaseServer.js`)
- [x] Authorized test files created/modified (`apps/web/__tests__/**`)
- [x] `apps/web/lib/auth.js`: UNTOUCHED
- [x] `apps/web/lib/api.js`: UNTOUCHED
- [x] `package.json` SHA256: `4c6f469f83690a45f50a77de1265e194da2459d8009a9b174a476de7e1b298bc` (Unchanged)
- [x] `package-lock.json` SHA256: `5e2b91af2a5cca1863026532467b7e6a7c6fccb90f2355554c99fd128bb77365` (Unchanged)
- [x] Git remote: None
- [x] Push / Deployment: None
