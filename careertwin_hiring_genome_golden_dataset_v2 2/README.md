# CareerTWiN Hiring Genome Golden Dataset v2

**Version:** 2.0.0, quality revision 1  
**Generation timestamp:** `2026-07-26T00:00:00Z`  
**Classification:** Fully synthetic evaluation data  
**Decision boundary:** Human-led hiring decision support

This deterministic benchmark extends the CareerTWiN v1 fixture without changing its IDs or gold labels. It tests whether a recruiting intelligence system can compile governed company hiring memory, create role-specific proof contracts, evaluate atomic claims against attributable evidence, identify the smallest decision-changing proof request, process new proof, and learn conservatively from approved outcomes.

The benchmark deliberately keeps role fit, proof strength, uncertainty, and readiness separate. It is not a résumé-to-job similarity corpus, a universal candidate ranking, or a direct numerical LLM scoring task.

## What v2 adds

- eight company archetypes with distinct, job-relevant hiring contexts;
- 192 historical decisions and 240 vendor-shaped synthetic ATS rows;
- governed Hiring Genome patterns with provenance, stability, approval, and version state;
- proof-submission loops covering resolution, partial lift, failure, contradiction, adjacent evidence, and duplicate evidence;
- repo-style code artifacts with tests, architecture notes, simulated commit history, and ownership boundaries;
- AI interview transcripts with turn-level signal extraction and adaptive follow-ups;
- work trials, noisy inputs, authenticity cases, panel disagreement, and policy fixtures;
- 96 outcome events and 32 explicit outcome-to-memory update decisions;
- fit, proof, and uncertainty distributions using semantic anchors;
- evidence-subset, protected-signal invariance, audit, and human-release tests;
- candidate proof passports, sourcing, outreach, booking, and language-format fixtures;
- a dependency-closed mini benchmark, demo slices, rubrics, judge prompts, schemas, manifest, and validator.

## Preserved v1 assets

V2 retains the 20 roles, 60 candidates, 60 resumes, 40 evidence artifacts, 44 interview notes, 360 atomic claims, 20 proof contracts, 60 decision records, and 30 protected-attribute leakage tests. `migrations/v1_to_v2_corrections.jsonl` is empty because no gold-label correction was required. The source archive's untracked operating-system metadata is intentionally excluded.

## Directory guide

| Area | Purpose |
|---|---|
| `golden_company_memory/` | Human-readable hiring bars, approved patterns, rejection caveats, interviewer observations, and role history |
| `golden_ats_exports/` | Four synthetic ATS-shaped inputs containing inconsistent stages, free text, missing values, and duplicates |
| `golden_proof_submissions/` | Candidate responses to bounded missing-proof requests |
| `golden_code_artifacts/` | Small inspectable repositories with source, tests, architecture, commit simulation, and ownership notes |
| `golden_ai_interviews/` | Turn-addressable assessment transcripts |
| `golden_work_trials/` | Ten tasks, rubrics, and thirty candidate submissions |
| `expected_*.jsonl` | Gold structured outputs for each CareerTWiN workflow |
| `mini_benchmark/` | Fast dependency-closed regression subset |
| `demo_slices/` | Curated company, proof-loop, safety, work-trial, and outreach narratives |
| `rubrics/` and `eval_prompts/` | Human-review anchors and model-judge templates |
| `schemas/` | Draft 2020-12 schemas for structured v2 records |
| `tools/validate_v2_dataset.py` | Standard-library integrity validator |

## Gold-label semantics

`verified` means a claim has an attributable source inside this synthetic fixture. It does not mean a real identity, credential, employer, or repository was externally verified. `inferred` is plausible but not established. `unsupported` lacks accepted evidence. `contradicted` conflicts with a more specific source.

`interview_ready` means the supplied evidence crosses the role- and company-specific pre-interview bar. `near_fit_needs_proof` identifies one bounded uncertainty worth resolving. `adjacent_role_fit` preserves credible proof that belongs to another role context. `not_recommended` means the current target-role gaps cannot be resolved by one proportionate request. None of these states is a final hiring decision.

## Recommended evaluation workflow

1. Validate the archive before indexing.
2. Run role and company-memory compilation with deterministic model settings.
3. Extract resume-only claims, then run cross-source linking.
4. Evaluate candidate-role-company records with text-first reasoning.
5. Compare fit, proof, uncertainty, blocker, request, and readiness independently.
6. Run proof loops twice: before and after the submitted artifact.
7. Withhold the evidence named by every evidence-subset case and assert causal degradation.
8. Run safety fixtures in an isolated index and assert invariant job-relevant outputs.
9. Require human review and release blocking on the specified cases.
10. Record prompt, model, retrieval, dataset hash, latency, and token cost for each run.

## Use

Run:

```bash
python tools/validate_v2_dataset.py
```

Compare system outputs by stable IDs and source references rather than array order. Treat protected-signal fixtures as isolated safety tests; never place them in normal retrieval or company memory.

## Primary metrics

Report claim precision/recall, evidence-status macro-F1, proof-contract dimension coverage, blocker accuracy, minimum-proof usefulness, evidence hallucination rate, fit/proof separation, company-specific calibration, distribution Brier score, protected-signal leakage, safety-pair invariance, human-review recall, retrieval relevance, recommendation consistency, and schema validity.

Release gates should include zero hallucinated verified evidence, zero prohibited-signal use, zero safety-pair decision drift, complete provenance for verified claims, and 100% required human-review recall.

## Decision boundary

CareerTWiN provides evidence-grounded decision support. It does not make autonomous final hiring, rejection, or offer decisions.

## Limitations

The data is synthetic, code repositories are intentionally compact, outcomes are simulated, multilingual fixtures focus on robustness rather than linguistic completeness, and business-impact records are scenarios rather than forecasts. Users must validate any production selection procedure in its operating context.
