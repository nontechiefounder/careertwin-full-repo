# Test & Evaluation Plan: Golden Dataset v2 Benchmark

**Evaluation Engine:** `packages/eval` executing against `golden_dataset/` (Golden Dataset v2).  
**Objective:** Validate system performance, evidence attribution accuracy, protected-attribute invariance, and human governance rules prior to private pilot launch.

---

## 1. Golden Dataset v2 Benchmark Architecture

Golden Dataset v2 contains 20 roles, 60 candidates, 192 historical decisions, 360 gold claims, 20 proof contracts, and expected output JSONL files representing ground truth for all Hiring Genome OS workflows.

```text
golden_dataset/
├── expected_claims.jsonl                           # Gold Atomic Claims & Source Offsets
├── expected_proof_contracts.jsonl                  # Gold Role Proof Contracts
├── expected_decision_blockers.jsonl                # Gold Decision Blockers
├── expected_post_proof_updates.jsonl               # Gold Proof Submission Updates
├── expected_fit_distributions.jsonl                # Gold Fit Scores
├── expected_proof_distributions.jsonl              # Gold Proof Scores
├── expected_uncertainty_distributions.jsonl        # Gold Uncertainty Indices
├── protected_attribute_leakage_tests.jsonl         # Safety Invariance Pair Fixtures
├── expected_safety_invariance_tests.jsonl          # Expected Safety Invariance Outputs
├── expected_evidence_subset_validation.jsonl       # Causal Evidence Withholding Tests
├── expected_human_review_flags.jsonl               # Required Human Review Cases
├── expected_audit_trails.jsonl                     # Gold Audit Logs
└── tools/validate_v2_dataset.py                   # Integrity Validator
```

---

## 2. Nine Core Evaluation Modules

### Module 1: Claim Extraction & Provenance Attribution
- **Target Fixture:** `expected_claims.jsonl`
- **Evaluation Method:** Extract atomic claims from candidate resumes (`golden_resumes/`) and code artifacts (`golden_code_artifacts/`). Compare extracted `predicate`, `object`, and `evidence_ref` against gold labels.
- **Success Metrics:**
  - Claim Extraction Precision $\ge 92\%$
  - Claim Extraction Recall $\ge 90\%$
  - Source Offset Accuracy $= 100\%$ (Exact page number and character offset matching).

### Module 2: Role Proof Contract Compilation
- **Target Fixture:** `expected_proof_contracts.jsonl`
- **Evaluation Method:** Compile job descriptions and company memory (`golden_company_memory/`) into Role Proof Contracts.
- **Success Metrics:**
  - Dimension Coverage F1 Score $\ge 95\%$
  - Must-Have Gate Classification Accuracy $= 100\%$

### Module 3: Decision Blocker Detection & Priority Ranking
- **Target Fixture:** `expected_decision_blockers.jsonl`
- **Evaluation Method:** Identify candidate decision blockers and rank them using the Blocker Priority Formula.
- **Success Metrics:**
  - Decision Blocker Detection Precision $\ge 95\%$
  - Top-1 Blocker Ranking Accuracy $\ge 92\%$

### Module 4: Minimum Proof Request & Submission Re-Evaluation
- **Target Fixture:** `expected_post_proof_updates.jsonl` & `golden_proof_submissions/`
- **Evaluation Method:** Run proof loop twice: evaluate candidate before proof submission, inject candidate proof artifact, and re-evaluate candidate scores.
- **Success Metrics:**
  - Post-Proof Score Calibration Error $\le 0.05$
  - Burden Score vs. Confidence Lift Correlation $\ge 0.88$

### Module 5: Fit, Proof, and Uncertainty Semantic Distributions
- **Target Fixture:** `expected_fit_distributions.jsonl`, `expected_proof_distributions.jsonl`, `expected_uncertainty_distributions.jsonl`
- **Evaluation Method:** Compute candidate evaluation distributions across 3 independent axes. Assert mathematical separation between Fit %, Proof %, and Uncertainty %.
- **Success Metrics:**
  - Distribution Brier Calibration Score $\le 0.08$
  - Fit-vs-Proof Orthogonality Correlation $r \le 0.25$ (Validates true dimensional separation).

### Module 6: Protected-Signal Invariance & Bias-Safe Guardrails
- **Target Fixture:** `protected_attribute_leakage_tests.jsonl` & `expected_safety_invariance_tests.jsonl`
- **Evaluation Method:** Inject demographic variations (age, gender, ethnicity, location proxy) into identical candidate claim profiles and assert zero score variation.
- **Success Metrics:**
  - Protected Attribute Leakage Rate $= 0.0\%$
  - Safety Pair Score Variance $= 0.000$

### Module 7: Tenant Data Isolation & Cross-Tenant Penetration
- **Target Method:** Synthetic API integration tests attempting cross-tenant queries.
- **Evaluation Method:** Attempt to query Tenant A roles or candidates using Tenant B JWT tokens across all FastAPI endpoints.
- **Success Metrics:**
  - Cross-Tenant Data Leakage $= 0$
  - Unauthorized Access HTTP Status $= 403 \text{ Forbidden}$

### Module 8: Evidence Attribution & Hallucination Elimination
- **Target Fixture:** `expected_evidence_subset_validation.jsonl`
- **Evaluation Method:** Withhold specific evidence artifacts from candidate records and assert causal score degradation in Proof Strength.
- **Success Metrics:**
  - Hallucinated Verified Claims $= 0$
  - Causal Score Degradation Pass Rate $= 100\%$

### Module 9: Human Review Protocol & Audit Ledger Verification
- **Target Fixture:** `expected_human_review_flags.jsonl` & `expected_audit_trails.jsonl`
- **Evaluation Method:** Trigger edge cases requiring human review (e.g. evidence contradictions, high fit with zero proof, candidate risk flags). Verify that system halts automated progression and demands human approval.
- **Success Metrics:**
  - Human Review Gate Recall $= 100\%$
  - Audit Trail Hash Chain Integrity $= 100\%$

---

## 3. Automated Continuous Evaluation Pipeline

```bash
# Execute complete Golden Dataset v2 evaluation suite in monorepo
cd 05-careertwin-monorepo
make eval-v2
```

The test runner will execute all 9 modules, outputting an evaluation scorecard (`eval_report.json`) detailing precision, recall, safety invariance, and schema compliance. **Zero release blocker policy:** Any failure in Module 6 (Protected-Signal Invariance), Module 7 (Tenant Isolation), or Module 8 (Zero Hallucination) immediately halts release pipelines.
