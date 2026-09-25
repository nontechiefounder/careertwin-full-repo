import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ProofContractHeader from "@/components/brief/ProofContractHeader";
import RoleDefinitionPanel from "@/components/brief/RoleDefinitionPanel";
import RequirementGroup, { getRequirementText } from "@/components/brief/RequirementGroup";
import ProofContractEmptyState from "@/components/brief/ProofContractEmptyState";
import ProofContractErrorState from "@/components/brief/ProofContractErrorState";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/employer/brief/test-id",
}));

describe("Proof Contract & Hiring Brief UI Components (UX-V2 Day 3 C3)", () => {

  it("getRequirementText safely formats strings, numbers, objects, and rejects unknown objects / null", () => {
    expect(getRequirementText("10+ years C++")).toBe("10+ years C++");
    expect(getRequirementText(42)).toBe("42");
    expect(getRequirementText({ text: "Kubernetes Operator" })).toBe("Kubernetes Operator");
    expect(getRequirementText({ description: "gRPC Services" })).toBe("gRPC Services");
    expect(getRequirementText({ title: "Raft Consensus" })).toBe("Raft Consensus");
    expect(getRequirementText({ unknown: true })).toBeNull();
    expect(getRequirementText(null)).toBeNull();
    expect(getRequirementText(undefined)).toBeNull();
  });

  it("renders ProofContractHeader with supplied status, or Status unavailable if missing without active fallback", () => {
    const { rerender } = render(
      <ProofContractHeader
        roleTitle="Senior Distributed Systems Architect"
        company="Alpha Corp"
        status="active"
        id="11111111-1111-4111-a111-111111111111"
      />
    );
    expect(screen.getByText("Senior Distributed Systems Architect")).toBeInTheDocument();
    expect(screen.getByTestId("brief-status")).toHaveTextContent(/active/i);

    // Rerender with missing status
    rerender(
      <ProofContractHeader
        roleTitle="Senior Distributed Systems Architect"
        company="Alpha Corp"
        id="11111111-1111-4111-a111-111111111111"
      />
    );
    expect(screen.getByTestId("brief-status")).toHaveTextContent(/STATUS UNAVAILABLE/i);
    expect(screen.getByTestId("brief-status")).not.toHaveTextContent(/^active$/i);
  });

  it("renders RoleDefinitionPanel with location and stage, or Not available when missing without seed fallback", () => {
    const { rerender } = render(
      <RoleDefinitionPanel
        summary="Architect high-throughput gRPC services and distributed consensus pipelines."
        location="San Francisco, CA"
        stage="series-b"
        company="Alpha Corp"
      />
    );
    expect(screen.getByTestId("brief-location")).toHaveTextContent("San Francisco, CA");
    expect(screen.getByTestId("brief-company-stage")).toHaveTextContent("series-b");

    // Rerender with missing location and stage
    rerender(
      <RoleDefinitionPanel
        summary="Architect high-throughput gRPC services."
        company="Alpha Corp"
      />
    );
    expect(screen.getByTestId("brief-location")).toHaveTextContent("Not available");
    expect(screen.getByTestId("brief-company-stage")).toHaveTextContent("Not available");
    expect(screen.getByTestId("brief-company-stage")).not.toHaveTextContent(/seed/i);
  });

  it("renders RequirementGroup with item count and never renders [object Object]", () => {
    render(
      <RequirementGroup
        title="Must-Have Requirements"
        type="must"
        items={[
          "10+ years C++/Rust",
          { text: "Distributed Consensus Protocols" },
          { unknownField: "Should not serialize" }
        ]}
      />
    );
    expect(screen.getByText("Must-Have Requirements")).toBeInTheDocument();
    expect(screen.getByText("10+ years C++/Rust")).toBeInTheDocument();
    expect(screen.getByText("Distributed Consensus Protocols")).toBeInTheDocument();
    expect(screen.queryByText(/\[object Object\]/)).toBeNull();
  });

  it("renders ProofContractEmptyState and ProofContractErrorState", () => {
    const { rerender } = render(<ProofContractEmptyState />);
    expect(screen.getByText("Proof Contract Not Found")).toBeInTheDocument();

    rerender(<ProofContractErrorState error="Network connection lost" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Network connection lost");
  });
});
