# Canonical IP-to-Production Reconciliation Audit Report (RC-C1.1 REVISED)

**Date:** 2026-08-13  
**Audit Scope:** Read-Only Reconciliation of CareerTWiN 100-Spec IP Repository against `careertwin-monorepo` Runtime.  
**Canonical IP Specs Source:** `/Users/darshilparmar/Desktop/CareerTWiN Private Pilot Build/CareerTWiN_100_Technical_Mathematical_Logical_IP_Specs/`  
**Monorepo IP Specs Copy:** `docs/private/ip-specs/` (relocated from `docs/specs/`).  
**Audited Runtime Path:** `apps/web/`, `packages/`, `services/`, `scripts/`, `scratch/`.

---

## Executive Summary & Terminal Audit Classification

**TERMINAL AUDIT CLASSIFICATION:** **`AMBER — BOUNDED RECONCILIATION PATCH REQUIRED`**

The current CareerTWiN Release Candidate (RC) decision path is architecturally sound and enforces fundamental domain invariants (separated fit/proof/uncertainty, protected attribute deletion, must-have/disqualifier gates, human override authority, and human-in-the-loop release protocols).

However, evaluation logic in `apps/web/lib/evaluations.js` currently uses simplified linear heuristics and scalar thresholds rather than invoking canonical domain modules from `packages/proof-engine/` and `packages/hiring-genome/`. A bounded P0 reconciliation patch is required to refactor `evaluations.js` into a clean facade over canonical packages prior to private pilot launch.

---

## Direct Answers to the 10 Core Reconciliation Questions

### 1. Are we currently using CareerTWiN's canonical proprietary IP in the private-pilot decision path?
**YES, in a bounded pilot form.** The foundational domain architecture directly implements the core principles of CTW-IP-005 (Proof Contract), CTW-IP-009/010 (Text-First Intake & Extraction), CTW-IP-026/027 (Gates), CTW-IP-028 (Human Override), CTW-IP-039 (Evidence Vocabulary), CTW-IP-040 (High-Fit/Low-Proof Detection), CTW-IP-076 (Protected Signal Removal), CTW-IP-078 (Bias-Safe Guardrails), CTW-IP-080 (Human Release Protocol), CTW-IP-093 (Trust Packet Format), and CTW-IP-100 (Human-Agent Decision Protocol).

### 2. Which pieces are genuinely implemented?
22 specifications have bounded pilot implementations in the P0/P1 runtime path, including:
- **CTW-IP-010:** Text-First Candidate Extraction & Evaluation Pipeline
- **CTW-IP-028:** Human Override Logic (`apps/web/app/api/employer/packets/[extractionId]/action/route.js`)
- **CTW-IP-039:** Candidate State Classification Logic (Evidence Vocabulary: `EVIDENCE READY`, `NEEDS PROOF`, `HUMAN REVIEW REQUIRED`, `INSUFFICIENT EVIDENCE`)
- **CTW-IP-040:** High-Fit / Low-Proof Detection (`fitScore >= 0.85` & `proofStr < 0.30` -> `NEEDS PROOF`)
- **CTW-IP-076:** Protected-Attribute Leakage Detection (`sanitizeProtectedSignals`)
- **CTW-IP-078:** Bias-Safe Evaluation Guardrails (Demographic stripping + human authority)
- **CTW-IP-080:** Human-in-the-Loop Release Protocol (Authenticated human user attribution required)
- **CTW-IP-093:** Candidate Trust Packet Format (Structured layout in `PacketPage`)
- **CTW-IP-100:** Human-Agent Hiring Decision Protocol (AI recommends, human decides)

### 3. Which pieces only look similar but use simplified/invented logic?
3 specifications currently use simplified linear heuristics or scalar thresholds in `apps/web/lib/evaluations.js`:
- **CTW-IP-011:** Role Fit Distribution Formula (Uses scalar fit score + categorical label instead of full distribution)
- **CTW-IP-012:** Evidence Strength Formula (Uses linear verified claim ratio instead of reliability-weighted strength)
- **CTW-IP-022:** Candidate Uncertainty Formula (Uses linear combination instead of distribution entropy)

### 4. Which existing implementations should be reused rather than rebuilt?
All working release-critical infrastructure should be preserved and reused:
- `scripts/founder_batch_importer.js` (Real PDF/DOCX/CSV batch parser & SHA-256 deduplicator)
- `apps/web/lib/evaluations.js` (Preserved as a facade API for Next.js routes)
- `apps/web/app/api/employer/packets/[extractionId]/action/route.js` (Human decision logger & dry-run email guard)
- `apps/web/app/employer/packet/[extractionId]/page.jsx` (Trust Packet UI & Minimum Missing Proof renderer)
- `scratch/execute_release_candidate_product_smoke.cjs` (Playwright UAT suite)

### 5. Which current implementations conflict with canonical IP?
- **Conflict 1:** `evaluations.js` scalar fit score vs. CTW-IP-011 probability distribution formula.
- **Conflict 2:** `evaluations.js` linear heuristic uncertainty vs. CTW-IP-022/023 distribution entropy formula.
- **Conflict 3:** Static global thresholds in `evaluations.js` vs. CTW-IP-038 role-specific Proof Contract thresholds.

