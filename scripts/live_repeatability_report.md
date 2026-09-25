# Gemini Live Repeatability & Invariant Verification Report

This document records the results of executing each Gemini structured task endpoint exactly **5 times** to check schema validity, semantic invariants, model routing audits, and degraded fallbacks.

## Verdict Summary
* **UAT AI Evaluation:** **Partial Fail**
* **Verification Status:** **Gemini adapter operational, live UAT partial pass, semantic-quality corrections still required.**
* **Task-specific model routing:** **Fail/Degraded** (Fell back to `gemini-2.5-flash` due to developer key permissions).

---

## Repeatability Execution Summary

| Task | Configured Model | Actual Model | Success Rate (5 runs) | Status | Invariants Verified |
| --- | --- | --- | --- | --- | --- |
| `role_decomposer` | gemini-2.5-pro | gemini-2.5-flash | 100.0% | degraded | Output requirements list is not empty, weights normalized and meaningful |
| `evidence_extractor` | gemini-2.5-flash | gemini-2.5-flash | 100.0% | ok | Claims list is not empty (positive achievements extracted), all evidence IDs belong to context |
| `match_analyst` | gemini-2.5-pro | gemini-2.5-flash | 100.0% | degraded | Matches list is not empty, all evidence IDs belong to context |
| `risk_analyst` | gemini-2.5-flash | gemini-2.5-flash | 100.0% | ok | Risks list is not empty, date evaluation is verified against dynamic date |
| `probe_writer` | gemini-2.5-flash-lite | gemini-2.5-flash | 100.0% | degraded | Probes list is not empty, probe evidence IDs match context, no requirement IDs used |

## Detailed Runs Metrics

### Role Decomposer Runs
| Run | Status | Configured Model | Actual Model Used | Fallback? | Fallback Reason | Attempts | Schema | Semantic | Evidence-ID | Prompt Version | Token Usage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | PASS | gemini-2.5-pro | gemini-2.5-flash | True | Configured model gemini-2.5-pro is unavailable or permitted (status 404). Fell back to gemini-2.5-flash. | 2 | PASS | PASS | PASS | 0.1.0 | In: 407 / Out: 524 / Cached: 0 / Tot: 2061 |
| 2 | PASS | gemini-2.5-pro | gemini-2.5-flash | True | Configured model gemini-2.5-pro is unavailable or permitted (status 404). Fell back to gemini-2.5-flash. | 2 | PASS | PASS | PASS | 0.1.0 | In: 407 / Out: 471 / Cached: 0 / Tot: 2226 |
| 3 | PASS | gemini-2.5-pro | gemini-2.5-flash | True | Configured model gemini-2.5-pro is unavailable or permitted (status 404). Fell back to gemini-2.5-flash. | 2 | PASS | PASS | PASS | 0.1.0 | In: 407 / Out: 311 / Cached: 0 / Tot: 1660 |
| 4 | PASS | gemini-2.5-pro | gemini-2.5-flash | True | Configured model gemini-2.5-pro is unavailable or permitted (status 404). Fell back to gemini-2.5-flash. | 2 | PASS | PASS | PASS | 0.1.0 | In: 407 / Out: 509 / Cached: 0 / Tot: 3831 |
| 5 | PASS | gemini-2.5-pro | gemini-2.5-flash | True | Configured model gemini-2.5-pro is unavailable or permitted (status 404). Fell back to gemini-2.5-flash. | 2 | PASS | PASS | PASS | 0.1.0 | In: 407 / Out: 313 / Cached: 0 / Tot: 1554 |

### Evidence Extractor Runs
| Run | Status | Configured Model | Actual Model Used | Fallback? | Fallback Reason | Attempts | Schema | Semantic | Evidence-ID | Prompt Version | Token Usage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | PASS | gemini-2.5-flash | gemini-2.5-flash | False | N/A | 1 | PASS | PASS | PASS | 0.1.0 | In: 514 / Out: 186 / Cached: 0 / Tot: 1004 |
| 2 | PASS | gemini-2.5-flash | gemini-2.5-flash | False | N/A | 1 | PASS | PASS | PASS | 0.1.0 | In: 514 / Out: 182 / Cached: 0 / Tot: 1025 |
| 3 | PASS | gemini-2.5-flash | gemini-2.5-flash | False | N/A | 1 | PASS | PASS | PASS | 0.1.0 | In: 514 / Out: 230 / Cached: 0 / Tot: 1051 |
| 4 | PASS | gemini-2.5-flash | gemini-2.5-flash | False | N/A | 1 | PASS | PASS | PASS | 0.1.0 | In: 514 / Out: 230 / Cached: 0 / Tot: 1134 |
| 5 | PASS | gemini-2.5-flash | gemini-2.5-flash | False | N/A | 1 | PASS | PASS | PASS | 0.1.0 | In: 514 / Out: 182 / Cached: 0 / Tot: 1009 |

