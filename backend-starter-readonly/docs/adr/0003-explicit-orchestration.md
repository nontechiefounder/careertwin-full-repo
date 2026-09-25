# ADR 0003: Explicit orchestration before an agent framework

- Status: Accepted
- Date: 2026-07-12

## Decision

Use a persisted stage state machine with Celery as the execution substrate. Each AI capability is a typed stage with bounded input, schema-validated output and no ambient tools.

LangGraph, Google ADK and Temporal are not runtime dependencies in the first MVP.

## Reconsider when

- The workflow grows beyond roughly fifteen meaningful nodes.
- Several branches must pause and resume around human decisions.
- Runs routinely span days and recovery guarantees become part of the customer SLA.
- Celery retries and database checkpoints no longer provide understandable recovery behavior.

