# Step 4B5.2-D2C-R2.1 — Evidence File

**Date:** 2026-08-10  
**Baseline Commit:** `33cbcc4bc5a907d7992d7cd3deb95cdac348caa2`  
**Target Project:** `headwayos-secondary` (masked ref: `phli...xskd`), Region: `ap-northeast-2`  

---

## E1. Sanitization Note on Prior Checkpoint Evidence

> **Sanitization Correction Note**: The evidence file in prior checkpoint D2C-R2 (`STEP4B5_2_D2C_R2_EVIDENCE.md`) contained an unmasked non-secret Supabase project reference. While the reference is non-secret, exposing it violated the strict project sanitization guideline. Historical commit `33cbcc4bc5a907d7992d7cd3deb95cdac348caa2` is preserved immutable per repository rules. All evidence in this document (D2C-R2.1) and all future checkpoints strictly enforces masked project references (`phli...xskd`).

---

## E2. Pre-Execution Repository Gate Verification

```bash
$ git branch --show-current
antigravity/step4b2-frontend-parity

$ git rev-parse HEAD
33cbcc4bc5a907d7992d7cd3deb95cdac348caa2

$ git status --short
(no output — clean working tree)

$ git remote -v
(no output — zero Git remotes configured)

$ SUPABASE_ACCESS_TOKEN="[REDACTED]" npx supabase projects list --output json
[
  {
    "id": "phli...xskd",
    "ref": "phli...xskd",
    "name": "headwayos-secondary",
    "region": "ap-northeast-2",
    "status": "ACTIVE_HEALTHY",
    "linked": true
  }
]
```

---

## E3. Part 4 — Identity Creation Log (`Confirm email = OFF`)

| Actor Label | Endpoint | HTTP Status | User Object Returned | Session Non-Null | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Alpha Owner** | `POST /auth/v1/signup` | `200 OK` | `true` | `true` | Succeeded |
| **Alpha Recruiter** | `POST /auth/v1/signup` | `200 OK` | `true` | `true` | Succeeded |
| **Alpha Auditor** | `POST /auth/v1/signup` | `200 OK` | `true` | `true` | Succeeded |
| **Beta Owner** | `POST /auth/v1/signup` | `200 OK` | `true` | `true` | Succeeded |
| **Candidate One** | `POST /auth/v1/signup` | `200 OK` | `true` | `true` | Succeeded |
| **Candidate Two** | `POST /auth/v1/signup` | `200 OK` | `true` | `true` | Succeeded |

*Summary*: 6/6 signups succeeded. Zero tokens, passwords, URLs, or complete email addresses were printed or logged.

---

## E4. Part 6 — Post-Restoration Password Sign-In Verification (`Confirm email = ON`)

| Actor Label | Endpoint | Password Login Status | User Check Status (`/auth/v1/user`) | Memory Identity Match | Security Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Alpha Owner** | `POST /auth/v1/token?grant_type=password` | `200 OK` | `200 OK` | `PASS` | Authenticated |
| **Alpha Recruiter** | `POST /auth/v1/token?grant_type=password` | `200 OK` | `200 OK` | `PASS` | Authenticated |
| **Alpha Auditor** | `POST /auth/v1/token?grant_type=password` | `200 OK` | `200 OK` | `PASS` | Authenticated |
| **Beta Owner** | `POST /auth/v1/token?grant_type=password` | `200 OK` | `200 OK` | `PASS` | Authenticated |
| **Candidate One** | `POST /auth/v1/token?grant_type=password` | `200 OK` | `200 OK` | `PASS` | Authenticated |
| **Candidate Two** | `POST /auth/v1/token?grant_type=password` | `200 OK` | `200 OK` | `PASS` | Authenticated |

*Summary*: 6/6 identities successfully authenticated via password login while `Confirm email = ON`.

---

## E5. Application Fixtures Created Counter (Part 7)

- `organizations`: 0
- `organization_memberships`: 0
- `hiring_runs`: 0
- `candidate_profiles`: 0
- `candidates`: 0
- `screening_sessions`: 0
- `screening_answers`: 0
- `activity_events`: 0

---

## E6. Canonical Quality Gate Execution Output (Part 9)

### Vitest Suite (`apps/web`)

```bash
$ cd apps/web && unset CAREERTWIN_RUN_STAGING_TESTS && npm exec --offline vitest run

 ✓ __tests__/security/ApiAuthorizationCharacterization.test.js (25 tests)
 ✓ __tests__/security/FullSupabaseRuntimeValidation.test.js (22 tests)
 ...
 Test Files  19 passed | 1 skipped (20)
      Tests  221 passed | 1 skipped (222)
   Start at  18:37:30
   Duration  4.83s
```

### ESLint (`apps/web`)

```bash
$ cd apps/web && npm exec --offline eslint -- .
✖ 3 problems (0 errors, 3 warnings)
```

### Next.js Production Build (`apps/web`)

```bash
$ cd apps/web && npm run build
▲ Next.js 16.2.1 (Turbopack)
✓ Compiled successfully in 9.6s
  Running TypeScript ...
  Finished TypeScript in 225ms ...
  Collecting page data using 7 workers ...
✓ Generating static pages using 7 workers (31/31) in 433ms
```
