# Corrected Canonical Private-Pilot IP Slice & Dependency Graph (RC-C1.2 REVISED)

**Date:** 2026-08-13  
**Target Scope:** First Controlled Private Pilot (1 Technical Role + 20–50 Candidate Inputs)  
**Audited Specification Inventory:** Exactly 44 target specifications (30 P0, 8 P1, 6 P2).

---

## 1. Canonical P0 Runtime Dependency Graph

The private-pilot decision kernel strictly follows the runtime dependency chain across the 30 P0 kernel specifications:

```
[CTW-IP-005] Approved Proof Contract & Screening Dimensions
       │
       ▼
[CTW-IP-010, 009] Text-First Candidate Extraction & Semantic Evidence Distribution
       │
       ▼
[CTW-IP-016, 017] Claim-to-Proof Graph Mapping & Activity Ledger
       │
       ▼
[CTW-IP-015, 074] Source Provenance Verification (Offset & Hash) & Subset Validation
       │
       ▼
[CTW-IP-011, 013, 012] Separated Evaluation: Role Fit | Proof Coverage | Proof Strength
       │
       ▼
[CTW-IP-022, 023, 024, 025] Candidate Uncertainty, Entropy & Missing/Contradiction Penalties
       │
       ▼
[CTW-IP-026, 027] Must-Have & Disqualifier Gates
       │
       ▼
[CTW-IP-031, 033] Decision Blockers & Minimum Sufficient Proof Protocol
       │
       ▼
[CTW-IP-038, 039, 040] Interview Readiness, Candidate State & High-Fit/Low-Proof Detection
       │
       ▼
[CTW-IP-046] Proof-Ranked Shortlist Sorting Algorithm
       │
       ▼
[CTW-IP-076, 078, 079] Protected-Attribute Removal, Bias Guardrails & Job Relevance
       │
       ▼
[CTW-IP-093] Candidate Trust Packet Generation
       │
       ▼
[CTW-IP-028, 080, 100] Human Override, Human Release Protocol & Hiring Decision Authority
```

---

## 2. Corrected Private-Pilot Slice Categorization

### P0 — MVP-Critical Kernel (30 Specifications)
Implemented and wired in the runtime decision kernel:
1. **CTW-IP-005:** Proof Contract Generator
2. **CTW-IP-009:** Semantic Evidence Distribution Engine
3. **CTW-IP-010:** Text-First Candidate Evaluation Method
4. **CTW-IP-011:** Role Fit Distribution Formula
5. **CTW-IP-012:** Evidence Strength Formula
6. **CTW-IP-013:** Proof Coverage Formula
7. **CTW-IP-015:** Source Provenance Confidence Formula
8. **CTW-IP-016:** Claim-to-Proof Graph
9. **CTW-IP-017:** Claim-to-Proof Ledger
10. **CTW-IP-018:** Evidence Contradiction Detection Logic
11. **CTW-IP-022:** Candidate Uncertainty Formula
12. **CTW-IP-023:** Distribution Entropy Formula
13. **CTW-IP-024:** Missing-Evidence Penalty Formula
14. **CTW-IP-025:** Contradiction Penalty Formula
15. **CTW-IP-026:** Must-Have Gate Logic
16. **CTW-IP-027:** Disqualifier Gate Logic
17. **CTW-IP-028:** Human Override Logic
18. **CTW-IP-031:** Decision Blocker Engine
19. **CTW-IP-033:** Minimum Sufficient Proof Protocol
20. **CTW-IP-038:** Interview Readiness Threshold Logic
21. **CTW-IP-039:** Candidate State Classification Logic
22. **CTW-IP-040:** High-Fit/Low-Proof Detection
23. **CTW-IP-046:** Proof-Ranked Shortlist Algorithm
24. **CTW-IP-074:** Evidence-Subset Validation Logic
25. **CTW-IP-076:** Protected-Attribute Leakage Detection
26. **CTW-IP-078:** Bias-Safe Evaluation Guardrails
27. **CTW-IP-079:** Job-Relevance Validation Logic
28. **CTW-IP-080:** Human-in-the-Loop Release Protocol
29. **CTW-IP-093:** Candidate Trust Packet Format
30. **CTW-IP-100:** Human-Agent Hiring Decision Protocol

---

### P1 — Bounded / Founder-Assisted Pilot (8 Specifications)
Structurally compatible in contracts; bounded neutral/provisional implementation for first pilot:
1. **CTW-IP-014:** Evidence Reliability Weighting Formula
2. **CTW-IP-020:** Evidence Freshness Decay Formula
3. **CTW-IP-021:** Evidence Source Independence Formula
4. **CTW-IP-032:** Decision Blocker Priority Formula
5. **CTW-IP-034:** Minimum Proof Selection Optimizer
6. **CTW-IP-086:** Interview Probe Compiler
7. **CTW-IP-087:** Uncertainty-to-Question Mapping
8. **CTW-IP-089:** Interview Answer Evidence Mapper

---

### P2 — Deferred Post-Pilot (6 Specifications)
Explicitly deferred post-pilot:
1. **CTW-IP-035:** Proof Request Burden Formula
2. **CTW-IP-036:** Expected Confidence Lift Formula
3. **CTW-IP-037:** Confidence-Lift-to-Effort Ratio
4. **CTW-IP-075:** Full NLI Hallucination Detection Guardrail (CTW-IP-074 handles evidence subset boundary)
5. **CTW-IP-077:** Proxy-Attribute Detection
6. **CTW-IP-088:** Candidate-Specific Interview Question Ranking
