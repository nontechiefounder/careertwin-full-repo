# CareerTWiN MVP threat model

## Protected assets

- Candidate documents and extracted personal data.
- Role requirements, scoring rubrics and reviewer decisions.
- Tenant boundaries and audit history.
- Model credentials and object-store credentials.
- Released Trust Packets and their supporting evidence.

## Primary trust boundaries

1. Browser to API.
2. API to object storage and database.
3. Worker to quarantined documents.
4. Worker to model endpoint.
5. Reviewer approval to released output.

## Required controls

- Treat every uploaded document as hostile input.
- Validate MIME type and magic bytes, enforce size/page limits and quarantine before parsing.
- Strip active content; parse in a sandboxed worker with no outbound network access.
- Never place credentials, unrestricted tools or cross-tenant records in model context.
- Delimit document text and instruct the model that embedded instructions are data.
- Validate every model output against a strict schema and evidence-reference requirement.
- Apply PostgreSQL row-level security to all tenant records and test cross-tenant identifiers.
- Require human approval for requirements and packet release.
- Log record identifiers and hashes, not raw resumes, prompts or completions.
- Make audit events append-only and released packet versions immutable.
- Bound tokens, file count, concurrency, retries and total processing time per organization.

## Responsible-hiring constraints

- CareerTWiN supports interview prioritization; it does not make the final hiring decision.
- Requirements must be job-related and approved by a human.
- Protected traits and documented proxies cannot contribute to scoring.
- Risk flags mean “verify this evidence,” not “reject this candidate.”
- Every dimension must expose evidence, reason codes, confidence and the rubric version.
- Reviewer overrides require a recorded reason and remain auditable.

