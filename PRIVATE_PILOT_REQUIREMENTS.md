# Private Pilot Requirements: Hiring Genome OS

**Objective:** Define and categorize all system capabilities into clear operational readiness tiers for the private pilot deployment.

---

## Tier 1: Required Before Pilot (MVP-Critical)

These capabilities **MUST** be fully functional, verified against Golden Dataset v2, and operational in `05-careertwin-monorepo` before initiating any private customer pilot.

### 1. Governed Hiring Memory Upload & Compiler
- **Target Specs:** IP Spec 001, 002, 004, 065, 094
- **Capability:** Upload company hiring memory artifacts (past high-performer profiles, rejection reasons, team rubrics). Compile company-level and role-level memory into a structured hiring context.

### 2. Role Proof Contract Generator
- **Target Specs:** IP Spec 003, 005, 006, 008, 009
- **Capability:** Generate deterministic Role Proof Contracts from job descriptions and hiring memory. Define required vs. optional proof dimensions, weightings, and acceptable proof routes.

### 3. Atomic Candidate Claim-to-Proof Ledger
- **Target Specs:** IP Spec 010, 016, 017, 018, 019
- **Capability:** Parse candidate documents into atomic, text-first claims (`predicate`, `object`, `confidence`, `evidence_ref`). Build an attributable Claim-to-Proof Ledger linking every claim to exact character offsets, page numbers, and SHA-256 document hashes. Detect evidence contradictions and deduplicate redundant claims.

### 4. Fit, Proof, and Uncertainty Separation Engine
- **Target Specs:** IP Spec 011, 012, 013, 022, 023, 024, 025
- **Capability:** Strictly isolate Candidate Evaluation across three independent dimensions:
  - **Role Fit Score (%):** Extent to which candidate capabilities align with role requirements.
  - **Proof Strength (%):** Degree of attributable evidence verifying claimed skills.
  - **Uncertainty Index (%):** Measured entropy and missing evidence gaps.
- **Rule:** Prevent high fit scores from disguising unverified or speculative candidate claims.

### 5. Decision Blocker Engine & Priority Formula
- **Target Specs:** IP Spec 031, 032, 039, 040
- **Capability:** Identify critical missing proof items or unverified gate requirements that block a hiring manager from making a confident interview decision. Rank blockers by impact on decision confidence.

### 6. Minimum Proof Request Protocol & Burden Formula
- **Target Specs:** IP Spec 033, 034, 035, 036, 037
- **Capability:** Generate targeted, low-burden proof requests (e.g. github link, sample code snippet, project description) that maximize expected confidence lift while minimizing candidate submission effort.

### 7. Candidate Proof Portal & Verification Submission
- **Target Specs:** IP Spec 043, 044, 092
- **Capability:** Provide candidates with a secure, magic-link portal to submit proof artifacts resolving specific decision blockers. Automatically re-evaluate candidate scores upon proof submission.

### 8. Employer Decision Review Queue & Human Authority
- **Target Specs:** IP Spec 028, 046, 080, 100
- **Capability:** Render candidate decision packets categorized by Fit, Proof, and Blocker status. Require explicit human action (**Advance**, **Hold**, **Reject**) with mandatory rationale text. **Strict Prohibition:** Zero automatic candidate rejections or automated hiring decisions.

### 9. Approved Outcome Learning Loop
- **Target Specs:** IP Spec 054, 055, 066, 098
- **Capability:** Capture employer decision feedback (interview outcomes, offer accepts, technical screen results) and update hiring memory in a governed, incremental loop without model drift.

### 10. Protected-Attribute Leakage Guardrails
- **Target Specs:** IP Spec 076, 077, 078, 079
- **Capability:** Audit and sanitize candidate evaluation inputs to detect and strip protected attributes (age, gender, ethnicity, location proxies, graduation dates). Assert 100% invariant score output across demographic variants.

### 11. Immutable Audit Logging
- **Target Specs:** IP Spec 091, 095
- **Capability:** Maintain append-only, tamper-evident audit logs capturing all genome updates, contract releases, candidate evaluations, proof submissions, and human decisions.

---

## Tier 2: Useful During Pilot (Operational Enhancements)

These capabilities enhance operating speed, telemetry, and robustness during active pilot testing but do not block initial pilot launch.

1. **Interview Probe Compiler & Question Ranking:** (IP Spec 086, 087, 088) Generate candidate-specific interview probing questions mapped directly to identified uncertainties.
2. **Source Provenance Confidence & Citation Logic:** (IP Spec 015, 067) Display exact citations and confidence indicators for extracted company memory patterns.
3. **Provider Fallback & Schema Repair:** (IP Spec 072, 073) Automatic graceful degradation to alternative Gemini models if primary model endpoints fail or produce schema errors.
4. **Time & Effort Telemetry Tracking:** (IP Spec 052, 053) Track and report estimated review time saved and interview hours saved for employer pilot dashboards.
5. **Evidence Freshness Decay & Source Independence:** (IP Spec 020, 021) Weight recent evidence higher than older career history and discount redundant single-source claims.

---

## Tier 3: Post-Pilot (Platform Expansion)

Features scheduled for post-pilot rollouts as the system expands across multiple hiring teams and role families.

1. **Candidate Proof Passport & Selective Disclosure:** (IP Spec 081, 082, 083) Enable candidates to store verified proof packets and selectively share them with participating employers.
2. **Role-Family Transfer Logic & Cross-Role Pattern Reuse:** (IP Spec 030, 099) Transfer proof credit and hiring patterns across related software engineering or product management role families.
3. **Hiring Genome & Role Bar Drift Detection:** (IP Spec 057, 058) Detect when hiring bars slowly degrade or shift unnaturally over time.
4. **Shortlist Diversity Guardrail & Confidence Bounds:** (IP Spec 047, 048) Monitor shortlist distribution to ensure bias-free representation.
5. **Adjacent-Role Recommendation Logic:** (IP Spec 041) Suggest strong candidates for secondary open roles within the organization.

---

## Tier 4: Enterprise-Only

Capabilities targeted for enterprise-grade SaaS contracts and dedicated deployments.

1. **Custom On-Premise / Private VPC AI Provider Deployments:** Deploy Gemini / Local LLM inference within customer-owned AWS/GCP VPCs.
2. **Multi-tenant SSO & SCIM Provisioning:** SAML 2.0 / Okta / Azure AD authentication integration with automated user onboarding and role-based access control (RBAC).
3. **Deep ATS Bidirectional Sync:** Live real-time two-way synchronization with enterprise ATS systems (Workday, Greenhouse, Lever, SmartRecruiters).
4. **Cryptographic Proof Ledger on Hardware Enclaves:** (IP Spec 085) Hardware Security Module (HSM) signature verification for candidate credential certificates and work trial artifacts.
5. **Multi-Region Data Sovereignty & Customer-Managed Encryption Keys (CMEK):** Store candidate data in dedicated regional zones (EU, US, APAC) with customer-owned AWS KMS keys.
