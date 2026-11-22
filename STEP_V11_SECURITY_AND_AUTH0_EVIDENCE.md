# workBYLiNE Genome — V11 Security Repairs & Auth0 Design Evidence

- **Date:** 2026-11-22
- **Lifecycle Status:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`
- **Baseline Branch / Commit:** `review/workbyline-v10-candidate` (`005144e517265a9556d67df51d82139c335a7479`)
- **Repair Branch:** `fix/v11-security-repairs`

---

## 1. Changed Files Inventory (`v10` -> `v11`)

- `apps/web/lib/gmail.js`
- `apps/web/app/api/integrations/gmail/connect/route.js`
- `apps/web/app/api/integrations/gmail/callback/route.js`
- `apps/web/app/api/auth/me/route.js`
- `apps/web/app/api/search/route.js`
- `supabase/migrations/20260823000001_revoke_profiles_token_select.sql`
- `apps/web/__tests__/security/V11SecurityRepairs.test.js`
- `apps/web/__tests__/security/VitestDiscoveryContract.test.js`
- `scripts/guarded_disposable_verify.sh`
- `STEP_V11_SECURITY_AND_AUTH0_REPORT.md`
- `STEP_V11_SECURITY_AND_AUTH0_EVIDENCE.md`
- `evidence/v11/V11_REPAIR_DIFF.patch`
- `evidence/v11/V11_CHANGED_FILES.txt`

---

## 2. Execution & Verification Receipts

### 2.1 Initial Failure Preserved & Final Passing Guarded Run
- **Run `20261122T102147Z_93826`:** Failed Step 2 in sandbox (`psql: Operation not permitted` on `127.0.0.1:54422`).
- **Run `20261122T104546Z_99234`:** Failed Step 6a (`VitestDiscoveryContract.test.js` expected `67` suites, received `68` after adding `V11SecurityRepairs.test.js`). Updated `VitestDiscoveryContract.test.js` to `68` suites.
- **Final Run `20261122T121331Z_11248`:** `status: "PASSED"`, `exit_code: 0`, `cleanup_status: "clean"`, `disposable_target: 54422 / postgres / supabase_db_wbl-disposable-verify`, `server_ownership.listener_pid: null`:
  - Step 5: Forward migrations (including `20260823000001_revoke_profiles_token_select.sql`) applied; invariants `1|1|0|0|1` confirmed.
  - Step 6a: `21` test files, `190` tests passed (`0` failed).
  - Step 6b: `6` test files, `61` tests passed (`0` failed).
  - Step 7: ESLint `0` errors; Webpack production build `13.2s`, `51/51` static pages.
  - Step 8: Real PDF upload/parse/download/generate & competing pre-eval serialization passed.
  - Step 9 (Playwright against `http://localhost:3010`): `39` passed, `2` skipped (`42.8s`, skips concern removed `DocumentDropzone` / `intake-handoff-notice`).

### 2.2 Direct Disposable Database Privilege Verification (`127.0.0.1:54422`)
- `SET LOCAL ROLE authenticated; SELECT gmail_refresh_token FROM public.profiles LIMIT 1;` -> `ERROR: permission denied for table profiles` (`SQLSTATE 42501`).
- `information_schema.column_privileges` confirmed `authenticated` has `SELECT` only on `id, email, name, role, company, gmail_connected, gmail_email, created_at, updated_at` (`0` `anon`/`PUBLIC` grants).

### 2.3 Scanner Non-Execution Receipts
- `which semgrep codeql coderabbit gitleaks trivy osv-scanner snyk bandit` -> all `NOT_FOUND`.
- `npm --prefix apps/web audit --json` -> `ENOTFOUND registry.npmjs.org` (`NOT VERIFIED`).

---

## 3. Complete 51-Route API Traceability Matrix

