---
spec_id: CTW-IP-033
title: "Minimum Sufficient Proof Protocol"
category: "Decision Blockers, Minimum Proof and Shortlisting"
priority: "Pilot / near-term"
status: "Design specification"
version: "1.0"
---

# 033. Minimum Sufficient Proof Protocol

## 1. Purpose

Selects the smallest additional evidence request likely to move a candidate above an interview-readiness threshold.

## 2. Why CareerTWiN Needs It

This capability supports CareerTWiN's move from a generic AI hiring interface toward a company-specific **Hiring Genome OS**. It must improve a real pre-interview decision, remain explainable to recruiters and hiring managers, and preserve human authority over the final hiring decision.

## 3. Product Role

- **Primary role:** Selects the smallest additional evidence request likely to move a candidate above an interview-readiness threshold.
- **Customer-visible value:** Converts scattered hiring context or candidate evidence into a clearer, faster and more accountable next action.
- **System boundary:** This component may recommend, structure or measure. It must not make an unreviewable final hiring decision.
- **Required traceability:** Every material output must reference its input version, rubric version, model version where applicable, and evidence provenance.

## 4. Inputs

- Candidate fit distributions and proof states
- Unresolved evidence gaps and contradictions
- Role-specific interview-readiness rules
- Approved proof routes and candidate burden estimates

## 5. Outputs

- Primary and secondary decision blockers
- Recommended proof or interview action
- Updated interview-readiness state
- Auditable shortlist or packet changes

## 6. Formal Logic or Formula

```text
Choose route r*=argmax_r[(ExpectedConfidenceLift_r×DecisionImpact_r×Reliability_r)/(CandidateBurden_r+Cost_r)], subject to fairness and threshold constraints.
```

### Interpretation

The formula is a starting specification, not a validated scientific truth. The product team must:
1. define every variable and its permitted range,
2. record the formula version,
3. test sensitivity to each coefficient,
4. prevent hidden use of protected features,
5. calibrate thresholds against human-reviewed fixtures and real pilot outcomes.

## 7. Processing Workflow

Generate one focused request, let candidates choose among equivalent routes, re-evaluate after submission and preserve before/after state.

A compliant implementation should follow this sequence:

1. Validate tenant, actor and workflow state.
2. Load only approved, role-relevant inputs.
3. Execute deterministic preprocessing and provenance checks.
4. Run any AI-assisted extraction or reasoning through typed schemas.
5. Apply the formal logic using versioned code.
6. Generate an explainable draft output.
7. Require human approval wherever the output affects candidate progression or external release.
8. Persist immutable source links, model metadata, result version and audit events.

## 8. Suggested Data Contract

At minimum, persist:

- `spec_version`
- `organization_id`
- `role_id`
- `candidate_id` where applicable
- `input_artifact_ids`
- `evidence_ids`
- `rubric_or_genome_version`
- `model_run_id` where applicable
- `calculated_values`
- `human_review_status`
- `created_at`
- `supersedes_version_id`
- `audit_event_id`

No calculated result should exist without enough metadata to reproduce or explain it.

## 9. API and UI Integration

### API expectations

- Accept typed, tenant-scoped identifiers rather than raw untrusted documents in internal calls.
- Return the formula or rule version with each result.
- Return a structured explanation and evidence references.
- Distinguish `draft`, `approved`, `degraded`, `failed` and `superseded` states.
- Never expose secrets, raw prompts or cross-tenant context.

### UI expectations

- Show the result and the reason separately.
- Show uncertainty, missing data and degraded states visibly.
- Link material claims to the exact evidence source.
- Provide reviewer override or approval where appropriate.
- Avoid labels that imply certainty beyond the available evidence.

## 10. Edge Cases and Failure Modes

- Insufficient company history or candidate evidence
- Conflicting evidence from sources with different reliability
- Duplicate or highly correlated artifacts
- Stale information that may no longer be role-relevant
- Model output that is schema-valid but semantically poor
- Candidate evidence that cannot be lawfully or technically verified
- Human feedback that is vague, inconsistent or potentially biased
- Cross-role transfer that overgeneralizes a pattern
- A calculated score that conflicts with a deterministic gate
- Provider fallback or retry that changes output quality

The safe default is to lower confidence, request clarification or require human review. The system should not silently fill gaps.

## 11. Responsible AI and Hiring Constraints

- Do not use or infer protected attributes.
- Do not use similarity to past employees as a candidate-quality signal.
- Do not convert uncertainty into rejection advice.
- Do not mark a claim as verified without qualifying evidence.
- Keep fit, proof strength, uncertainty and human decision separate.
- Require job relevance for every requirement, pattern, proof request and decision reason.
- Preserve a candidate's ability to provide alternative acceptable proof routes.
- Maintain a human-in-the-loop release boundary.

## 12. Evaluation and Test Plan

- Unit tests for the core minimum sufficient proof protocol rules and boundary conditions
- Golden-fixture tests using synthetic roles, candidates, evidence and outcomes
- Repeatability tests across multiple model runs where AI is involved
- Negative tests for unsupported evidence, tenant leakage and protected-feature use
- Human review acceptance test with traceable before/after artifacts

### Minimum acceptance criteria

- Deterministic tests pass for known fixtures.
- Repeated runs remain within agreed semantic-stability limits.
- Unsupported evidence IDs fail validation.
- Protected-feature leakage tests remain green.
- Reviewers can understand the output and next action without reading raw model prompts.
- The result can be reproduced from stored inputs, versions and code.

## 13. Product Metrics

Track:

- output acceptance by reviewers,
- override frequency and reason,
- time to understand the result,
- rate of missing-evidence resolution,
- downstream shortlist acceptance,
- technical-screen outcome where applicable,
- repeatability across runs,
- error and degraded-output rate.

## 14. IP and Defensibility

Primary patent candidate for CareerTWiN. Exact optimizer and thresholds should remain trade secrets.

### Recommended protection mix

- **Patent review:** Consider only when the implementation is concrete, novel and tied to a practical technical workflow.
- **Trade secret:** Keep coefficients, prompts, thresholds, calibration sets and ranking heuristics private.
- **Copyright:** Protect source code, schemas, documentation, report layouts and curated templates.
- **Trademark:** Reserve distinctive customer-facing names only after brand and legal review.
- **Data moat:** Preserve lawful, consented, de-identified outcome and proof-resolution datasets.

## 15. Priority and Dependencies

- **Priority:** Pilot / near-term
- **Dependencies:**
  - Approved Role Intelligence and Proof Contract
  - EvidenceRef provenance model
  - Semantic evaluation outputs
  - Candidate Trust Packet revisions

## 16. Definition of Done

This specification is complete only when:

1. the typed domain contract exists,
2. the logic is versioned and covered by tests,
3. provenance is persisted,
4. tenant isolation is verified,
5. UI and API expose uncertainty honestly,
6. a human review path exists,
7. pilot metrics are captured,
8. documentation matches the running code,
9. the feature works in an end-to-end workflow rather than only in a unit test,
10. no external claim is made beyond the available evidence.
