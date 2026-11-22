# Step 4B5.2-D2C — Evidence File

**Date:** 2026-08-06  
**Baseline Commit:** `95a89be`  
**Target Project:** `headwayos-secondary` (`phli...xskd`), Region: `ap-northeast-2`  

---

## E1. Local Baseline Verification Log

```bash
$ git branch --show-current
antigravity/step4b2-frontend-parity

$ git log -n 1 --oneline
95a89be docs(database): verify staging client privilege boundaries

$ git status --short
(no output — clean working tree)

$ git remote -v
(no output — zero Git remotes configured)

$ docker info --format '{{.ServerVersion}}'
29.6.2
```

---

## E2. Linked Project Verification Log

```bash
$ npx supabase projects list
{"projects":[{"id":"phli...xskd","ref":"phli...xskd","name":"headwayos-secondary","region":"ap-northeast-2","status":"ACTIVE_HEALTHY","linked":true}]}
```

---

## E3. Remote GoTrue Auth Signup Execution Log

```json
// POST /auth/v1/signup (synthetic email)
{
  "user": {
    "id": "synthetic-uuid",
    "email": "d2c.alpha.owner@example.invalid",
    "email_confirmed_at": null
  },
  "session": null
}

// POST /auth/v1/token?grant_type=password
{
  "error": "Email not confirmed",
  "error_description": "Email link is invalid or has expired",
  "status": 400
}
```

---

## E4. Remote Security Advisor Lint Log

```bash
$ npx supabase db lint --linked
Initialising login role...
Connecting to remote database...
Linting schema: extensions
Linting schema: public
Linting schema: security

No schema errors found
{"results":[],"message":"db lint"}
```

---

## E5. Quality Gate Execution Logs

```bash
# Vitest (20/20 files, 222/222 tests pass)
Test Files  20 passed (20)
     Tests  222 passed (222)

# ESLint (0 errors, 3 warnings)
✖ 3 problems (0 errors, 3 warnings)

# Production Build
✓ Compiled successfully in 9.9s
✓ Generating static pages using 7 workers (31/31)
```
