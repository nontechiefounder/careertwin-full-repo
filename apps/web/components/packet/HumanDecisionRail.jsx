"use client";

import { useState } from "react";
import { CheckCircle, Clock, XCircle, UserCheck } from "lucide-react";

export default function HumanDecisionRail({ extraction, onAction, actionLoading }) {
  const [rationale, setRationale] = useState("");
  const [rationaleError, setRationaleError] = useState("");
  const [isChangingDecision, setIsChangingDecision] = useState(false);

  const handleAction = (action) => {
    const trimmed = rationale ? rationale.trim() : "";
    if ((action === "hold" || action === "reject") && !trimmed) {
      setRationaleError("Please provide a decision rationale before putting on hold or rejecting.");
      return;
    }
    setRationaleError("");
    const effectiveRationale = trimmed || "Advanced to next stage after candidate review.";
    if (onAction) {
      onAction(action, effectiveRationale);
      setIsChangingDecision(false);
    }
  };
  const status = extraction?.status || "pending";
  const isAdvanced = status === "shortlisted" || status === "advanced";
  const isHold = status === "hold";
  const isRejected = status === "rejected";
  const hasExistingDecision = isAdvanced || isHold || isRejected;

  return (
    <section
      aria-label="Human Decision Rail"
      className="rounded-2xl border border-white/[0.08] bg-[#111111] p-6 space-y-4 shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-[#00D604]" aria-hidden="true" />
          <h2 className="text-xs font-mono font-bold tracking-[0.15em] uppercase text-white/90">
            Human Reviewer Decision & Action Rail
          </h2>
        </div>
        <span className="text-[10px] font-mono text-white/40">
          Human Oversight Gate
        </span>
      </div>

      {/* Current Decision Display */}
      {hasExistingDecision && !isChangingDecision ? (
        <div
          className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isAdvanced
              ? "bg-[#00D604]/10 border-[#00D604]/30 text-[#00D604]"
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
              <p data-testid="human-decision-status-banner" className="text-xs font-mono font-bold uppercase tracking-wider">
                Candidate {isAdvanced ? "Advanced to Interview" : isHold ? "Placed on Hold" : "Rejected"}
              </p>
              <p className="text-[10px] text-white/60 font-sans mt-0.5">
                {isAdvanced
                  ? "Candidate approved for technical interview prioritization."
                  : isHold
                  ? "Candidate packet saved on hold for secondary evidence review."
                  : "Candidate rejected by human reviewer."}
              </p>
              {(extraction?.decision_rationale || extraction?.decision_packet?.human_decision?.rationale) && (
                <div data-testid="reviewer-rationale-display" className="mt-2 text-[11px] font-mono text-white/80 bg-black/40 border border-white/10 rounded-lg p-2">
                  <span className="text-white/40 uppercase tracking-wider block text-[9px] mb-0.5 font-bold">Reviewer Rationale:</span>
                  {extraction.decision_rationale || extraction?.decision_packet?.human_decision?.rationale}
                </div>
              )}
              {extraction?.decision_packet?.human_decision?.requires_re_review && (
                <div data-testid="stale-review-warning" className="mt-2 text-[10px] font-mono text-amber-300 bg-amber-500/20 border border-amber-500/40 rounded-lg p-2">
                  ⚠️ <strong>Fresh Review Required:</strong> {extraction.decision_packet.human_decision.re_review_reason || "Evaluation revised since previous decision."}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsChangingDecision(true)}
              disabled={actionLoading}
              aria-label="Change decision"
              className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-[11px] font-mono text-white/80 hover:bg-white/10 disabled:opacity-40 transition-all focus:outline-none focus:ring-2 focus:ring-[#00D604]"
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

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="reviewer-rationale" className="text-[11px] font-mono text-white/70 block">
                Reviewer Decision Rationale: <span className="text-white/45 font-normal">(Optional for Advance · <span className="text-amber-400 font-semibold">*Required for Hold / Reject</span>)</span>
              </label>
              {rationaleError && (
                <span className="text-[10px] font-mono text-rose-400 font-semibold">{rationaleError}</span>
              )}
            </div>
            <textarea
              id="reviewer-rationale"
              rows={2}
              value={rationale}
              onChange={(e) => {
                setRationale(e.target.value);
                if (e.target.value.trim()) setRationaleError("");
              }}
              placeholder="Required notes or rationale for audit trail (e.g., Must-have requirements validated, zero blockers)..."
              className={`w-full text-xs font-sans bg-[#1A1A1A] border ${rationaleError ? 'border-rose-500/80 ring-1 ring-rose-500/50' : 'border-white/10'} rounded-xl p-2.5 text-white/90 placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-[#00D604]/50 resize-none`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => handleAction("advance")}
              disabled={actionLoading}
              aria-label="Advance candidate to interview"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#00D604]/40 bg-[#00D604]/15 text-xs font-mono font-bold text-[#00D604] hover:bg-[#00D604]/25 transition-all focus:outline-none focus:ring-2 focus:ring-[#00D604] disabled:opacity-40"
            >
              <CheckCircle className="h-4 w-4" />
              <span>Advance Candidate</span>
            </button>

            <button
              type="button"
              onClick={() => handleAction("hold")}
              disabled={actionLoading}
              aria-label="Place candidate on hold"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs font-mono font-bold text-amber-400 hover:bg-amber-500/20 transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-40"
            >
              <Clock className="h-4 w-4" />
              <span>Hold for Review</span>
            </button>

            <button
              type="button"
              onClick={() => handleAction("reject")}
              disabled={actionLoading}
              aria-label="Reject candidate"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs font-mono font-bold text-rose-400 hover:bg-rose-500/20 transition-all focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-40"
            >
              <XCircle className="h-4 w-4" />
              <span>Reject Candidate</span>
            </button>
          </div>

          {hasExistingDecision && isChangingDecision && (
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsChangingDecision(false);
                  setRationaleError("");
                }}
                className="text-[11px] font-mono text-white/50 hover:text-white transition-colors"
              >
                Cancel Change
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
