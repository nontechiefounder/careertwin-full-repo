/**
 * Candidate Trust Packet Component & UI Requirements Test Suite (Revised for UX-V2-D1-C1 & UX-V2-D2)
 * Validates Part 10 requirements for UX-V2-D1-C1 Evidence Integrity & Governance correction,
 * and Part 1.A / Part 1.B Day 2 semantic preflight corrections.
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

// Import components under test
import ReadinessBadge from "@/components/packet/ReadinessBadge";
import ClaimStateBadge from "@/components/packet/ClaimStateBadge";
import CandidateHeader from "@/components/packet/CandidateHeader";
import ProductGovernanceNotice from "@/components/packet/ProductGovernanceNotice";
import DecisionOverview from "@/components/packet/DecisionOverview";
import DecisionBlockers from "@/components/packet/DecisionBlockers";
import ClaimLedger from "@/components/packet/ClaimLedger";
import WhatWeKnow from "@/components/packet/WhatWeKnow";
import EvidenceDrawer from "@/components/packet/EvidenceDrawer";
import AuditDetailsDrawer from "@/components/packet/AuditDetailsDrawer";
import PacketEmptyState from "@/components/packet/PacketEmptyState";

describe("Candidate Trust Packet Evidence-Integrity Test Suite (UX-V2-D1-C1 & UX-V2-D2)", () => {

  it("1. Missing readiness state renders READINESS UNAVAILABLE and does NOT become NEEDS PROOF", () => {
    render(<ReadinessBadge readinessState={null} />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveTextContent("READINESS UNAVAILABLE");
    expect(badge).not.toHaveTextContent("NEEDS PROOF");
  });

  it("2. Missing metrics display 'Not available' and do NOT receive favorable default values", () => {
    render(<DecisionOverview evaluationMetrics={{}} fitScore={null} proofStrength={null} />);
    const notAvailableElements = screen.getAllByText("Not available");
    expect(notAvailableElements.length).toBeGreaterThan(0);
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
  });

  it("3. Missing gate status displays 'Not available' and does NOT become passed", () => {
    render(<DecisionOverview evaluationMetrics={{ gate_pass: undefined }} />);
    const notAvailableElements = screen.getAllByText("Not available");
    expect(notAvailableElements.length).toBeGreaterThan(0);
    expect(screen.queryByText("Passed")).not.toBeInTheDocument();
  });

  it("4. Missing timestamp displays 'Not available' and does NOT become current time", () => {
    render(<CandidateHeader candidateName="Jane Doe" evaluatedTimestamp={null} />);
    expect(screen.getByText(/Evaluated: Not available/i)).toBeInTheDocument();
  });

  it("5. Missing claim state displays 'Not available' and does NOT default to SUPPORTED", () => {
    render(<ClaimStateBadge claimState={null} />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveTextContent("Not available");
    expect(badge).not.toHaveTextContent("SUPPORTED");
  });

  it("6. Claims without explicit evidence edges receive no citation and display 'No attributable EvidenceRef supplied'", () => {
    const claims = [{ id: "c1", claim_text: "Unmatched Claim Text", status: null }];
    render(<ClaimLedger claims={claims} evidenceRefs={[]} />);
    expect(screen.getByText("No attributable EvidenceRef supplied")).toBeInTheDocument();
  });

  it("7. EvidenceDrawer renders 'Not available' for unsupplied fields and NO fabricated filename, locator, hash, or doc ID", () => {
    const sparseRef = { id: "ref_sparse" };
    render(<EvidenceDrawer isOpen={true} onClose={() => {}} evidenceRef={sparseRef} />);
    
    expect(screen.getByText(/Not available \(Not available\)/i)).toBeInTheDocument();
    expect(screen.queryByText("candidate_resume.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("sha256-excerpt-hash")).not.toBeInTheDocument();
    expect(screen.queryByText("1.0.0-docling")).not.toBeInTheDocument();
  });

  it("8. Empty state cannot generate a packet and contains NO automatic generation controls", () => {
    render(<PacketEmptyState shortlistUrl="/employer/shortlist/role1" />);
    expect(screen.queryByText(/Generate Decision Packet/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Back to Shortlist/i)).toBeInTheDocument();
  });

  it("9. Empty blocker list displays exact copy and does NOT claim all requirements are verified", () => {
    render(<DecisionBlockers missingProof={[]} />);
    expect(screen.getByText("No decision blockers were supplied in this packet.")).toBeInTheDocument();
    expect(screen.queryByText(/All must-have requirements verified/i)).not.toBeInTheDocument();
  });

  it("10. Exactly ONE primary readiness badge renders in CandidateHeader", () => {
    render(<CandidateHeader candidateName="John Doe" readinessState="EVIDENCE READY" />);
    const badges = screen.getAllByRole("status", { name: /Readiness state:/i });
    expect(badges.length).toBe(1);
    expect(badges[0]).toHaveTextContent("EVIDENCE READY");
  });

  it("11. AuditDetailsDrawer displays unavailable values honestly without metadata substitution", () => {
    render(<AuditDetailsDrawer isOpen={true} onClose={() => {}} packet={{}} extraction={{}} hiringRun={{}} />);
    const notAvailableElements = screen.getAllByText("Not available");
    expect(notAvailableElements.length).toBeGreaterThan(5);
  });

  it("12. Explicit claim-to-evidence relationships render correctly when supplied", () => {
    const ref = { id: "ref_1", filename: "resume.pdf", locator: { page: 2 }, source_offset: { start_offset: 10, end_offset: 50 } };
    const claims = [{ id: "c1", claim_text: "Explicitly linked claim", status: "SUPPORTED", evidence_ref: ref }];
    render(<ClaimLedger claims={claims} evidenceRefs={[ref]} />);
    expect(screen.getByText("resume.pdf")).toBeInTheDocument();
    expect(screen.getByText("(Page 2)")).toBeInTheDocument();
  });

  it("13. All 4 canonical readiness states render correctly when supplied", () => {
    const states = ["EVIDENCE READY", "HUMAN REVIEW REQUIRED", "NEEDS PROOF", "INSUFFICIENT EVIDENCE"];
    states.forEach((st) => {
      const { unmount } = render(<ReadinessBadge readinessState={st} />);
      const badge = screen.getByRole("status");
      expect(badge).toHaveTextContent(st);
      unmount();
    });
  });

  it("14. Governance notice renders exact approved copy", () => {
    render(<ProductGovernanceNotice />);
    expect(screen.getByText(/CareerTWiN supports evidence review and interview prioritization. Hiring decisions remain with authorized human reviewers./i)).toBeInTheDocument();
  });

  it("15. Handles missing optional packet fields gracefully without crashing", () => {
    expect(() => {
      render(<WhatWeKnow packet={null} />);
      render(<ClaimLedger packet={{}} />);
      render(<DecisionBlockers packet={undefined} />);
      render(<DecisionOverview evaluationMetrics={undefined} />);
    }).not.toThrow();
  });

  // PART 1.A: Vitest assertions for File Hash Truth
  describe("Part 1.A — File Hash Truth Semantics", () => {
    it("renders physical file hash present, physical file hash absent, normalized-text hash present, and keeps hashes distinct", () => {
      // 1. Physical file hash present, normalized text present
      const refWithBoth = {
        id: "ref_both",
        filename: "doc.pdf",
        file_sha256: "file_hash_aaa_111",
        normalized_text_sha256: "norm_hash_bbb_222",
      };
      const { unmount: u1 } = render(<EvidenceDrawer isOpen={true} onClose={() => {}} evidenceRef={refWithBoth} />);
      expect(screen.getByText(/Physical File Hash: file_hash_aaa_111/i)).toBeInTheDocument();
      expect(screen.getByText(/Normalized Text SHA-256: norm_hash_bbb_222/i)).toBeInTheDocument();
      u1();

      // 2. Physical file hash absent, normalized text present (must NOT substitute normalized hash as File Hash)
      const refOnlyNorm = {
        id: "ref_only_norm",
        filename: "doc.pdf",
        normalized_text_sha256: "norm_hash_ccc_333",
      };
      const { unmount: u2 } = render(<EvidenceDrawer isOpen={true} onClose={() => {}} evidenceRef={refOnlyNorm} />);
      expect(screen.getByText(/Physical File Hash: Not available/i)).toBeInTheDocument();
      expect(screen.getByText(/Normalized Text SHA-256: norm_hash_ccc_333/i)).toBeInTheDocument();
      u2();
    });
  });

  // PART 1.B: Vitest assertions for Packet-Level Claim Edges & Relationships
  describe("Part 1.B — Claim-Edge Relationships", () => {
    it("resolves packet-level claim edges, multiple evidence IDs, invalid EvidenceRef IDs, and unlinked claims without fallback", () => {
      const r1 = { id: "ref_101", filename: "doc1.pdf" };
      const r2 = { id: "ref_102", filename: "doc2.pdf" };

      const packetData = {
        claims: [
          { id: "c_explicit", claim_text: "Explicit claim", evidence_ref: r1 },
          { id: "c_packet_edge", claim_text: "Packet edge claim" },
          { id: "c_multi", claim_text: "Multi edge claim", evidence_ids: ["ref_101", "ref_102"] },
          { id: "c_invalid", claim_text: "Invalid edge claim", evidence_id: "non_existent_ref_id" },
          { id: "c_unlinked", claim_text: "Unlinked claim" },
        ],
        evidence_refs: [r1, r2],
        claim_edges: [
          { claim_id: "c_packet_edge", evidence_id: "ref_102" },
        ],
      };

      render(<ClaimLedger packet={packetData} />);

      // Explicit claim has doc1 citation
      const c1 = screen.getByText("Explicit claim").closest("div[data-claim-id='c_explicit']");
      expect(c1).toHaveTextContent("doc1.pdf");

      // Packet edge claim resolves via claim_edges to doc2
      const c2 = screen.getByText("Packet edge claim").closest("div[data-claim-id='c_packet_edge']");
      expect(c2).toHaveTextContent("doc2.pdf");

      // Multi evidence claim renders both doc1 and doc2
      const c3 = screen.getByText("Multi edge claim").closest("div[data-claim-id='c_multi']");
      expect(c3).toHaveTextContent("doc1.pdf");
      expect(c3).toHaveTextContent("doc2.pdf");

      // Invalid reference ID resolves to unlinked
      const c4 = screen.getByText("Invalid edge claim").closest("div[data-claim-id='c_invalid']");
      expect(c4).toHaveTextContent("No attributable EvidenceRef supplied");

      // Unlinked claim resolves to unlinked
      const c5 = screen.getByText("Unlinked claim").closest("div[data-claim-id='c_unlinked']");
      expect(c5).toHaveTextContent("No attributable EvidenceRef supplied");
    });
  });

});
