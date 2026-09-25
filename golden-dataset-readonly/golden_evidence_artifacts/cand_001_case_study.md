# Synthetic Evidence Artifact

**Candidate ID:** cand_001  
**Target role:** Senior Backend Engineer  
**Artifact type:** Role-relevant case study  
**Synthetic-only:** Yes

## Claim Under Evaluation

Owned decomposition of a purchase-order monolith into three FastAPI services; reduced p95 latency from 780 ms to 240 ms at 1.8M monthly requests.

## Context and Constraint

The team needed a measurable improvement in the work governed by backend ownership while preserving existing service, customer, and release commitments. The candidate was accountable for the bounded initiative described below; broader team results are not attributed automatically.

## Attributable Candidate Actions

- Owned decomposition of a purchase-order monolith into three FastAPI services; reduced p95 latency from 780 ms to 240 ms at 1.8M monthly requests.
- Redesigned PostgreSQL locking and idempotency for approval writes, cutting duplicate transactions by 91%.
- Recorded alternatives, the rejected option, validation method, rollback condition, and the scope owned by collaborators.

## Validation and Operating Result

- Led a production incident review and added Redis-backed rate controls, dashboards, and rollback checks.
- The stated metric is defined in the resume and evaluated only within this synthetic fixture.
- Evidence strength does not extend beyond the decisions and outcomes explicitly named here.

## Scope Boundary

This artifact supports the named implementation, ownership, and communication claims. It does not verify identity, employer history, credentials, or the broad claim that the candidate can lead any comparable initiative.

## Audit Fields

- Evidence status supported: `verified`
- Evidence source class: `synthetic_case_study`
- Highest relevance dimensions: `backend_ownership`, `database_design`
- Generation label: `careertwin-hiring-genome-golden-2026-07-17`
