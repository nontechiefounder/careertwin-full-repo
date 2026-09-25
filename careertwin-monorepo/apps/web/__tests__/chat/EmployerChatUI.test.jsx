/**
 * Employer Chat V2 Component & Integration Test Suite (UX-V2-D2-C1)
 * Tests truthful rendering, error handling, missing reply fail-closed behavior,
 * absence of static Connected/Truthful badges, conditional sources & artifacts,
 * accessible alert/status roles, and zero manufactured fallbacks.
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

import ChatShell from "@/components/chat/ChatShell";
import ChatHeader from "@/components/chat/ChatHeader";
import ConversationList from "@/components/chat/ConversationList";
import UserMessage from "@/components/chat/UserMessage";
import AssistantMessage from "@/components/chat/AssistantMessage";
import PromptBar from "@/components/chat/PromptBar";
import PromptSuggestions from "@/components/chat/PromptSuggestions";
import SourcePills from "@/components/chat/SourcePills";
import CandidateChatCard from "@/components/chat/CandidateChatCard";
import ChatEmptyState from "@/components/chat/ChatEmptyState";
import ChatLoadingState from "@/components/chat/ChatLoadingState";
import ChatErrorState from "@/components/chat/ChatErrorState";

describe("Employer Chat V2 Component Test Suite (UX-V2-D2-C1)", () => {

  it("1. ChatHeader renders neutral labels and DOES NOT render static Connected or Truthful Engine V2 badges", () => {
    render(<ChatHeader activeRoleTitle="Senior Backend Engineer" />);
    expect(screen.getByText("Evidence-aware assistant")).toBeInTheDocument();
    expect(screen.getByText("Non-streaming chat")).toBeInTheDocument();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
    expect(screen.queryByText("Truthful Engine V2")).not.toBeInTheDocument();
  });

  it("2. AssistantMessage renders reply text and DOES NOT render simulated execution steps", () => {
    const msg = {
      content: "Authorized pipeline summary reply",
      steps: [{ label: "Scanning Hiring Runs", done: true }], // Should be ignored by AssistantMessage
    };
    render(<AssistantMessage message={msg} />);

    expect(screen.getByText("Authorized pipeline summary reply")).toBeInTheDocument();
    expect(screen.queryByText("Scanning Hiring Runs")).not.toBeInTheDocument();
    expect(screen.queryByText("Aggregating Candidate Counts")).not.toBeInTheDocument();
  });

  it("3. SourcePills renders sources ONLY when valid source object array is passed and DOES NOT manufacture fallback identities", () => {
    // 1. Valid source array
    const validSources = [{ id: "doc_1", filename: "resume_alpha.pdf", page: 2 }];
    const { unmount: u1 } = render(<SourcePills sources={validSources} />);
    expect(screen.getByText("resume_alpha.pdf")).toBeInTheDocument();
    expect(screen.getByText("(p. 2)")).toBeInTheDocument();
    u1();

    // 2. Invalid/empty sources -> renders null
    const { unmount: u2 } = render(<SourcePills sources={[]} />);
    expect(screen.queryByText("Attributable Sources:")).not.toBeInTheDocument();
    expect(screen.queryByText("Source #1")).not.toBeInTheDocument();
    u2();
  });

  it("4. CandidateChatCard renders card ONLY when title, type, and href are provided without hardcoded fallbacks", () => {
    // 1. Valid artifact
    const validArt = { title: "Backend Shortlist", type: "SHORTLIST", href: "/employer/shortlist/r1" };
    const { unmount: u1 } = render(<CandidateChatCard artifact={validArt} />);
    expect(screen.getByText("Backend Shortlist")).toBeInTheDocument();
    expect(screen.getByText("SHORTLIST")).toBeInTheDocument();
    u1();

    // 2. Incomplete artifact -> renders null
    const invalidArt = { title: "Incomplete" };
    const { unmount: u2 } = render(<CandidateChatCard artifact={invalidArt} />);
    expect(screen.queryByText("Hiring Artifact")).not.toBeInTheDocument();
    expect(screen.queryByText("Incomplete")).not.toBeInTheDocument();
    u2();
  });

  it("5. ChatErrorState has role='alert' and renders actionable error recovery preserving submitted message", () => {
    const handleResend = vi.fn();
    render(
      <ChatErrorState
        errorMessage="Unable to connect to hiring chat service."
        lastSubmittedInput="Give me a summary of my hiring pipeline"
        onResend={handleResend}
      />
    );

    const alertBanner = screen.getByRole("alert");
    expect(alertBanner).toBeInTheDocument();
    expect(screen.getByText("Unable to connect to hiring chat service.")).toBeInTheDocument();
    expect(screen.getByText(/Give me a summary of my hiring pipeline/i)).toBeInTheDocument();

    const resendBtn = screen.getByRole("button", { name: /Resend Message/i });
    fireEvent.click(resendBtn);
    expect(handleResend).toHaveBeenCalledWith("Give me a summary of my hiring pipeline");
  });

  it("6. PromptBar has accessible form labels, handles submission, and prevents duplicate submissions while submitting", () => {
    const handleSubmit = vi.fn();
    const { rerender } = render(
      <PromptBar input="Valid prompt text" onChange={() => {}} onSubmit={handleSubmit} isSubmitting={false} />
    );

    const promptInput = screen.getByLabelText(/Ask a question about your hiring pipeline/i);
    expect(promptInput).toBeInTheDocument();

    const submitBtn = screen.getByRole("button", { name: /Submit Chat Prompt/i });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);
    expect(handleSubmit).toHaveBeenCalledTimes(1);

    // Rerender as submitting
    rerender(
      <PromptBar input="Valid prompt text" onChange={() => {}} onSubmit={handleSubmit} isSubmitting={true} />
    );

    expect(promptInput).toBeDisabled();
    expect(submitBtn).toBeDisabled();
    expect(screen.getByText("Submitting...")).toBeInTheDocument();
  });

  it("7. ProductGovernanceNotice renders non-intrusively in ChatShell", () => {
    render(
      <ChatShell header={<div>Header</div>} sidebar={<div>Sidebar</div>}>
        <div>Main Content</div>
      </ChatShell>
    );

    expect(screen.getByText(/CareerTWiN supports evidence review and interview prioritization. Hiring decisions remain with authorized human reviewers./i)).toBeInTheDocument();
  });

});
