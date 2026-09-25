# Formula Dependency Register & Origin Audit (RC-C1.1 REVISED)

**Date:** 2026-08-13  
**Audit Target:** Formula dependencies, constituent mechanisms, and parameter origin audit for private pilot decision path.

---

## 1. Formula Constituent Dependency Register

To avoid claiming canonical implementation of top-level formulas while deferring required constituents, this register explicitly defines the **BOUNDED PILOT IMPLEMENTATION** for each constituent mechanism:

| Constituent Spec ID | Specification Title | Top-Level Dependent Specs | Bounded Pilot Implementation Protocol | Pilot Fallback / Neutral State | Versioning & Audit |
|---|---|---|---|---|---|
| **CTW-IP-014** | Evidence Reliability Weighting | **CTW-IP-012** (Evidence Strength) | Preserve `source_tier` field in typed `EvidenceRef` contract (`code`, `repo`, `document`, `self_claim`). | Default neutral weight `1.0` across all valid document/code evidence sources in pilot. | Versioned in `packages/shared-contracts`. |
| **CTW-IP-015** | Provenance Confidence | **CTW-IP-009**, **CTW-IP-016** | Require `source_offset` (line/page span) and `excerpt_hash` (SHA-256) on verified claims. | Unverified claims without offset/hash fall back to `INFERRED` state. | Verified in `GoldenReleaseCandidateEvaluations.test.js`. |
| **CTW-IP-018** | Contradiction Detection | **CTW-IP-022**, **CTW-IP-027** | Detect conflicting claim spans or overlapping date discrepancies flagged during extraction. | Sets claim status `CONFLICTING` and adds explicit `+0.35` contradiction penalty. | Rendered in Packet Trust Matrix. |
| **CTW-IP-020** | Evidence Freshness Decay | **CTW-IP-012**, **CTW-IP-022** | Preserve `evidence_date` field in typed domain schema. | Time decay multiplier set to neutral `1.0` for pilot inputs; decay math deferred post-pilot. | Documented as pilot limitation v1.0. |
| **CTW-IP-021** | Source Independence | **CTW-IP-022** | Check for duplicate `sha256` byte hashes during ingestion (`founder_batch_importer.js`). | Deduplicates identical byte hashes; single-source redundancy correlation deferred. | Tested in `test_real_candidate_ingestion.js`. |
| **CTW-IP-023** | Distribution Entropy | **CTW-IP-022** | Mathematical entropy $H(p) = -\sum p_k \log p_k$ calculation. | Bounded linear heuristic proxy: $0.35 \times \text{unverifiedRatio}$. | Explicitly labeled `UNSOURCED HEURISTIC v1.0`. |
| **CTW-IP-024** | Missing-Evidence Penalty | **CTW-IP-022**, **CTW-IP-031** | Calculate missing requirement ratio against Proof Contract. | Increases uncertainty and forces `NEEDS PROOF` decision readiness state. | Tested in Golden RC suite. |
| **CTW-IP-025** | Contradiction Penalty | **CTW-IP-022**, **CTW-IP-027** | Apply explicit penalty when evidence sources conflict. | Multiplier `+0.35` added to candidate uncertainty score. | Tested in Golden RC suite. |

---

## 2. Complete Parameter & Threshold Inventory

