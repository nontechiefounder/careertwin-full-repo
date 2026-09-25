# Conflict Register & Facade Architecture Mapping (RC-C1.1 REVISED)

**Date:** 2026-08-13  
**Target Architecture:** Facade pattern mapping `apps/web/lib/evaluations.js` to canonical domain packages in `packages/proof-engine/`, `packages/hiring-genome/`, and `packages/shared-contracts/`.

---

## 1. Conflict & Duplicate Register

| Register ID | Module / File | Conflict / Duplicate Description | CTW-IP Specs | Severity | Recommended Canonical Resolution Path |
|---|---|---|---|---|---|
| **CDR-001** | `apps/web/lib/evaluations.js` | Scalar fit score (0.0–1.0) vs. categorical probability distribution | **CTW-IP-011** | Medium | Retain `evaluations.js` as Next.js facade; delegate scoring math to `packages/proof-engine`. |
| **CDR-002** | `apps/web/lib/evaluations.js` | Linear heuristic uncertainty formula vs. mathematical distribution entropy | **CTW-IP-022**, **CTW-IP-023** | Medium | Document linear formula as bounded pilot heuristic v1.0 in `packages/proof-engine`. |
| **CDR-003** | `apps/web/lib/evaluations.js` | Static global decision readiness thresholds vs. Proof Contract thresholds | **CTW-IP-038** | Low | Pass role-specific thresholds from `hiring_runs.proof_contract` into `packages/proof-engine`. |
| **CDR-004** | `apps/web/lib/evaluations.js` | Basic keyword substring text matching (`w.length > 3`) vs. semantic anchor distribution | **CTW-IP-009**, **CTW-IP-079** | Low | Enhance `claimGraph.ts` in `packages/proof-engine` to match structured claim text & provenance offsets. |
| **CDR-005** | `scripts/founder_batch_importer.js` | Local CLI ingestion script vs. API ingestion endpoints | **CTW-IP-010** | None | Fully aligned. Founder CLI acts as internal batch runner for pilot candidate inputs. |

---

## 2. Revised `evaluations.js` Facade Mapping

`apps/web/lib/evaluations.js` will act strictly as an adapter/facade for the Next.js application layer. It will not contain independent scoring logic. Each function is mapped to its canonical domain owner package:

```
[Next.js API Routes & Pages] (apps/web/app/)
               │
               ▼
┌─────────────────────────────────────────────────────────┐
│ apps/web/lib/evaluations.js (Orchestration Facade)    │
└──────────────────────────┬──────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
┌─────────────────┐ ┌───────────────┐ ┌───────────────────┐
│ packages/       │ │ packages/     │ │ packages/         │
│ proof-engine/   │ │ hiring-genome/│ │ shared-contracts/ │
└─────────────────┘ └───────────────┘ └───────────────────┘
```

### Detailed Function-to-Package Mapping

| Facade Function / Export | Current Location | Target Canonical Owner Module | CTW-IP Spec(s) Implemented | Minimal Facade Responsibility |
|---|---|---|---|---|
| `calculateDecoupledMetrics()` | `apps/web/lib/evaluations.js` | `packages/proof-engine/src/evaluations.ts` | **CTW-IP-011**, **CTW-IP-012**, **CTW-IP-022**, **CTW-IP-038**, **CTW-IP-039**, **CTW-IP-040** | Accepts parameters, invokes `proof-engine` domain metrics calculator, formats output for Next.js UI. |
| `classifyClaimEvidence()` | `apps/web/lib/evaluations.js` | `packages/proof-engine/src/claimGraph.ts` | **CTW-IP-009**, **CTW-IP-010**, **CTW-IP-015**, **CTW-IP-016**, **CTW-IP-018**, **CTW-IP-074**, **CTW-IP-075** | Delegates claim-to-evidence graph verification, provenance offset check, & contradiction flagging to `claimGraph`. |
| `generateMinimumMissingProof()` | `apps/web/lib/evaluations.js` | `packages/proof-engine/src/blockers.ts` | **CTW-IP-013**, **CTW-IP-024**, **CTW-IP-031**, **CTW-IP-032**, **CTW-IP-033**, **CTW-IP-034**, **CTW-IP-086**, **CTW-IP-087** | Delegates requirement gap analysis & interview probe compilation to `blockers.ts`. |
| `sanitizeProtectedSignals()` | `apps/web/lib/evaluations.js` | `packages/hiring-genome/src/biasGuardrails.ts` | **CTW-IP-076**, **CTW-IP-078** | Delegates demographic attribute stripping to `hiring-genome` bias guardrail module. |
| `EvaluationOutputSchema` | `apps/web/lib/evaluations.js` | `packages/shared-contracts/src/schemas.ts` | **CTW-IP-093** | Re-exports canonical Zod schema definition from `shared-contracts`. |

---

## 3. Preservation Guarantees

1. **100% Backward API Compatibility:** Next.js pages (`/employer/packet/[extractionId]`) and test suites (`GoldenReleaseCandidateEvaluations.test.js`, Playwright UAT) import from `@/lib/evaluations` without any breaking signature changes.
2. **Zero Duplicate Scoring Systems:** Domain logic resides strictly inside `packages/proof-engine` and `packages/hiring-genome`.
