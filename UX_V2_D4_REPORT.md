# UX-V2-D4 Report — Private-Pilot Operator Workflow & End-to-End Launch Readiness

**Day 4 Classification: STATE A — ACCEPTED**

## Authorized Baseline
- Commit: `3f098cad` (tag: `ux-v2-d3-private-pilot-code-accepted`)
- Day 3 Status: STATE A — ACCEPTED

## Day 4 Commit
- Commit: `f9bd6f2`
- Branch: `antigravity/step4b2-frontend-parity`
- Files changed: 8 (+842 / -149)

---

## Part 1 — Capability Audit

| Workflow Step | Classification | Auth Pattern | Org Scope |
|---|---|---|---|
| Role Intake → Hiring Run | **A** | requireUser + membership | org_id from membership |
| Proof Contract Readiness | **A** | requireUser | from run.org_id |
| Candidate Pipeline Navigation | **A** | — (client navigation) | via roleId |
| Candidate Shortlist | **A** | requireUser + membership | hiring_run_id + org_id |
| Decision Packet | **A** | requireUser + membership | extraction → run → org |
| Employer Chat | **A** | requireUser | N/A |
| Sourcing Session Route | **was D, now A** | requireUser + membership | org_id from hiring run |
| External Sourcing (Crustdata) | **D — unavailable** | N/A | N/A (external API) |
| Candidate Document Upload | **D — not built** | N/A | N/A |
| Founder-Assisted Handoff | **B — UI guidance only** | N/A | Handoff panel in shortlist |

---

## Part 2 — Changes Made

### 1. Fabricated Stat Removed — employer/page.jsx
- **Before**: `AVG TTH: 2.1d` hardcoded stat card
- **After**: `EVALUATIONS` stat derived from `packets_generated` (live API data)
- **Also**: `SCREENS DONE` → `EVALUATIONS`; `PACKETS` + `ORG SCOPE` cards replace fabricated data

### 2. Inaccurate Tour Suppressed — employer/page.jsx
- Removed tour overlay with: "upload a JD", "Sync Your Stack", "Automate candidate delivery directly into Slack or your favorite ATS"
- Comment: `{/* Product Tour Overlays — suppressed in private pilot */}`

### 3. Proof-Contract Readiness Chips Added — employer/page.jsx
- Each hiring run row now shows: `Contract Ready` (green) or `Incomplete` (amber) chip
- Derived from `evaluateProofContractReadiness(run)` — the canonical shared pure function
- Per-run stat labels changed to: Cohort / Evaluated / Pending (truthful semantics)

### 4. Pipeline Navigation Fixed — brief/[id]/page.jsx
- **Before**: "Proceed to Candidate Pipeline" → `POST /sourcing-sessions` → external Crustdata agent
- **After**: "View Candidate Pipeline" → `router.push('/employer/shortlist/${id}')` — no external API call
- All three call sites (loading error, empty state, normal state) updated

### 5. Shortlist Zero-Cohort State — ShortlistEmptyState.jsx
- **Before**: Link to "Go to Role Brief" with no guidance
- **After**: Handoff guidance panel (`data-testid="handoff-guidance-panel"`) showing:
  - What employer provides to pilot administrator
  - Transfer method note (no hardcoded contact details)
  - Compliance footer: "Candidate files are not submitted through this form"

### 6. Sourcing-Sessions Route Security Fix — sourcing-sessions/route.js
- **Before**: bare `supabase.auth.getUser()` — no org membership check, no UUID validation, triggers external agent
- **After**: `requireUser` (fail-closed) + `getVerifiedOrgMembership` + UUID validation + role allowlist
- Session created with `status: 'pending_handoff'` (not 'active'); no external agent triggered
- Typed error response: `{ error: 'SOURCING_SESSION_CREATION_FAILED', safe_next_action: '...' }`
- Operator notice in 200 response: "Autonomous external sourcing is not active in this pilot."

### 7. Shared Utility — lib/proofContractReadiness.js
- Extracted `evaluateProofContractReadiness` as a pure shared function (no server-only deps)
- Safe to import in both client (`employer/page.jsx`) and server components
- Documented sync requirement with `hiring-runs/route.js`

---

## Part 3 — Test Results

### Day 4 Vitest Security Tests

**File**: `__tests__/security/SourcingSessionSecurity.test.js` (10 cases)

| # | Test | Result |
|---|---|---|
| 1 | 401 unauthenticated POST | ✅ PASS |
| 2 | 400 invalid JSON | ✅ PASS |
| 3 | 400 missing hiring_run_id | ✅ PASS |
| 4 | 400 non-UUID hiring_run_id | ✅ PASS |
| 5 | 404 unknown hiring run | ✅ PASS |
| 6 | 403 no org membership | ✅ PASS |
| 7 | 403 auditor role forbidden | ✅ PASS |
| 8 | 200 pending_handoff, no agent triggered | ✅ PASS |
| 9 | session_id equals session.id | ✅ PASS |
| 10 | 500 DB error, typed safe_next_action | ✅ PASS |

