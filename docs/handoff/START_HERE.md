# workBYLiNE — Authoritative Engineering Handoff (`START_HERE.md`)

**v12 review candidate — local technical review only.** Current repair & evidence records: [STEP_V12_REPAIRS_AND_AUTH0_REPORT.md](../../STEP_V12_REPAIRS_AND_AUTH0_REPORT.md) and [STEP_V12_REPAIRS_AND_AUTH0_EVIDENCE.md](../../STEP_V12_REPAIRS_AND_AUTH0_EVIDENCE.md).

- **Product / Project:** workBYLiNE (Genome V3 / CareerTwin Hiring Intelligence Platform)
- **Lifecycle Status:** `IMPLEMENTED PENDING INDEPENDENT REVIEW` (STATE C)
- **Historical Base Commit Reference:** `68fb5f443dd20585670ed3f5c5a06ff4e8dc30f1` (v12 is a versioned archive & Git bundle delta beyond historical base commit)
- **Pinned v10 Baseline:** `WorkByLine_Parth_Local_Review_v10.zip` (`b46d2f354e45c1817623b984d88e9b673c6da814d30f549940afb9e6ab76966e`)

> [!IMPORTANT]
> **Status Boundary:** Neither this documentation nor the passing disposable/mocked verification gates declare the system `APPROVED`, `PRODUCTION READY`, or `REAL-COMPANY DATA READY`. All findings remain `IMPLEMENTED PENDING INDEPENDENT REVIEW` outside the bounded v5 review. Deployment and real-provider authorization remain separate.

---

## Authoritative 10-Document Index

All canonical handoff and audit documents live under `docs/handoff/` (with a root pointer to the canonical handoff):

| # | Document | Purpose |
|---|---|---|
| 1 | [START_HERE.md](./START_HERE.md) | Orientation, status boundary, reading order, and non-negotiable safety rules |
| 2 | [PARTH_HANDOFF.md](./PARTH_HANDOFF.md) | Reproducible cloud/staging handoff, F01–F09 & B1–B9 summary, reproduction commands |
| 3 | [ARCHITECTURE.md](./ARCHITECTURE.md) | System topology, trust boundaries, 6 Mermaid diagrams, and component map |
| 4 | [DATA_AND_API_CONTRACTS.md](./DATA_AND_API_CONTRACTS.md) | PostgreSQL schemas, RPC contracts, Next.js API routes, and Python Context API contracts |
| 5 | [DEPENDENCIES_AND_SETUP.md](./DEPENDENCIES_AND_SETUP.md) | Node.js, Next.js, Python, Playwright, and Supabase/PostgreSQL local & disposable setup |
| 6 | [INTEGRATIONS_AND_CONFIGURATION.md](./INTEGRATIONS_AND_CONFIGURATION.md) | Sanitized environment variables, AI providers, DataVertex, Ashby, Gmail/SMTP, Context Engine |
| 7 | [IMPLEMENTATION_AND_VERIFICATION.md](./IMPLEMENTATION_AND_VERIFICATION.md) | Capability audit matrix (`VERIFIED` / `TEST-VERIFIED` / `OBSERVED` / `NOT VERIFIED`) and exact test logs |
| 8 | [SECURITY_AND_OPERATIONS.md](./SECURITY_AND_OPERATIONS.md) | Tenant RLS/grants, fail-closed auth, secret-scan scope, protected targets, and incident boundaries |
| 9 | [PRD.md](./PRD.md) | Implemented V3 product scope vs. deferred Track 2 product scope |
| 10 | [ROADMAP.md](./ROADMAP.md) | Independent review closure -> Founder decisions -> bounded live-provider verification -> staging/Track 2 |

Supporting reconciled closeout & repair reports at repository root:
- [STEP_V8_REPAIRS_REPORT.md](../../STEP_V8_REPAIRS_REPORT.md) & [STEP_V8_REPAIRS_EVIDENCE.md](../../STEP_V8_REPAIRS_EVIDENCE.md) (latest `v8` auth-recovery & review-closure delta)
- [STEP_V7_REPAIRS_REPORT.md](../../STEP_V7_REPAIRS_REPORT.md) & [STEP_V7_REPAIRS_EVIDENCE.md](../../STEP_V7_REPAIRS_EVIDENCE.md) (historical `v7` delta)
- [TRACK1_REPAIR_STATUS.md](../../TRACK1_REPAIR_STATUS.md) & [VERIFICATION_EVIDENCE.md](../../VERIFICATION_EVIDENCE.md) (historical Track 1 / v4 baseline records)

---

## Reading Order for Reviewers & Parth

1. Read **this file** and [PARTH_HANDOFF.md](./PARTH_HANDOFF.md) for current commit, lifecycle state, and reproduction commands.
2. Review [IMPLEMENTATION_AND_VERIFICATION.md](./IMPLEMENTATION_AND_VERIFICATION.md) and [VERIFICATION_EVIDENCE.md](../../VERIFICATION_EVIDENCE.md) to verify what is **TEST-VERIFIED** locally vs **NOT VERIFIED** / **BLOCKED** (live external providers, Temporal CLI, BGE embeddings, hosted staging).
3. Review [ARCHITECTURE.md](./ARCHITECTURE.md), [DATA_AND_API_CONTRACTS.md](./DATA_AND_API_CONTRACTS.md), and [SECURITY_AND_OPERATIONS.md](./SECURITY_AND_OPERATIONS.md) before provisioning staging infrastructure.
4. Review [INTEGRATIONS_AND_CONFIGURATION.md](./INTEGRATIONS_AND_CONFIGURATION.md) and `.env.example` / `apps/web/.env.example` before configuring secrets.
