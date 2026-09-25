# ADR 0002: PostgreSQL is the MVP evidence graph

- Status: Accepted
- Date: 2026-07-12

## Decision

Represent claims, evidence and relationships using relational tables and explicit edge records in PostgreSQL. Use pgvector for semantic retrieval. Do not deploy Neo4j or Apache AGE in the MVP.

## Rationale

- One transactional source of truth.
- Tenant isolation and audit changes share one security model.
- Scoring queries combine relational filters, evidence provenance and vector similarity.
- Backups and migrations stay simple for the first pilots.

## Reconsider when

- Production queries regularly require traversals deeper than two or three edges.
- A representative million-edge benchmark misses the agreed latency target.
- Graph algorithms become a customer-facing feature rather than an internal implementation detail.

