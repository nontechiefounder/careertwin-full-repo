# CareerTWiN Hiring Genome Benchmark v2 — Data Card

## Summary

This benchmark is a deterministic, fully synthetic test asset for proof-based recruiting intelligence. It covers company-memory ingestion, role intelligence, claim-to-proof linking, semantic evidence distributions, decision blockers, minimum sufficient proof, assessment loops, governed outcome learning, candidate trust packets, and human-agent decision protocols.

## Intended uses

- regression testing for CareerTWiN-style workflows;
- prompt, model, retrieval, and orchestration comparison;
- source-grounding and hallucination evaluation;
- proof-request and interview-follow-up quality assessment;
- company-specific calibration testing;
- protected-signal invariance and governance testing;
- customer demonstrations using curated slices;
- cost and latency planning through per-task token fields.

## Out-of-scope uses

- real-world autonomous hiring, rejection, ranking, or offer decisions;
- demographic, personality, health, disability, family, political, nationality, image, name-origin, or accent inference;
- universal employability scoring;
- validating identity, credentials, employment, authorship, or legal compliance;
- training a system to reproduce historical human rejection patterns without approval and bias review.

## Composition

The package preserves v1 and adds eight fictional companies, company memory, 192 historical decisions, four ATS-shaped exports with 240 normalized rows, 24 proof loops, 12 code artifacts, 24 AI interviews, 96 outcomes, 32 memory-update decisions, 40 safety-invariance pairs, 30 evidence-subset cases, 30 human-review cases, work trials, candidate-facing records, robustness fixtures, baselines, and marketplace simulations.

Phase-specific assets are indexed by deterministic identifiers. Every new structured record contains schema version, record ID, synthetic flag, source references, fixed timestamp, and difficulty metadata. Relevant records also name an intended failure mode and model-cost envelope.

## Data generation and provenance

The benchmark was generated from the synthetic CareerTWiN v1 fixture, the v2 build specification, and the 100 CareerTWiN technical, mathematical, and logical IP specifications. It does not contain real candidates, employers, résumés, LinkedIn profiles, repositories, private hiring records, or proprietary ATS exports.

Verified gold claims resolve to a fixture path or source reference. Commit histories are simulations and do not prove authorship. Historical outcomes are fictional events designed to test bounded learning, missingness, and confounders.

## Safety partitions

Normal hiring records exclude protected attributes. Protected, proxy, and prohibited signals appear only in `expected_safety_invariance_tests.jsonl`, `golden_policy_cases.jsonl`, the original isolated leakage tests, or explicitly marked interview-policy cases. These fixtures set `include_in_normal_retrieval` to false where applicable and cannot enter Hiring Genome compilation.

Paired invariance cases require identical fit state, proof strength, blocker, minimum proof request, recommended next action, redactions, and policy flags when only a prohibited signal changes.

## Human authority

The benchmark requires human review for protected or policy-sensitive content, material contradiction, low confidence, unresolved/noisy sources, external release of a negative state, accommodation or work-authorization handling, active hiring-bar changes, and must-have/disqualifier overrides. Automated outputs remain decision support.

## Quality controls

The standard-library validator parses JSON, JSONL, and CSV; enforces core fields; checks IDs, counts, source paths, distributions, proof weights, proof-revision chains, safety invariance, packaging exclusions, and SHA-256 manifest integrity. The final ZIP is validated again after extraction.

## Expected failure modes

Fixtures cover unsupported-to-verified promotion, adjacent-fit confusion, ownership overclaim, protected proxies, contradiction, noisy sources, duplicate identity, human override, withheld evidence, and failed proof loops.

## Known limitations

- Synthetic phrasing cannot reproduce every enterprise writing style.
- Compact repositories test reasoning and provenance rather than large-scale code navigation.
- Outcome learning is a controlled simulation, not causal employment research.
- Region and language fixtures test extraction invariance, not cultural interpretation.
- Business-impact values are benchmark scenarios, not customer ROI claims.
- Passing the benchmark does not establish legal compliance or validate an employment selection procedure.

## Maintenance

Freeze gold releases. Record corrections in `migrations/v1_to_v2_corrections.jsonl`, increment benchmark revisions, retain prior manifests, and compare regressions by evaluation slice. New historical patterns must include support, contradiction, job relevance, stability, bias risk, temporal validity, and human approval.
