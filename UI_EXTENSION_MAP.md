# UI Extension Map: Hiring Genome OS Frontend Component Integration

**Visual Design System:** Tailwind CSS v4, Slate-900 / Slate-950 dark mode, Radix UI Primitives, Lucide Icons, Framer Motion transitions.  
**Objective:** Map all 10 Hiring Genome OS workflows directly onto the existing live employer and candidate visual user interfaces in `apps/web`.

---

## 1. Hiring Memory Upload & Parser View

- **Target Route:** `apps/web/app/employer/intake/page.jsx` & `/employer/profile`
- **Visual Design Integration:**
  - Standardized drag-and-drop file upload zone adhering to existing intake form styling.
  - Tabbed inspector: **Company Memory**, **Role Memory**, **Approved Patterns**.
  - Badge components indicating memory provenance (e.g. `Hiring Manager Observation`, `Past High-Performer Code Artifact`).
- **Key Interactive Elements:**
  - Pattern Approval Toggles: Allows hiring managers to approve or reject extracted company memory patterns.
  - Provenance Drawer: Opens exact source excerpts backing a memory pattern.

---

## 2. Governed Hiring Genome Interface

- **Target Route:** `apps/web/app/employer/brief/page.jsx` (Genome Tab)
- **Visual Design Integration:**
  - Dark slate card container with version badge (`Genome v1.0.4 - Governed`).
  - Interactive requirement tree displaying company-level vs. role-specific requirements.
  - Color-coded badges for requirement kinds: `must_have` (Rose), `should_have` (Amber), `nice_to_have` (Slate).
- **Key Interactive Elements:**
  - Requirement Weight Sliders: Fine-tune requirement weights between `0.0` and `1.0`.
  - Must-Have Gate Switches: Explicitly mark critical gate requirements.

---

## 3. Role Proof Contract Matrix

- **Target Route:** `apps/web/app/employer/brief/page.jsx` (Proof Contract Tab)
- **Visual Design Integration:**
  - Structured data matrix listing role requirements alongside acceptable proof routes.
  - Proof dimension badges: `Code Artifact`, `System Architecture Document`, `Verifiable Metric`, `Peer Recommendation`.
- **Key Interactive Elements:**
  - Route Selector: View and edit acceptable evidence submission types for each requirement.
  - Minimum Strength Threshold Selector: Set required evidence confidence levels (`0.50` to `0.90`).

---

## 4. Claim-to-Proof Ledger & Evidence Inspector

- **Target Route:** `apps/web/app/employer/packet/page.jsx`
- **Visual Design Integration:**
  - Dual-pane layout: Candidate Claim List on left, Attributable Source Document Viewer on right.
  - Claim items styled with status indicators: `Verified` (Emerald pill), `Inferred` (Sky pill), `Unsupported` (Slate pill), `Contradicted` (Rose pill).
- **Key Interactive Elements:**
  - Highlighted Excerpt Sync: Clicking a claim automatically scrolls the source document viewer to exact page numbers and character offsets.
  - SHA-256 Hash Verification Badge: Displays tamper-evident document hash.

---

## 5. Fit, Proof, and Uncertainty Separation Display

- **Target Route:** `apps/web/app/employer/shortlist/page.jsx` & `/employer/packet`
- **Visual Design Integration:**
  - Prominent 3-Axis metrics strip replacing generic candidate match scores:
    - **Role Fit %:** Indigo progress pill (e.g. `88% Fit`)
    - **Proof Strength %:** Emerald progress pill (e.g. `45% Proof`)
    - **Uncertainty Index %:** Amber progress pill (e.g. `52% Uncertainty`)
  - Candidate state pill: `Interview Ready` (Emerald), `Near Fit Needs Proof` (Amber), `Unsupported` (Slate).
- **Key Interactive Elements:**
  - Metric Hover Breakdown: Tooltip explaining the exact breakdown of missing evidence penalties and contradiction deductions.

---

## 6. Decision Blocker Inspector

- **Target Route:** `apps/web/app/employer/shortlist/page.jsx` (Candidate Card Expander) & `/employer/packet`
- **Visual Design Integration:**
  - High-visibility Amber/Rose notification banner at the top of candidate packet.
  - Displays prioritized decision blockers blocking an interview decision.
- **Key Interactive Elements:**
  - Resolve Blocker Action: Opens the Minimum Proof Request Generator modal.

---

## 7. Minimum Proof Request Generator

- **Target Route:** Modal overlay on `/employer/shortlist` & `/employer/packet`
- **Visual Design Integration:**
  - Clean Shadcn Dialog component (`dialog.jsx`) with step-by-step request builder.
  - Displays expected metrics:
    - Candidate Effort Burden (e.g. `Low - ~10 mins`)
    - Expected Confidence Lift (e.g. `+35% Proof Strength`)
- **Key Interactive Elements:**
  - One-Click Request Dispatch: Generates candidate magic link and dispatches proof request email.

---

## 8. Candidate Proof Submission Portal

- **Target Route:** `apps/web/app/candidate/proof/[token]/page.jsx`
- **Visual Design Integration:**
  - Dedicated candidate-facing responsive mobile/desktop view.
  - Clean, distraction-free card explaining the exact proof request (e.g., "Provide repository link or code snippet demonstrating production React state management").
- **Key Interactive Elements:**
  - Proof Upload / Text Editor Area: Supports file drag-drop or direct code paste.
  - Real-Time Verification Progress Bar: Shows processing status (Scanning -> Parsing -> Evaluating -> Verified).

---

## 9. Decision Review Queue & Human Decision Protocol

- **Target Route:** `apps/web/app/employer/shortlist/page.jsx`
- **Visual Design Integration:**
  - Shortlist tab filters: `All Candidates`, `Interview Ready`, `Near Fit Needs Proof`, `Blocked`.
  - Action Bar with explicit decision buttons:
    - **Advance to Interview** (Emerald Button)
    - **Hold for Proof** (Amber Button)
    - **Reject / Pass** (Rose Outline Button)
- **Key Interactive Elements:**
  - Human Decision Rationale Modal: Requires employer to input explicit written rationale before confirming any candidate status transition.

---

## 10. Outcome Learning & Audit Trail Inspector

- **Target Route:** `apps/web/app/employer/profile/page.jsx` (Audit & Calibration Tab)
- **Visual Design Integration:**
  - Append-only activity timeline showing all system evaluation, contract release, proof submission, and human decision events.
  - Tamper-evident SHA-256 event hash indicators.
- **Key Interactive Elements:**
  - Outcome Feedback Form: Allows hiring managers to record post-interview outcomes (e.g. `Passed Tech Screen`, `Failed Architecture Probe`).
  - Downloadable Audit Bundle Button: Exports readable JSON bundle of complete hiring genome history.
