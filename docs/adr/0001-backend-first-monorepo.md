# ADR 0001: Backend-first platform monorepo

- Status: Accepted
- Date: 2026-07-12

## Context

CareerTWiN already has frontend and marketing work in progress. Rebuilding that surface would create duplicate effort and unstable coupling before the evidence contracts are proven.

## Decision

Create a separate platform monorepo containing the API, asynchronous workers, domain contracts, ontology, scoring, migrations, evaluations and infrastructure. Do not add a product frontend to this repository.

The existing frontend integrates only through versioned OpenAPI and server-sent event contracts.

## Consequences

- Backend behavior can be tested without UI dependencies.
- Contract changes become explicit and reviewable.
- The existing frontend remains untouched.
- A generated TypeScript client should be published once the API stabilizes.

