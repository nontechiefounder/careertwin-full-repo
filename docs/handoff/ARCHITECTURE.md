# workBYLiNE — System Architecture & Trust Boundaries (`ARCHITECTURE.md`)

**v5 review candidate — local engineering review only.** This is a delta from the v4 Parth archive, not a clean checkout of its base commit. The v4 guarded run and production-build counts below are historical, not v5 executions. Current evidence and remaining gates: [v5 review record](../../V5_REVIEW.md).

**Lifecycle Status:** `IMPLEMENTED PENDING INDEPENDENT REVIEW`  
**Base Commit:** `68fb5f443dd20585670ed3f5c5a06ff4e8dc30f1`

---

## 1. High-Level System Topology

```mermaid
flowchart TB
    Browser["Browser Client (Next.js App Router UI)"]
    NextAPI["Next.js Route Handlers (apps/web/app/api/**)"]
    ProofEngine["Proof & Evaluation Kernel (packages/proof-engine)"]
    SupaAuth["Supabase Auth (GoTrue)"]
    SupaPG["Operational PostgreSQL + RLS + SECURITY DEFINER RPCs"]
    SupaStorage["Supabase Storage (candidate_resumes)"]
    PyCtx["Python Context Engine (service/memory_api.py :8011)"]
    ExtAI["External AI Providers (Gemini / Groq / Claude / OpenAI)"]
    ExtSourcing["External Sourcing & ATS (DataVertex / Coresignal / Crustdata / Ashby)"]
    ExtMail["Email Delivery (Gmail OAuth / SMTP / Dry-Run Gate)"]

    Browser -->|"HTTPS + Cookie/Bearer"| NextAPI
    NextAPI -->|"Verify JWT + Membership"| SupaAuth
    NextAPI -->|"Tenant-scoped Queries & RPCs"| SupaPG
    NextAPI -->|"PDF Byte Upload / Signed Fetch"| SupaStorage
    NextAPI -->|"In-process WeakMap Provenance"| ProofEngine
    NextAPI -->|"Signed Delegation Token"| PyCtx
    NextAPI -->|"Provider policy varies by route; see integrations"| ExtAI
    NextAPI -->|"Credit-ledger Gated Calls"| ExtSourcing
    NextAPI -->|"CAREERTWIN_DRY_RUN_EMAIL Gate"| ExtMail
    PyCtx -->|"pgvector + FTS + Context Tables"| SupaPG
```

---

## 2. Authentication, Membership & Tenant Isolation Flow

```mermaid
sequenceDiagram
    participant U as User / Browser
    participant R as Next.js API Route
    participant A as Supabase Auth
    participant DB as PostgreSQL (RLS + Membership)

    U->>R: Request (Cookie or Bearer JWT)
    R->>A: Validate session / user JWT
    alt Unauthenticated
        R-->>U: 401 Unauthorized
    else Authenticated
        R->>DB: Check organization_memberships (active org + role)
        alt Non-member or insufficient role (e.g. auditor/viewer on write)
            R-->>U: 403 Forbidden (fail closed before AI/RPC writes)
        else Authorized Member
            R->>DB: Execute RLS query or SECURITY DEFINER RPC (service_role)
            DB-->>R: Authoritative row / ledger revision
            R-->>U: 200 OK
        end
    end
```

---

## 3. Candidate Evidence, Provenance & Evaluation Pipeline

```mermaid
flowchart LR
    PDF["Candidate PDF Upload (/api/employer/candidate-documents/upload)"] --> Parse["pdf-parse Extraction + SHA-256"]
    Parse --> Extract["evidenceExtractor.js (Word-boundary & Negation Gates)"]
    Extract -->|"No external repo connector"| Inferred["INFERRED Claims (WeakMap Provenance Absent)"]
    Repo["Server-Attested Provenance (attestTrustedEvidenceProvenance)"] -->|"sha256 + offset + authorship_verified"| Verified["VERIFIED Claims"]
    Inferred --> Eval["packages/proof-engine (evaluateCandidateTrustPacket)"]
    Verified --> Eval
    Eval -->|"verified_proof_score + assertion_alignment_score + calculation_digest"| RPC["allocate_claim_ledger_revision_and_persist"]
    RPC --> Packet["Decision Packet (fit_score preserved; intentional null never falls back)"]
```

