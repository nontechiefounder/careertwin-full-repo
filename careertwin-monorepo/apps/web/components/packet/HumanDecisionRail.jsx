"use client";

import { CheckCircle, Clock, XCircle, UserCheck } from "lucide-react";

export default function HumanDecisionRail({ extraction, onAction, actionLoading }) {
  const status = extraction?.status || "pending";
  const isAdvanced = status === "shortlisted" || status === "advanced";
  const isHold = status === "hold";
  const isRejected = status === "rejected";

  return (
    <section
      aria-label="Human Decision Rail"
      className="rounded-2xl border border-white/[0.08] bg-[#111111] p-6 space-y-4 shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-[#10D97A]" aria-hidden="true" />
          <h2 className="text-xs font-mono font-bold tracking-[0.15em] uppercase text-white/90">
            Human Reviewer Decision & Action Rail
          </h2>
        </div>
        <span className="text-[10px] font-mono text-white/40">
          Human Oversight Gate
        </span>
      </div>

      {/* Current Decision Display */}
      {(isAdvanced || isHold || isRejected) ? (
        <div
          className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isAdvanced
              ? "bg-[#10D97A]/10 border-[#10D97A]/30 text-[#10D97A]"
              : isHold
              ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
              : "bg-rose-500/10 border-rose-500/30 text-rose-400"
          }`}
        >
          <div className="flex items-center gap-3">
            {isAdvanced && <CheckCircle className="h-5 w-5 shrink-0" />}
            {isHold && <Clock className="h-5 w-5 shrink-0" />}
            {isRejected && <XCircle className="h-5 w-5 shrink-0" />}
            <div>
              <p className="text-xs font-mono font-bold uppercase tracking-wider">
                Candidate {isAdvanced ? "Advanced to Interview" : isHold ? "Placed on Hold" : "Rejected"}
              </p>
              <p className="text-[10px] text-white/60 font-sans mt-0.5">
                {isAdvanced
                  ? "Candidate approved for technical interview prioritization."
                  : isHold
                  ? "Candidate packet saved on hold for secondary evidence review."
                  : "Candidate rejected by human reviewer."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onAction && onAction("advance")}
              disabled={actionLoading || isAdvanced}
              aria-label="Re-advance candidate"
              className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-[11px] font-mono text-white/80 hover:bg-white/10 disabled:opacity-40 transition-all focus:outline-none focus:ring-2 focus:ring-[#10D97A]"
            >
              Change Decision
            </button>
          </div>
        </div>
      ) : (
        /* Action Buttons */
        <div className="space-y-3">
          <p className="text-xs text-white/60 font-sans">
            Review the evidence claims, missing proof blockers, and interview probes above before recording your decision.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => onAction && onAction("advance")}
              disabled={actionLoading}
              aria-label="Advance candidate to interview"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#10D97A]/40 bg-[#10D97A]/15 text-xs font-mono font-bold text-[#10D97A] hover:bg-[#10D97A]/25 transition-all focus:outline-none focus:ring-2 focus:ring-[#10D97A] disabled:opacity-40"
            >
              <CheckCircle className="h-4 w-4" />
              <span>Advance Candidate</span>
            </button>

            <button
              type="button"
              onClick={() => onAction && onAction("hold")}
              disabled={actionLoading}
              aria-label="Place candidate on hold"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs font-mono font-bold text-amber-400 hover:bg-amber-500/20 transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-40"
            >
              <Clock className="h-4 w-4" />
              <span>Hold for Review</span>
            </button>

            <button
              type="button"
              onClick={() => onAction && onAction("reject")}
              disabled={actionLoading}
              aria-label="Reject candidate"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs font-mono font-bold text-rose-400 hover:bg-rose-500/20 transition-all focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-40"
            >
              <XCircle className="h-4 w-4" />
              <span>Reject Candidate</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
