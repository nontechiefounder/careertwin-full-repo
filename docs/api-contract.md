# API contract notes

The existing frontend should treat the generated OpenAPI specification as authoritative.

## Workflow behavior

- Creating a run returns `202 Accepted` and advances it to `role_review`.
- Role approval advances extraction, linking, scoring and packet generation to `human_review`.
- Release is legal only from `human_review`.
- Every response includes a monotonic workflow `version`; later write endpoints should require `If-Match` or an explicit expected version.

## Future endpoints already reserved in the architecture

- `POST /v1/roles/{role_id}/candidates:bulk`
- `POST /v1/documents/{document_id}/upload-complete`
- `GET /v1/runs/{run_id}/events`
- `GET /v1/roles/{role_id}/shortlist`
- `GET /v1/candidates/{candidate_id}/trust-packet`
- `POST /v1/matches/{match_id}/override`
- `DELETE /v1/candidates/{candidate_id}`

Do not expose model prompts or unrestricted graph queries through the public API.