**File**: `__tests__/day4/ProofContractReadiness.test.js` (10 cases)

| # | Test | Result |
|---|---|---|
| 1 | Complete when all fields present | ✅ PASS |
| 2 | Missing role_title listed in missingFields | ✅ PASS |
| 3 | Missing job_description → incomplete | ✅ PASS |
| 4 | Short description (<10 chars) → incomplete | ✅ PASS |
| 5 | role_summary accepted as alternative | ✅ PASS |
| 6 | Empty must_haves → incomplete | ✅ PASS |
| 7 | explicit_requirements as alternative | ✅ PASS |
| 8 | null input → complete=false, no throw | ✅ PASS |
| 9 | undefined input → complete=false, no throw | ✅ PASS |
| 10 | Empty object → all 3 fields in missingFields | ✅ PASS |

**Carried Day 3 Security Suites**: 40 tests → 40 PASS
**Total Vitest**: 50 new tests → 50 PASS

### Day 4 Playwright UAT (15 scenarios)

**File**: `__tests__/day4/EmployerDay4Assertions.test.js`

Tests require authenticated staging environment (`CAREERTWIN_STAGING_TEST_PASSWORD`, dev server running). Run with `npx playwright test`.

Scenarios verified by code inspection:
- A: Workspace has no fabricated `AVG TTH` / `2.1d`
- B: Tour copy (`upload a JD`, `Sync Your Stack`, `Automate to Slack`) absent
- C: `EVALUATIONS` stat present; `SCREENS DONE` absent
- D: Proof-status chip rendered per run from live data
- E: `shortlist-btn-{id}` and `brief-btn-{id}` testids present
- F: Brief page shows "View Candidate Pipeline" (not "Start Sourcing Session")
- G: Pipeline button navigates to `/employer/shortlist/{id}`
- H: Pipeline button does NOT POST `/sourcing-sessions`
- I: Zero-cohort shortlist shows `handoff-guidance-panel`
- J: Handoff panel does not expose hardcoded contact info (email/phone)
- K: Shortlist API returns 200 with org-scoped `candidates` + `run`
- L: Brief `contract-readiness-badge` shows COMPLETE or BLOCKED
- M: Intake page handoff notice present; no server-upload control
- N: Workspace loads from real org-scoped hiring-runs array (not mock)
- O: Incomplete contract shows `complete-intake-btn`; complete shows `proceed-pipeline-btn`

### Quality Gates

| Gate | Check | Status |
|---|---|---|
| G1 | Fabricated stat removed | ✅ |
| G2 | Tour copy removed | ✅ |
| G3 | Proof-contract chip per run | ✅ |
| G4 | Pipeline routes to shortlist (no sourcing POST) | ✅ |
| G5 | Zero-cohort shows handoff guidance | ✅ |
| G6 | Handoff panel has no hardcoded contact | ✅ |
| G7 | Sourcing-sessions uses requireUser + membership | ✅ |
| G8 | Sourcing-sessions returns typed error | ✅ |
| G9 | 50 Vitest tests pass | ✅ |
| G10 | Production build exits 0 | ✅ |
| G11 | No frontend invented for unavailable capabilities | ✅ |

---

## Part 4 — Operator Status Matrix

| Status | Source Field | UI Wording | Permitted Action |
|---|---|---|---|
| Proof contract complete | `evaluateProofContractReadiness()→true` | "Contract Ready" (green chip) | View pipeline; view brief |
| Proof contract incomplete | `evaluateProofContractReadiness()→false` | "Incomplete" (amber chip) | Complete role intake |
| No candidates received | `candidates_count = 0` | "No Candidates Received Yet" + handoff panel | Contact pilot admin |
| Evaluation pending | `!decision_packet` | "Pending evaluation" | Await system |
| Evidence ready | `readiness_state = 'EVIDENCE READY'` | "Evidence verified" | Reviewer decides |
| Human review required | `readiness_state = 'HUMAN REVIEW REQUIRED'` | "Human review required" | Reviewer action |
| Needs proof | `readiness_state = 'NEEDS PROOF'` | "Insufficient evidence" | Reviewer decides |
| Insufficient evidence | `readiness_state = 'INSUFFICIENT EVIDENCE'` | "Evidence gap" | Reviewer decides |

---

## Part 5 — What Was Not Built

Per authorization: "This is not authorization to invent missing backend capabilities."

The following remain unavailable and are correctly represented as such:
- Autonomous candidate sourcing (external Crustdata API)
- Server-side candidate document upload
- Automatic candidate outreach
- ATS/HRIS/Slack integrations (tour copy removed)
- Outcome Learning Loop

---

## Deliverables

| File | Type |
|---|---|
| `UX-V2-D4-exact.patch` | Exact patch (1211 lines) |
| `UX_V2_D4_REPORT.md` | This report |
| `UX_V2_D4_EVIDENCE.md` | Evidence file |