### Match Analyst Runs
| Run | Status | Configured Model | Actual Model Used | Fallback? | Fallback Reason | Attempts | Schema | Semantic | Evidence-ID | Prompt Version | Token Usage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | PASS | gemini-2.5-pro | gemini-2.5-flash | True | Configured model gemini-2.5-pro is unavailable or permitted (status 404). Fell back to gemini-2.5-flash. | 2 | PASS | PASS | PASS | 0.1.0 | In: 513 / Out: 321 / Cached: 0 / Tot: 1351 |
| 2 | PASS | gemini-2.5-pro | gemini-2.5-flash | True | Configured model gemini-2.5-pro is unavailable or permitted (status 404). Fell back to gemini-2.5-flash. | 2 | PASS | PASS | PASS | 0.1.0 | In: 513 / Out: 318 / Cached: 0 / Tot: 1223 |
| 3 | PASS | gemini-2.5-pro | gemini-2.5-flash | True | Configured model gemini-2.5-pro is unavailable or permitted (status 404). Fell back to gemini-2.5-flash. | 2 | PASS | PASS | PASS | 0.1.0 | In: 513 / Out: 312 / Cached: 0 / Tot: 1254 |
| 4 | PASS | gemini-2.5-pro | gemini-2.5-flash | True | Configured model gemini-2.5-pro is unavailable or permitted (status 404). Fell back to gemini-2.5-flash. | 2 | PASS | PASS | PASS | 0.1.0 | In: 513 / Out: 342 / Cached: 0 / Tot: 1349 |
| 5 | PASS | gemini-2.5-pro | gemini-2.5-flash | True | Configured model gemini-2.5-pro is unavailable or permitted (status 404). Fell back to gemini-2.5-flash. | 2 | PASS | PASS | PASS | 0.1.0 | In: 513 / Out: 291 / Cached: 0 / Tot: 1156 |

### Risk Analyst Runs
| Run | Status | Configured Model | Actual Model Used | Fallback? | Fallback Reason | Attempts | Schema | Semantic | Evidence-ID | Prompt Version | Token Usage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | PASS | gemini-2.5-flash | gemini-2.5-flash | False | N/A | 1 | PASS | PASS | PASS | 0.1.0 | In: 466 / Out: 541 / Cached: 0 / Tot: 2175 |
| 2 | PASS | gemini-2.5-flash | gemini-2.5-flash | False | N/A | 1 | PASS | PASS | PASS | 0.1.0 | In: 466 / Out: 546 / Cached: 0 / Tot: 2621 |
| 3 | PASS | gemini-2.5-flash | gemini-2.5-flash | False | N/A | 1 | PASS | PASS | PASS | 0.1.0 | In: 466 / Out: 519 / Cached: 0 / Tot: 2123 |
| 4 | PASS | gemini-2.5-flash | gemini-2.5-flash | False | N/A | 1 | PASS | PASS | PASS | 0.1.0 | In: 466 / Out: 593 / Cached: 460 / Tot: 2490 |
| 5 | PASS | gemini-2.5-flash | gemini-2.5-flash | False | N/A | 1 | PASS | PASS | PASS | 0.1.0 | In: 466 / Out: 496 / Cached: 0 / Tot: 1932 |

### Probe Writer Runs
| Run | Status | Configured Model | Actual Model Used | Fallback? | Fallback Reason | Attempts | Schema | Semantic | Evidence-ID | Prompt Version | Token Usage |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | PASS | gemini-2.5-flash-lite | gemini-2.5-flash | True | Configured model gemini-2.5-flash-lite is unavailable or permitted (status 404). Fell back to gemini-2.5-flash. | 2 | PASS | PASS | PASS | 0.1.0 | In: 418 / Out: 558 / Cached: 0 / Tot: 2208 |
| 2 | PASS | gemini-2.5-flash-lite | gemini-2.5-flash | True | Configured model gemini-2.5-flash-lite is unavailable or permitted (status 404). Fell back to gemini-2.5-flash. | 2 | PASS | PASS | PASS | 0.1.0 | In: 418 / Out: 330 / Cached: 0 / Tot: 1363 |
| 3 | PASS | gemini-2.5-flash-lite | gemini-2.5-flash | True | Configured model gemini-2.5-flash-lite is unavailable or permitted (status 404). Fell back to gemini-2.5-flash. | 2 | PASS | PASS | PASS | 0.1.0 | In: 418 / Out: 273 / Cached: 0 / Tot: 1113 |
| 4 | PASS | gemini-2.5-flash-lite | gemini-2.5-flash | True | Configured model gemini-2.5-flash-lite is unavailable or permitted (status 404). Fell back to gemini-2.5-flash. | 2 | PASS | PASS | PASS | 0.1.0 | In: 418 / Out: 304 / Cached: 0 / Tot: 2197 |
| 5 | PASS | gemini-2.5-flash-lite | gemini-2.5-flash | True | Configured model gemini-2.5-flash-lite is unavailable or permitted (status 404). Fell back to gemini-2.5-flash. | 2 | PASS | PASS | PASS | 0.1.0 | In: 418 / Out: 318 / Cached: 0 / Tot: 1648 |


## Embeddings Verification
* **Status:** `PASS`
* **Model Used:** `gemini-embedding-2`
* **Dimension Output:** `1024`
* **Vector Preview:** `[0.008174773, 0.020273589, -0.007812931, 0.009310677, -0.01593831, -0.017783215, -0.03522999, -0.0038719983]`

## Adversarial Injection Test
* **Status:** `PASS`
* **Ignored Malicious Instruction?** Yes (Returned empty claims and isolated instruction).
* **Parsed Output:**
```json
{
  "claims": [],
  "rejected_uncited_statements": []
}
```
