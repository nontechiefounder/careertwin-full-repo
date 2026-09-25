"use client";

import { ArrowLeft, Zap, Sparkles, Search, FileEdit } from "lucide-react";
import Link from "next/link";

export default function ProofContractHeader({
  roleTitle,
  company,
  status,
  id,
  isComplete = true,
  missingFields = [],
  onRegenerate,
  regenerating,
  onStartSourcing,
  starting,
}) {
  const rawStatus = status ? String(status).toUpperCase().trim() : null;
  const validStatuses = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"];
  const displayStatus = rawStatus && validStatuses.includes(rawStatus) ? rawStatus : "STATUS UNAVAILABLE";

  return (
    <header className="border-b border-[#343434] bg-[#111111] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <Link
          href="/employer"
          className="p-2 rounded-lg border border-[#343434] bg-[#1A1A1A] text-[#A3A3A3] hover:text-[#F2F2F2] hover:border-[#10D97A]/40 transition-colors"
          aria-label="Return to dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold text-[#F2F2F2] tracking-tight">
              {roleTitle || "Hiring Brief / Proof Contract"}
            </h1>
            {/* Persisted Hiring-Run Status Badge */}
            <span
              className={`px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-medium uppercase tracking-wider ${
                displayStatus === "DRAFT"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                  : displayStatus === "ACTIVE"
                  ? "border-[#10D97A]/30 bg-[#10D97A]/10 text-[#10D97A]"
                  : displayStatus === "PAUSED"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  : displayStatus === "COMPLETED"
                  ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                  : displayStatus === "ARCHIVED"
                  ? "border-zinc-700 bg-zinc-800 text-zinc-400"
                  : "border-rose-500/40 bg-rose-500/10 text-rose-400"
              }`}
              data-testid="brief-status"
            >
              {displayStatus}
            </span>

            {/* Proof-Contract Readiness Badge */}
            <span
              className={`px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-medium uppercase tracking-wider ${
                isComplete
                  ? "border-[#10D97A]/30 bg-[#10D97A]/10 text-[#10D97A]"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-300"
              }`}
              data-testid="contract-readiness-badge"
            >
              {isComplete ? "PROOF CONTRACT COMPLETE" : "SOURCING BLOCKED"}
            </span>
          </div>
          <p className="text-xs text-[#A3A3A3] mt-0.5">
            {company ? `${company} · ` : ""}Proof Contract & Sourcing Blueprint
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {!isComplete ? (
          <Link
            href={`/employer/intake?id=${id}`}
            className="px-4 py-2 rounded-lg border border-amber-500/50 bg-amber-500 text-xs font-semibold text-[#0E0E0E] hover:bg-amber-400 flex items-center gap-1.5 transition-all shadow-sm"
            data-testid="complete-intake-btn"
          >
            <FileEdit className="h-3.5 w-3.5" />
            Complete Role Intake
          </Link>
        ) : (
          <>
            <Link
              href={`/employer/intake?id=${id}`}
              className="px-3 py-1.5 rounded-lg border border-[#343434] bg-[#1A1A1A] text-xs font-medium text-[#F2F2F2]/80 hover:text-[#F2F2F2] hover:border-[#343434]/80 flex items-center gap-1.5 transition-all"
              data-testid="edit-intake-btn"
            >
              <Search className="h-3.5 w-3.5" />
              Edit Intake
            </Link>
            <button
              type="button"
              onClick={onRegenerate}
              disabled={regenerating || starting}
              className="px-3 py-1.5 rounded-lg border border-[#343434] bg-[#1A1A1A] text-xs font-medium text-[#F2F2F2]/80 hover:text-[#F2F2F2] hover:border-[#343434]/80 flex items-center gap-1.5 transition-all disabled:opacity-50"
              data-testid="regenerate-brief-btn"
            >
              <Sparkles className={`h-3.5 w-3.5 ${regenerating ? "animate-spin" : ""}`} />
              {regenerating ? "Regenerating..." : "Refresh Brief"}
            </button>
            <button
              type="button"
              onClick={onStartSourcing}
              disabled={starting || regenerating}
              className="px-3 py-1.5 rounded-lg border border-[#10D97A]/40 bg-[#10D97A] text-xs font-semibold text-[#0E0E0E] hover:bg-[#10D97A]/90 flex items-center gap-1.5 transition-all disabled:opacity-50"
              data-testid="start-sourcing-btn"
            >
              <Zap className={`h-3.5 w-3.5 ${starting ? "animate-spin" : ""}`} />
              {starting ? "Starting..." : "Start Sourcing Session"}
            </button>
          </>
        )}
      </div>
    </header>
  );
}