| API Route | Methods | Identity & AuthZ Checks | DB / Provider Access | Failure Codes | Test Evidence / Status |
|---|---|---|---|---|---|
| `/api/auth/confirm` | `GET` | Public + `sanitizeRedirectUrl` | Supabase RLS client | `200`/redirect | `ApiAuthorizationCharacterization.test.js`, `DeviceSupportPolicy.test.js` |
| `/api/auth/me` | `GET` | `getUser` | Supabase RLS client (explicit safe columns) | `401,500` | `ApiAuthorizationCharacterization.test.js`, `V11SecurityRepairs.test.js` |
| `/api/auth/resend-verification` | `POST` | Public + single-instance cooldown/budget | Supabase Admin (`service_role`), dry-run/SMTP | `400,429,500,503` | `AuthPage.test.jsx` |
| `/api/auth/signin` | `POST` | Public | Supabase RLS client | `400,401,500` | `ApiAuthorizationCharacterization.test.js`, `AuthSigninDecommission.test.js` |
| `/api/auth/signup` | `POST` | Public | Supabase Admin (`service_role`), dry-run/SMTP | `400,500` | `ApiAuthorizationCharacterization.test.js`, `AuthPage.test.jsx` |
| `/api/candidate/profile` | `GET,POST` | `getUser` | Supabase RLS client | `401,500` | `ApiAuthorizationCharacterization.test.js`, `candidate.test.js` |
| `/api/candidate/proof-profile/[candidateId]` | `GET` | `requireUser`, `getVerifiedOrgMembership` | Supabase RLS client | `403,404,500` | `ApiAuthorizationBoundaryReconciliation.test.js`, `ApiAuthorizationCharacterization.test.js` |
| `/api/candidate/proof-profile/[candidateId]/generate` | `POST` | `requireUser` | Supabase RLS client | `403,404,500,502,503` | `ApiAuthorizationBoundaryReconciliation.test.js`, `ApiAuthorizationCharacterization.test.js` |
| `/api/candidate/screening-sessions/[sessionId]` | `GET` | `requireUser`, `getVerifiedOrgMembership` | Supabase Admin (`service_role`) | `403,404,500` | `ApiAuthorizationBoundaryReconciliation.test.js`, `ApiAuthorizationCharacterization.test.js` |
| `/api/candidate/screening-sessions/[sessionId]/answer` | `POST` | `requireUser`, `getVerifiedOrgMembership` | Supabase Admin (`service_role`) | `403,404,500` | `ApiAuthorizationBoundaryReconciliation.test.js`, `ApiAuthorizationCharacterization.test.js` |
| `/api/candidate/screening-sessions/[sessionId]/complete` | `POST` | `requireUser`, `getVerifiedOrgMembership` | Supabase Admin (`service_role`) | `403,404,422,500,502,503` | `screeningCompleteBehavior.test.js`, `TenantEvidenceSecurity.test.js` |
| `/api/candidate/screening-sessions/[sessionId]/start` | `POST` | `requireUser`, `getVerifiedOrgMembership` | Supabase Admin (`service_role`) | `403,404,500` | `ApiAuthorizationBoundaryReconciliation.test.js`, `ApiAuthorizationCharacterization.test.js` |
| `/api/candidate/status/[candidateId]` | `GET` | `requireUser`, `getVerifiedOrgMembership` | Supabase RLS client | `403,404,500` | `ApiAuthorizationBoundaryReconciliation.test.js`, `ApiAuthorizationCharacterization.test.js` |
| `/api/employer/analytics` | `GET` | `requireUser`, `getVerifiedOrgMembership` | Supabase RLS client | `403,500` | `ApiAuthorizationCharacterization.test.js`, `EmployerDay4Assertions.test.js` |
| `/api/employer/brief/[id]` | `GET` | `getUser`, `getVerifiedOrgMembership` | Supabase RLS client | `401,403,404,500,503` | `ApiAuthorizationCharacterization.test.js`, `EmployerWorkspaceSecurity.test.js` |
| `/api/employer/brief/[id]/approve` | `POST` | `requireUser`, `getVerifiedOrgMembership` | Supabase RLS client | `403,404,500` | `Track1IntegrityRepairs.test.js`, `rubricApproval.test.js` |
| `/api/employer/candidate-documents/[documentId]/download` | `GET` | `requireUser`, `getVerifiedOrgMembership` | Supabase Admin (`service_role`) | `200,403,404,500` | `Core09RouteSecurityAndDecoupling.test.js` |
| `/api/employer/candidate-documents/upload` | `POST` | `requireUser`, `getVerifiedOrgMembership` | Supabase Admin (`service_role`) | `400,403,404,409,413,415,422,500` | `Core09RouteSecurityAndDecoupling.test.js`, `UninterceptedPacketJourneyE2E.test.js` |
| `/api/employer/candidate-extractions` | `POST` | `requireUser` | Decommissioned | `410,500` | `ApiAuthorizationCharacterization.test.js` |
| `/api/employer/chat` | `POST` | `requireUser`, `getVerifiedOrgMembership`, `contextScope` | Python Context Service | `400,403,404,500,503` | `ApiAuthorizationCharacterization.test.js`, `EmployerChatRouteSecurity.test.js` |
| `/api/employer/context-sources` | `GET` | `contextScope` | Python Context Service | `400,401,403,404,503` | `ContextEvidenceFoundation.test.js`, `Track1IntegrityRepairs.test.js` |
| `/api/employer/context-sources/[sourceId]` | `DELETE` | `contextScope` | Python Context Service | `400,401,403,404,503` | `V3CloseoutBehavior.test.js` |
| `/api/employer/context-sources/[sourceId]/evidence` | `GET` | `contextScope` | Python Context Service | `400,401,403,404,503` | `V3CloseoutBehavior.test.js` |
| `/api/employer/context-sources/[sourceId]/retry` | `POST` | `contextScope` | Python Context Service | `400,401,403,404,503` | Unexamined in focused matrix |
| `/api/employer/context-sources/ask` | `POST` | `contextScope` | Python Context Service | `400,401,403,503` | Unexamined in focused matrix |
| `/api/employer/context-sources/related` | `POST` | `contextScope` | Python Context Service | `400,401,403,503` | Unexamined in focused matrix |
| `/api/employer/context-sources/search` | `POST` | `contextScope` | Python Context Service | `400,401,403,503` | Unexamined in focused matrix |
| `/api/employer/context-sources/upload` | `POST` | `contextScope` | Python Context Service | `400,413,422,503` | Unexamined in focused matrix |
| `/api/employer/hiring-runs` | `GET,POST` | `requireUser`, `getVerifiedOrgMembership` | Supabase RLS client | `400,403,500,503` | `ApiAuthorizationCharacterization.test.js`, `EmployerDay3Assertions.test.js` |
| `/api/employer/hiring-runs/suggest` | `POST` | `requireUser`, `getVerifiedOrgMembership` | Supabase RLS client | `400,403,500,503` | `ApiAuthorizationCharacterization.test.js` |
| `/api/employer/integrations/ashby` | `GET,POST` | `requireUser`, `getVerifiedOrgMembership` | Ashby client | `400,403,500,503` | Unexamined in focused matrix |
| `/api/employer/organizations` | `GET,POST` | `requireUser` | Supabase RLS client | `400,409,500` | `SafeRedirectAndEntry.test.js` |
| `/api/employer/organizations/accept-invite` | `POST` | `requireUser` | Supabase RLS client | `400,500` | Unexamined in focused matrix |
| `/api/employer/organizations/invite` | `GET,POST` | `requireUser`, `getVerifiedOrgMembership` | Dry-run / SMTP | `400,403,404,500` | `SafeRedirectAndEntry.test.js` |
| `/api/employer/packets/[extractionId]` | `GET` | `requireUser`, `getVerifiedOrgMembership` | Supabase Admin (`service_role`) | `400,403,404,500` | `ApiAuthorizationCharacterization.test.js`, `Core09RouteSecurityAndDecoupling.test.js` |
| `/api/employer/packets/[extractionId]/action` | `POST` | `requireUser`, `getVerifiedOrgMembership` | Supabase RLS + Admin (`profiles` email send), Dry-run / SMTP | `400,403,404,409,500,503` | `ApiAuthorizationCharacterization.test.js`, `Track1IntegrityRepairs.test.js` |
| `/api/employer/packets/[extractionId]/generate` | `POST` | `requireUser`, `getVerifiedOrgMembership` | Supabase Admin (`service_role`) | `403,404,422,500,503` | `ApiAuthorizationCharacterization.test.js`, `UninterceptedPacketJourneyE2E.test.js` |
| `/api/employer/research-qa` | `POST` | `contextScope` | Python Context Service | `400,403,404,500,502,503,504` | `CrossLanguageProxyContractUnit.test.js`, `researchQA.test.js` |
| `/api/employer/screening-sessions` | `POST` | `requireUser`, `getVerifiedOrgMembership` | Supabase Admin (`service_role`) | `201,400,403,404,500` | `ScreeningServerCreationPath.test.js` |
| `/api/employer/shortlist/[roleId]` | `GET` | `requireUser`, `getVerifiedOrgMembership` | Supabase RLS client | `400,403,404,500` | `ApiAuthorizationCharacterization.test.js`, `DataVertexRoutesAuth.test.js` |
| `/api/employer/sourcing/account` | `GET` | `requireUser`, `getVerifiedOrgMembership` | Supabase Admin (`service_role`), DataVertex client | `200,403,500` | `DataVertexRoutesAuth.test.js` |
| `/api/employer/sourcing/lookup` | `POST` | `requireUser`, `getVerifiedOrgMembership` | Supabase Admin (`service_role`), DataVertex client | `400,403,404,500,503` | `DataVertexRoutesAuth.test.js` |
| `/api/employer/sourcing/search` | `POST` | `requireUser`, `getVerifiedOrgMembership` | Supabase Admin (`service_role`), DataVertex client | `400,403,404,500,503` | `DataVertexRoutesAuth.test.js` |
| `/api/employer/sourcing/shortlist` | `POST` | `requireUser`, `getVerifiedOrgMembership` | DataVertex client | `400,403,404,500,503` | `DataVertexRoutesAuth.test.js` |
| `/api/employer/sourcing-sessions` | `POST` | `requireUser`, `getVerifiedOrgMembership` | Supabase RLS client | `400,403,404,500` | `ApiAuthorizationCharacterization.test.js`, `SourcingSessionSecurity.test.js` |
| `/api/employer/sourcing-sessions/[id]` | `GET` | `getUser`, `getVerifiedOrgMembership` | Supabase Admin (`service_role`) | `401,403,404,500` | `ApiAuthorizationCharacterization.test.js` |
| `/api/employer/sourcing-sessions/[id]/auto-source` | `POST` | `requireUser`, `getVerifiedOrgMembership` | Supabase Admin (`service_role`) | `400,403,404,500,503` | `ApiAuthorizationCharacterization.test.js` |
| `/api/health` | `GET` | Public / unauthenticated | None | `200` | `employer.test.js` |
| `/api/integrations/gmail/callback` | `GET` | `getUser`, `verifyAndConsumeGmailOAuthState`, `ALLOWED_OAUTH_ERRORS` | Supabase Admin (`service_role`), Google OAuth | Redirects (`307`) | `ApiAuthorizationCharacterization.test.js`, `V11SecurityRepairs.test.js` |
| `/api/integrations/gmail/connect` | `GET` | `getUser`, `createGmailOAuthState` + cookie | Supabase RLS client, Google OAuth | `401,500` | `ApiAuthorizationCharacterization.test.js`, `V11SecurityRepairs.test.js` |
| `/api/search` | `GET` | `getUser`, `sanitizeSearchQuery`, `.eq('employer_id', user.id)` | Supabase RLS client | `401,500` | `ApiAuthorizationCharacterization.test.js`, `V11SecurityRepairs.test.js` |
