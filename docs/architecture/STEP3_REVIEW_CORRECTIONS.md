# Step 3 Planning Review & Approved Corrections

**Date:** July 31, 2026  
**Status:** Approved with Corrections  
**Scope:** Foundation Boundary & Refined Execution Constraints  

---

## Approved Corrections & Architectural Mandates

1. **Foundation-Only Scope for Step 4:**  
   Step 4 is strictly limited to creating the clean monorepo directory foundation and governance documentation. No application source code migration or system integration is permitted during this phase.

2. **Sequential, Separated Component Migrations:**  
   Frontend migration and backend service migration must occur in separate, isolated tasks following foundation verification. They will not be merged into a single bulk migration step.

3. **Preservation of Existing Package Managers & Lockfiles:**  
   Preserve existing JavaScript (npm) and Python (pip/uv) package managers, configuration files, and lockfiles from source repositories.

4. **No Unapproved Workspace Build Tools:**  
   Do not introduce Turborepo, pnpm, uv workspace orchestration, or alternative monorepo tools until full repository parity is established and explicit founder approval is granted.

5. **No Premature Shared Package Extraction:**  
   Do not move existing frontend UI components or utility files into shared monorepo packages (`packages/ui`, `packages/shared-contracts`) during the initial migration. Components remain local to `apps/web` until baseline parity is validated.

6. **Location of Private IP Specifications:**  
   Keep all private IP specification documents housed under `docs/private/ip-specs`.

7. **Location of Golden Dataset v2:**  
   Keep Golden Dataset v2 evaluation benchmarks housed under `evals/golden/v2`.

8. **Zero Copying of Specifications or Datasets in Step 4:**  
   Do not copy IP specifications or Golden Dataset files during Step 4. They remain exclusively in their read-only source locations until specifically requested.

9. **Server-Side Execution for Privileged & Model Provider Calls:**  
   Privileged sourcing API calls and model-provider (Gemini) inference requests must execute strictly server-side within API service boundaries. Browser client calls to third-party providers are forbidden.

10. **Non-Destructive Isolation of Sensitive Signals:**  
    Protected demographic attributes and policy-sensitive candidate signals must be isolated in secondary evaluation views rather than destructively purged from original candidate source records.

11. **Strict Tri-Dimensional Score Separation:**  
    The system must never fall back from Fit / Proof / Uncertainty separation to a single universal candidate score. Dimensional separation is a non-negotiable architecture rule.

12. **Mandatory Incomplete Evaluation Boundary:**  
    Any failed, partial, or unverified candidate evaluation must explicitly yield `"Evaluation incomplete — human review required"`. No silent defaults or dummy scores are permitted.

13. **Preservation of Original Visual System:**  
    Maintain the existing live CareerTWiN visual design system and branding aesthetics rather than introducing unapproved color palettes or replacement design themes.

14. **Restricted Employer Control Surface:**  
    Do not expose raw algorithm scoring-weight sliders or internal threshold controls to standard employer users. Scoring parameters are managed strictly through governed role intake and administrative rules.

15. **Human Decision Authority Maintenance:**  
    All production hiring decisions (**Advance**, **Hold**, **Reject**) remain strictly human-led. The system operates purely as a decision-support engine.

16. **Prohibition of Automated Operational Actions:**  
    No automatic candidate rejection, automatic stage advancement, automated email dispatch, or unreviewed outcome learning is permitted.

17. **Governed Policies for Data Deletion & Audit Retention:**  
    Candidate right-to-be-forgotten deletion requests and immutable audit log retention must be governed by separate, isolated retention policies to preserve compliance audit trails.