### 6. What is the smallest P0 patch required before controlled pilot?
Refactor `apps/web/lib/evaluations.js` into a clean orchestration facade that imports domain logic from `packages/proof-engine/` and `packages/hiring-genome/`, dynamically loading role thresholds from `hiring_runs.proof_contract`, while maintaining 100% backward API compatibility.

### 7. Which IP should explicitly NOT be implemented yet?
- **P2 Deferred:** CTW-IP-020 (Time Decay), CTW-IP-021 (Independence Formula), CTW-IP-023 (Entropy Math), CTW-IP-075 (Hallucination NLI Guardrail).
- **P3 Excluded:** CTW-IP-035 (Burden Formula), CTW-IP-036 (Confidence Lift), CTW-IP-037 (Lift-to-Effort Ratio), CTW-IP-077 (Proxy Classifier), CTW-IP-088 (Question Ranking).

### 8. Does evaluations.js remain, become a facade, get replaced, or get removed?
**BECOMES A FACADE (Option A).** `apps/web/lib/evaluations.js` is retained as a lightweight facade API for Next.js routes, delegating domain logic to `packages/proof-engine` and `packages/hiring-genome`.

### 9. Are any current RC outputs relying on unsourced thresholds or coefficients?
Yes. 11 provisional constants (e.g. `fitScore >= 0.85`, `proofStr >= 0.50`, linear uncertainty weights `0.50` & `0.35`, contradiction penalty `0.35`) are documented as **`UNSOURCED IMPLEMENTATION HEURISTICS`** for v1.0 and require outcome calibration post-pilot.

### 10. Is the current RC decision path: GREEN / AMBER / RED?
**`AMBER — BOUNDED RECONCILIATION PATCH REQUIRED`**.

---

## Proprietary IP in Git History Governance Note

> [!IMPORTANT]
> **PROPRIETARY IP IN GIT HISTORY FLAG:** All 100 specifications are vendored locally under `docs/private/ip-specs/` within `careertwin-monorepo`. Before any remote Git repository is attached or push authorized, explicit Founder review is required to address repository privacy / Git history governance. Zero remote pushes have occurred.

---

## Proposed P0 Implementation Plan (For Next Phase Founder Approval)

### Proposed Code Modifications

| File / Module | Current Owner | Target Canonical Owner | CTW-IP Spec(s) Implemented | Reason / Minimal Change | Test / Verification Path | Pilot Acceptance Condition |
|---|---|---|---|---|---|---|
| `packages/proof-engine/src/evaluations.ts` | [NEW] | `packages/proof-engine` | **CTW-IP-011**, **CTW-IP-012**, **CTW-IP-022**, **CTW-IP-038**, **CTW-IP-039**, **CTW-IP-040** | Create canonical TypeScript evaluation module for fit, proof strength, uncertainty, and readiness classification. | Vitest unit test suite (`evaluations.test.ts`) | Exports typed metrics & evidence state vocabulary without error. |
| `packages/proof-engine/src/claimGraph.ts` | [NEW] | `packages/proof-engine` | **CTW-IP-009**, **CTW-IP-010**, **CTW-IP-015**, **CTW-IP-016**, **CTW-IP-018**, **CTW-IP-074** | Create canonical claim-to-proof graph verification module validating source offsets & excerpt hashes. | Vitest unit test suite (`claimGraph.test.ts`) | Verifies claim text alignment & provenance offsets correctly. |
| `packages/proof-engine/src/blockers.ts` | [NEW] | `packages/proof-engine` | **CTW-IP-013**, **CTW-IP-024**, **CTW-IP-031**, **CTW-IP-032**, **CTW-IP-033**, **CTW-IP-034**, **CTW-IP-086**, **CTW-IP-087** | Create canonical decision blocker & Minimum Sufficient Proof optimizer module. | Vitest unit test suite (`blockers.test.ts`) | Generates minimum next proof items & scenario probes for missing proof. |
| `packages/hiring-genome/src/biasGuardrails.ts` | [NEW] | `packages/hiring-genome` | **CTW-IP-076**, **CTW-IP-078** | Create canonical bias-safe guardrail module for demographic signal stripping. | Vitest unit test suite (`biasGuardrails.test.ts`) | Deletes age, gender, race, postal_code, photo_url cleanly. |
| `apps/web/lib/evaluations.js` | `apps/web/lib` | `apps/web/lib` (Facade) | All above specs | Refactor into lightweight adapter delegating domain logic to `packages/proof-engine` and `packages/hiring-genome`. | Golden RC suite & Playwright UAT | 100% backward compatible API signature; zero breaking changes. |

### Existing Implementations Reused Unchanged
- `scripts/founder_batch_importer.js`
- `apps/web/app/api/employer/packets/[extractionId]/action/route.js`
- `apps/web/app/employer/packet/[extractionId]/page.jsx`
- `scratch/execute_release_candidate_product_smoke.cjs`
- `scratch/test_real_candidate_ingestion.js`

---

## Unresolved Founder Decisions & Credentials Status

1. **Git Remote & History Privacy Governance:** Flagged for explicit Founder review before any `git push` is authorized.
2. **Credentials Status:** **Zero credentials required.** All operations execute against local build tools and authorized hosted staging (`headwayos-secondary`).

**STOPPING FOR FOUNDER REVIEW.** No runtime implementation, no DB migrations, no production deployment, no remote push, no new credentials requested.
