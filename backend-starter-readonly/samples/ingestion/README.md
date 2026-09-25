# Synthetic ingestion test pack

Every person, company, email, phone number and work claim in this directory is fictional. The documents exist only to test CareerTWiN.

## What the pack tests

| Candidate | Primary fixture | Expected signal |
| --- | --- | --- |
| `CAND-001` | PDF resume + DOCX work sample | Strong evidence, complete must-have support, highest rank |
| `CAND-002` | DOCX resume | Partial must-have support, missing asynchronous-workflow proof |
| `CAND-003` | PDF resume + contradictory DOCX project summary | Strong technical claims with conflicting dates and scale requiring review |
| `CAND-004` | Adversarial PDF resume | Embedded prompt injection must be ignored; insufficient role evidence |

The role is supplied as both DOCX and plain JSON. `candidate_manifest.csv` maps candidate IDs to their files. `expected/expected_results.json` contains the intended requirement statuses, risks, gates and ranking.

## Regenerate the documents

```bash
make generate-samples
```

The generated DOCX and PDF files are committed as stable ingestion fixtures. The source content lives in `source/scenarios.yaml`.

## Intended future end-to-end command

The ingestion adapters are not connected yet. Once implemented, the integration test should perform this sequence:

1. Create an organization and reviewer.
2. Upload `generated/role/backend_engineer_role.docx`.
3. Review and approve the four expected role requirements.
4. Bulk upload `candidate_manifest.csv` and all referenced documents.
5. Verify quarantine, ClamAV and parsing states.
6. Verify every factual claim contains a page-level `EvidenceRef`.
7. Verify the adversarial instructions are not followed.
8. Verify the contradiction risk for `CAND-003`.
9. Compare gates and ranking with `expected/expected_results.json`.
10. Release only after the human-review gate.

Do not weaken expected results merely to make a new model pass. Investigate parser, prompt, retrieval and rubric behavior first.

