"use client";

import ReadinessBadge from "@/components/packet/ReadinessBadge";
import ClaimStateBadge from "@/components/packet/ClaimStateBadge";
import TechIcon from "@/components/TechIcon";
import { ArrowRight, FileText } from "lucide-react";
import Link from "next/link";
import { normalizeCandidateDisplay } from "@/lib/candidateNormalizer";

export default function CandidateEvidenceCard({ extraction, isSelected, onSelect }) {
  if (!extraction) return null;

  const norm = normalizeCandidateDisplay(extraction);
  const packet = extraction.decision_packet || {};
  const metrics = packet.evaluation_metrics || {};

  // Canonical readiness state (NEVER fallback to scalar fit_score)
  const readiness = metrics.decision_readiness || extraction.readiness_state || null;

  // Separate metrics
  const proofStrength = metrics.proof_strength != null ? Number(metrics.proof_strength).toFixed(2) : (extraction.proof_strength != null ? Number(extraction.proof_strength).toFixed(2) : null);
  const proofCoverage = metrics.proof_coverage != null ? `${Math.round(metrics.proof_coverage * 100)}%` : null;
  const gatesPassed = metrics.must_have_gates_passed != null ? (metrics.must_have_gates_passed ? "PASSED" : "ATTENTION REQUIRED") : null;
  
  // Blocker count
  const rawBlockerCount = metrics.blockers_count != null ? metrics.blockers_count : (Array.isArray(packet.decision_blockers) ? packet.decision_blockers.length : null);

  // Claim/evidence state
  const rawClaimState = extraction.claim_state || null;
  const validClaimStates = ["SUPPORTED", "INFERRED", "UNSUPPORTED", "CONFLICTING"];
  const claimState = rawClaimState && validClaimStates.includes(String(rawClaimState).toUpperCase()) ? String(rawClaimState).toUpperCase() : null;

  // Deduplicate identical subtitle and summary text
  const bioText = (norm.bio || norm.current_role || "").trim();
  const summaryText = (norm.summary && norm.summary !== "Summary not available") ? norm.summary.trim() : "";
  const isIdentical = Boolean(bioText && summaryText && bioText.toLowerCase() === summaryText.toLowerCase());

  return (
    <div
      onClick={onSelect}
      className={`rounded-xl border transition-all p-5 cursor-pointer space-y-4 ${
        isSelected
          ? "border-[#00D604]/40 bg-[#1A1A1A]"
          : "border-[#343434] bg-[#111111] hover:border-[#343434]/80 hover:bg-[#1A1A1A]/60"
      }`}
      data-testid={`shortlist-card-${extraction.id}`}
    >
      {/* Top row: Name & Canonical Readiness Badge */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-[#F2F2F2] tracking-tight">{norm.name}</h3>
          {bioText && <p className="text-xs text-[#A3A3A3] mt-0.5" data-testid={`candidate-bio-${extraction.id}`}>{bioText}</p>}
        </div>
        <div data-testid={`candidate-readiness-${extraction.id}`}>
          <ReadinessBadge readinessState={readiness} />
        </div>
      </div>

      {/* Summary line if valid and not identical to subtitle */}
      {summaryText && !isIdentical && (
        <p className="text-xs text-[#A3A3A3] leading-relaxed line-clamp-2" data-testid={`candidate-summary-${extraction.id}`}>
          {summaryText}
        </p>
      )}

      {/* Separate Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 pb-1 border-y border-[#343434]/60">
        <div>
          <span className="text-[9px] font-mono text-[#A3A3A3] uppercase tracking-wider block">Proof Strength</span>
          <span className="text-xs font-mono font-medium text-[#F2F2F2]" data-testid={`candidate-proof-strength-${extraction.id}`}>
            {proofStrength != null ? proofStrength : "Not available"}
          </span>
        </div>
        <div>
          <span className="text-[9px] font-mono text-[#A3A3A3] uppercase tracking-wider block">Proof Coverage</span>
          <span className="text-xs font-mono font-medium text-[#F2F2F2]" data-testid={`candidate-proof-coverage-${extraction.id}`}>
            {proofCoverage != null ? proofCoverage : "Not available"}
          </span>
        </div>
        <div>
          <span className="text-[9px] font-mono text-[#A3A3A3] uppercase tracking-wider block">Must-Have Gates</span>
          <span className={`text-xs font-mono font-medium ${gatesPassed === "PASSED" ? "text-[#00D604]" : gatesPassed === "ATTENTION REQUIRED" ? "text-amber-400" : "text-[#A3A3A3]"}`} data-testid={`candidate-gate-status-${extraction.id}`}>
            {gatesPassed != null ? gatesPassed : "Not available"}
          </span>
        </div>
        <div>
          <span className="text-[9px] font-mono text-[#A3A3A3] uppercase tracking-wider block">Blockers</span>
          <span className={`text-xs font-mono font-medium ${rawBlockerCount != null ? (rawBlockerCount > 0 ? "text-amber-400" : "text-[#00D604]") : "text-[#A3A3A3]"}`} data-testid={`candidate-blockers-${extraction.id}`}>
            {rawBlockerCount != null ? `${rawBlockerCount} blocker${rawBlockerCount !== 1 ? "s" : ""}` : "Not available"}
          </span>
        </div>
      </div>

      {/* Claim State & Provenance Note */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[#A3A3A3]">Evidence State:</span>
          <div data-testid={`candidate-claim-state-${extraction.id}`}>
            {claimState ? (
              <ClaimStateBadge claimState={claimState} />
            ) : (
              <span className="text-[10px] font-mono text-[#A3A3A3]">Not available</span>
            )}
          </div>
        </div>
        <p className="text-[10px] text-[#A3A3A3] leading-normal italic font-sans">
          SUPPORTED means the claim is attributable to one or more allowed evidence spans. It does not independently verify competence, ownership, causality or outcome.
        </p>
      </div>

      {/* Skills Chips */}
      {norm.skills && norm.skills.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {norm.skills.slice(0, 6).map((skill, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-[#343434] bg-[#1A1A1A] text-[10px] font-mono text-[#F2F2F2]/80"
            >
              <TechIcon name={String(skill).toLowerCase()} className="h-2.5 w-2.5" />
              {skill}
            </span>
          ))}
        </div>
      )}

      {/* Bottom Action: View Decision Packet & AI Chat Links */}
      <div className="flex items-center justify-between pt-2 border-t border-[#343434]/60 gap-2 flex-wrap">
        <span className="text-[10px] font-mono text-[#A3A3A3]">
          {packet.ledger_revision 
            ? `Packet Rev: ${packet.ledger_revision}` 
            : packet.schema_version 
            ? `Schema Template: v${packet.schema_version}` 
            : "Evaluation: Not Started"}
        </span>
        <div className="flex items-center gap-2">
          <Link
            href={`/employer/chat?role_id=${extraction.hiring_run_id || ""}&candidate_id=${extraction.id}`}
            onClick={(e) => e.stopPropagation()}
            className="px-2.5 py-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-xs font-medium text-white/75 hover:text-[#00D604] hover:border-[#00D604]/35 transition-all"
          >
            AI Copilot
          </Link>
          <Link
            href={`/employer/packet/${extraction.id}`}
            onClick={(e) => e.stopPropagation()}
            className="px-3 py-1.5 rounded-xl border border-[#343434] bg-[#1A1A1A] text-xs font-medium text-[#F2F2F2] hover:text-[#00D604] hover:border-[#00D604]/40 transition-all flex items-center gap-1.5"
            data-testid={`view-packet-${extraction.id}`}
          >
            <FileText className="h-3.5 w-3.5 text-[#00D604]" />
            View Decision Packet
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