| # | Parameter / Logic | Current Value / Formula | Code Location | Canonical IP Spec | Source / Origin | Status / Classification | Conflict Status |
|---|---|---|---|---|---|---|---|
| **1** | Role Fit Threshold (Strong) | `fitScore >= 0.85` | `apps/web/lib/evaluations.js:L53` | **CTW-IP-011** | Provisional design threshold | `UNSOURCED IMPLEMENTATION HEURISTIC` | Compatible boundary |
| **2** | Role Fit Threshold (Moderate) | `fitScore >= 0.70` | `apps/web/lib/evaluations.js:L54` | **CTW-IP-011** | Provisional design threshold | `UNSOURCED IMPLEMENTATION HEURISTIC` | Compatible boundary |
| **3** | Role Fit Threshold (Limited) | `fitScore >= 0.50` | `apps/web/lib/evaluations.js:L55` | **CTW-IP-011** | Provisional design threshold | `UNSOURCED IMPLEMENTATION HEURISTIC` | Compatible boundary |
| **4** | Proof Strength Threshold (Strong) | `proofStr >= 0.70` | `apps/web/lib/evaluations.js:L58` | **CTW-IP-012** | Provisional design threshold | `UNSOURCED IMPLEMENTATION HEURISTIC` | Compatible boundary |
| **5** | Proof Strength Threshold (Moderate) | `proofStr >= 0.30` | `apps/web/lib/evaluations.js:L59` | **CTW-IP-012** | Provisional design threshold | `UNSOURCED IMPLEMENTATION HEURISTIC` | Compatible boundary |
| **6** | Proof Strength Threshold (Limited) | `proofStr > 0.0` | `apps/web/lib/evaluations.js:L60` | **CTW-IP-012** | Provisional design threshold | `UNSOURCED IMPLEMENTATION HEURISTIC` | Compatible boundary |
| **7** | Decision Readiness: `NEEDS PROOF` | `fitScore >= 0.85 && proofStr < 0.30` | `apps/web/lib/evaluations.js:L64` | **CTW-IP-040** | Canonical High-Fit / Low-Proof rule | **BOUNDED PILOT IMPLEMENTATION** | Fully aligned |
| **8** | Decision Readiness: `EVIDENCE READY` | `fitScore >= 0.85 && proofStr >= 0.50` | `apps/web/lib/evaluations.js:L66` | **CTW-IP-038** | Provisional readiness threshold | `UNSOURCED IMPLEMENTATION HEURISTIC` | Minor threshold diff |
| **9** | Decision Readiness: `HUMAN REVIEW REQUIRED` | `fitScore >= 0.70 && proofStr >= 0.30` | `apps/web/lib/evaluations.js:L68` | **CTW-IP-039** | Provisional review state boundary | `UNSOURCED IMPLEMENTATION HEURISTIC` | Compatible boundary |
| **10** | Uncertainty Weight (Proof Deficit) | `0.50 * (1.0 - proofStr)` | `apps/web/lib/evaluations.js:L49` | **CTW-IP-022** / **CTW-IP-024** | Provisional heuristic weight | `UNSOURCED IMPLEMENTATION HEURISTIC` | Simplified linear proxy |
| **11** | Uncertainty Weight (Unverified Ratio) | `0.35 * unverifiedRatio` | `apps/web/lib/evaluations.js:L49` | **CTW-IP-022** / **CTW-IP-023** | Provisional heuristic weight | `UNSOURCED IMPLEMENTATION HEURISTIC` | Simplified linear proxy |
| **12** | Contradiction Penalty Multiplier | `+0.35` penalty | `apps/web/lib/evaluations.js:L48` | **CTW-IP-025** / **CTW-IP-018** | Provisional penalty weight | `UNSOURCED IMPLEMENTATION HEURISTIC` | Simplified linear proxy |
| **13** | Minimum Missing Proof Trigger | `proofStr < 0.30` | `apps/web/app/employer/packet/[id]/page.jsx:L452` | **CTW-IP-031** | Provisional UI trigger | `UNSOURCED IMPLEMENTATION HEURISTIC` | Compatible boundary |
| **14** | Lexical Matching Keyword Min Length | `w.length > 3` | `apps/web/lib/evaluations.js:L109` | **CTW-IP-009** / **CTW-IP-079** | Basic stopword filter heuristic | `UNSOURCED IMPLEMENTATION HEURISTIC` | Simplified text match |
| **15** | Ingestion Fit Score Default | `fit_score: null` | `scripts/founder_batch_importer.js:L170` | **CTW-IP-010** | Canonical separation of intake | **BOUNDED PILOT IMPLEMENTATION** | Fully aligned |

---

## 3. Governance Summary

All provisional thresholds and weights are preserved in typed contract structures, versioned, and explicitly labeled as uncalibrated v1.0 pilot heuristics. Post-pilot calibration will tune exact coefficients using empirical outcome data.
