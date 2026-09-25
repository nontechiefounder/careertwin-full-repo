# Backend execution backlog

## Epic A: Durable tenant foundation

- Implement `PostgresRunStore` with compare-and-set updates.
- Implement role, requirement, candidate and audit repositories.
- Add transaction middleware that sets `app.current_org_id` from verified identity.
- Add admin-provisioned users, Argon2id password hashing and secure session cookies.
- Add RLS integration tests using two organizations and deliberately swapped record IDs.
- Add transactional outbox publishing to Celery.

Exit: the API has no in-memory business state and cross-tenant access fails at both application and database layers.

## Epic B: Secure evidence intake

- Create signed upload intent and completion endpoints.
- Validate file extension, MIME type, magic bytes, size and page limits.
- Store uploads under tenant-scoped quarantine keys.
- Stream files through ClamAV before parsing.
- Deduplicate by tenant + SHA-256 while preserving submission history.
- Implement deletion, retention and legal-hold state transitions.

Exit: a 50-file synthetic batch is scanned, accepted or rejected, stored and auditable.

## Epic C: Document parsing and provenance

- Implement the Docling adapter in a sandboxed worker.
- Normalize PDF and DOCX output into chunks with page, ordinal and layout coordinates.
- Hash every evidence excerpt and record parser version.
- Add OCR fallback only for pages with insufficient extracted text.
- Build parser golden fixtures for normal, scanned, malformed and prompt-injected documents.

Exit: reviewers can open the exact page/source supporting every extracted statement.

## Epic D: Typed evidence pipeline

- Implement the first OpenAI-compatible `ModelClient` adapter.
- Add model allowlists, timeouts, token budgets, schema retry and circuit breaking.
- Wire role decomposition to the role-review gate.
- Wire evidence extraction, normalization, contradiction linking and match analysis.
- Store input/output hashes, model name, prompt version, token usage and latency.
- Reject any supported claim or match without an evidence reference.

Exit: one synthetic role and ten candidates produce reproducible structured matches with no uncited released facts.

## Epic E: Trust Packet service

- Generate deterministic score breakdowns from persisted matches.
- Produce missing-proof requests and evidence-linked interview probes.
- Store immutable packet versions and reviewer overrides.
- Add shortlist and Trust Packet read endpoints.
- Add server-sent workflow events for the existing frontend.
- Export JSON first; add PDF only after the review experience stabilizes.

Exit: a reviewer can complete a 20–50 candidate shortlist audit without database access or engineering assistance.

## Epic F: Pilot hardening

- Instrument traces, metrics and structured logs through OpenTelemetry.
- Add per-tenant concurrency, file, token and processing-time quotas.
- Add backup automation and a documented restore drill.
- Run prompt-injection, malformed-file, cross-tenant and denial-of-wallet tests.
- Measure claim precision, citation exactness, reviewer edit rate, run latency and cost.
- Produce deployment and incident runbooks.

Exit: all release gates are measurable and two isolated pilot organizations can run concurrently.