---

## 4. Employer Grounded Chat & Abstention Validation Flow

```mermaid
flowchart TD
    Q["Employer Chat Prompt (POST /api/employer/chat)"] --> Auth["Verify Org Membership & Mapping"]
    Auth -->|"401 / 403 UNMAPPED_WORKSPACE / MAPPING_REVOKED"| Deny["Fail Closed (No Direct SQL Fallback)"]
    Auth -->|"Authorized"| Ctx["Python Context Engine (/v3/context/inspect or contextFetch)"]
    Ctx -->|"pending / missing / lexical_only / unavailable"| State["Preserve Exact context_status"]
    State --> No["Fixed abstention when no eligible span"]
    Ctx -->|"Eligible passages and allowed Gemini configuration"| Pick["Select excerpt"]
    Pick --> Match{"Exactly one matching source span?"}
    Match -->|"Yes"| Out["Full original span plus source card"]
    Match -->|"No"| No
```

---

## 5. Screening Session Completion & Concurrency Transaction Flow

```mermaid
sequenceDiagram
    participant C as Candidate or Employer Writer
    participant API as POST /api/candidate/screening-sessions/[sessionId]/complete
    participant AI as generateChat (Summary)
    participant RPC as complete_screening_session_transactional

    C->>API: Complete Screening Session
    API->>API: Enforce candidate self-complete OR ALLOWED_EMPLOYER_WRITER_ROLES
    API->>API: Validate technical_score & communication_score in [0.0, 1.0]
    API->>AI: Generate structured strengths, concerns, recommended_next_step
    API->>RPC: Call SECURITY DEFINER RPC (FOR UPDATE row lock)
    alt First Completion
        RPC-->>API: Persist screening_summaries + screening_sessions atomically
        API-->>C: 200 OK (structured fields + idempotent: false)
    else Concurrent / Replay Request
        RPC-->>API: Return persisted summary & structured fields
        API-->>C: 200 OK (identical structured fields + idempotent: true)
    end
```

---

## 6. Guarded Disposable Verification & Secret-Boundary Architecture

```mermaid
flowchart LR
    Src["Canonical Worktree / Mirror Source"] -->|"Stage excluding .env*, .git, symlinks"| Iso["Isolated Temp Run Dir"]
    Iso -->|"Step 1-2: Docker + Inet Port + 4-Way Proof"| Guard{"Protected Target Check"}
    Guard -->|"54330-54335 or careertwin-local-baseline or :3000/:3004"| Abort["FATAL GUARD REJECTION"]
    Guard -->|"wbl-disposable-verify (:54422 / :54421 / :3010)"| Run["env -i Allowlist Execution"]
    Run --> Suites["Migrations -> Vitest (20+6) -> Lint/Build -> Live :3010 -> Playwright"]
    Suites --> Logs["Sanitized Logs & summary.json (Secrets Scrubbed)"]
```

---

## 7. Material Component Inventory

| Component | Path | Purpose | Status Tag |
|---|---|---|---|
| Web App & API | `apps/web/app/**` | Next.js 16 App Router UI + 50 API route handlers | `TEST-VERIFIED` (disposable + mocked) |
| Proof Engine | `packages/proof-engine/src/**` | Deterministic scoring, `WeakMap` provenance, `calculation_digest` | `TEST-VERIFIED` |
| Grounding Validator | `apps/web/lib/chatGrounding.js` | Clause-level polarity, entity, numeric, scope, and refusal-bypass validator | `TEST-VERIFIED` |
| Screening Completion | `apps/web/app/api/candidate/screening-sessions/[sessionId]/complete/route.js` | Role-gated, transactional screening completion + replay | `TEST-VERIFIED` |
| Context Engine | `service/memory_api.py`, `service/core.py` | FastAPI context ingestion, FTS/hybrid retrieval, grounding inspection | `OBSERVED` / `TEST-VERIFIED` (PG17 FTS; Temporal CLI & BGE weights `NOT VERIFIED` locally) |
| Guarded Harness | `scripts/guarded_disposable_verify.sh` | Isolated disposable verification runner with secret scrubbing | `VERIFIED` |
