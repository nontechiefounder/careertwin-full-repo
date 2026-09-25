"use client";

import { ArrowLeft, Zap } from "lucide-react";
import Link from "next/link";

export default function ShortlistHeader({
  roleTitle,
  company,
  roleId,
  counts = {},
}) {
  const cohortCandidates = counts.cohort_candidates || 0;
  const evaluationsCompleted = counts.evaluations_completed || 0;
  const pendingEvaluation = Math.max(0, cohortCandidates - evaluationsCompleted);

  return (
    <header className="border-b border-[#343434] bg-[#111111] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Link
          href={`/employer/brief/${roleId}`}
          className="p-2 rounded-lg border border-[#343434] bg-[#1A1A1A] text-[#A3A3A3] hover:text-[#F2F2F2] hover:border-[#10D97A]/40 transition-colors"
          aria-label="Return to Role Brief"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-[#F2F2F2] tracking-tight">
              {roleTitle || "Candidate Shortlist"}
            </h1>
            <span
              className="px-2.5 py-0.5 rounded-full border border-[#343434] bg-[#1A1A1A] text-[#F2F2F2] text-[10px] font-mono font-medium"
              data-testid="cohort-candidates-badge"
            >
              {cohortCandidates} Cohort Candidates
            </span>
          </div>
          <p className="text-xs text-[#A3A3A3] mt-0.5 font-mono" data-testid="shortlist-subtitle">
            {company ? `${company} · ` : ""}{evaluationsCompleted} evaluations completed · {pendingEvaluation} pending evaluation
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href={`/employer/brief/${roleId}`}
          className="px-3 py-1.5 rounded-lg border border-[#343434] bg-[#1A1A1A] text-xs font-medium text-[#F2F2F2]/80 hover:text-[#F2F2F2] hover:border-[#10D97A]/40 transition-all flex items-center gap-1.5"
        >
          <Zap className="h-3.5 w-3.5 text-[#10D97A]" />
          View Role Brief
        </Link>
      </div>
    </header>
  );
}
