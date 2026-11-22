import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import CandidateEvidenceCard from "@/components/shortlist/CandidateEvidenceCard";
import ShortlistFilters from "@/components/shortlist/ShortlistFilters";
import ShortlistHeader from "@/components/shortlist/ShortlistHeader";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/employer/shortlist/test-id",
}));

describe("Candidate Shortlist UI Components & Invariants (UX-V2 Day 3 C3)", () => {
  const mockExtraction = {
    id: "33333333-3333-4333-d2c3-111111111111",
    candidate_name: "Dr. Elena Rostova",
    current_role: "Principal Systems Engineer",
    location: "Seattle, WA",
    candidate_profiles: {
      name: "Dr. Elena Rostova",
      bio: "Principal Systems Engineer",
      location: "Seattle, WA",
    },
    decision_packet: {
      schema_version: "0.1.0",
      evaluation_metrics: {
        decision_readiness: "EVIDENCE READY",
        proof_strength: 0.92,
        proof_coverage: 0.88,
        must_have_gates_passed: true,
        blockers_count: 0,
      },
    },
    claim_state: "SUPPORTED",
    skills: ["Rust", "Distributed Systems", "Raft", "gRPC"],
  };

  it("renders CandidateEvidenceCard with canonical readiness and separate metrics", () => {
    render(<CandidateEvidenceCard extraction={mockExtraction} />);

    expect(screen.getByText("Dr. Elena Rostova")).toBeInTheDocument();
    expect(screen.getByTestId("candidate-readiness-33333333-3333-4333-d2c3-111111111111")).toHaveTextContent("EVIDENCE READY");
    expect(screen.getByTestId("candidate-proof-strength-33333333-3333-4333-d2c3-111111111111")).toHaveTextContent("0.92");
    expect(screen.getByTestId("candidate-proof-coverage-33333333-3333-4333-d2c3-111111111111")).toHaveTextContent("88%");
    expect(screen.getByTestId("candidate-gate-status-33333333-3333-4333-d2c3-111111111111")).toHaveTextContent("PASSED");
    expect(screen.getByTestId("candidate-blockers-33333333-3333-4333-d2c3-111111111111")).toHaveTextContent("0 blockers");
    expect(screen.getByTestId("candidate-claim-state-33333333-3333-4333-d2c3-111111111111")).toHaveTextContent("SUPPORTED");

    // ABSOLUTE BANNED SCALAR FIT_SCORE & PROOF-RANKED CHECK
    expect(screen.queryByText(/fit score/i)).toBeNull();
    expect(screen.queryByText(/proof-ranked/i)).toBeNull();
  });

  it("renders 2 blockers when decision_blockers array has 2 items", () => {
    const twoBlockerExtraction = {
      ...mockExtraction,
      id: "55555555-5555-5555-5555-555555555555",
      decision_packet: {
        evaluation_metrics: {
          decision_readiness: "HUMAN REVIEW REQUIRED",
        },
        decision_blockers: [{ id: "b1" }, { id: "b2" }],
      },
    };

    render(<CandidateEvidenceCard extraction={twoBlockerExtraction} />);
    expect(screen.getByTestId("candidate-blockers-55555555-5555-5555-5555-555555555555")).toHaveTextContent("2 blockers");
  });

  it("renders Not available when claim state, blockers, proof strength, and gates are missing", () => {
    const incompleteExtraction = {
      id: "44444444-4444-4444-d2c3-444444444444",
      candidate_name: "Alex Vance",
      current_role: "Backend Developer",
      decision_packet: {
        evaluation_metrics: {
          decision_readiness: "EVIDENCE READY",
        },
      },
    };

    render(<CandidateEvidenceCard extraction={incompleteExtraction} />);

    expect(screen.getByTestId("candidate-claim-state-44444444-4444-4444-d2c3-444444444444")).toHaveTextContent("Not available");
    expect(screen.getByTestId("candidate-blockers-44444444-4444-4444-d2c3-444444444444")).toHaveTextContent("Not available");
    expect(screen.getByTestId("candidate-proof-strength-44444444-4444-4444-d2c3-444444444444")).toHaveTextContent("Not available");
    expect(screen.getByTestId("candidate-gate-status-44444444-4444-4444-d2c3-444444444444")).toHaveTextContent("Not available");
  });

  it("renders ShortlistHeader with neutral candidate count and evaluation labels", () => {
    render(
      <ShortlistHeader
        roleTitle="Senior Distributed Engineer"
        company="Alpha Corp"
        roleId="11111111-1111-4111-d2c1-111111111111"
        counts={{ cohort_candidates: 5, evaluations_completed: 5, documents_received: 10 }}
      />
    );

    expect(screen.getByText(/Evaluations Completed/i)).toBeInTheDocument();
    expect(screen.queryByText(/Proof-Ranked/i)).toBeNull();
  });
});
