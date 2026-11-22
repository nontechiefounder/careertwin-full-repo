"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, PauseCircle, XCircle, ShieldCheck, Zap, ExternalLink, Loader2 } from "lucide-react";
import LinkedInIcon from "@/components/icons/LinkedInIcon";
import { resolveAuthoritativeFitScore, formatCanonicalScoreDecimal } from "@/lib/scoreUtils";

export default function CandidateBriefSidebar({
  candidate,
  packet,
  hiringRun,
  onAction,
  actionLoading = false,
  onLaunchScreening,
  screeningLoading = false,
  emails = [],
  shortlistUrl = "/employer/shortlist"
}) {
  const [rationale, setRationale] = useState("");
  const [rationaleError, setRationaleError] = useState("");
  const [activeAction, setActiveAction] = useState(null);
  const [isChangingDecision, setIsChangingDecision] = useState(false);

  const status = candidate?.status || packet?.human_decision?.status || "new";
  const decisionAction = packet?.human_decision?.action || (status === "shortlisted" || status === "advanced" ? "advance" : status === "hold" ? "hold" : status === "rejected" ? "reject" : null);
  const isAdvanced = decisionAction === "advance" || status === "shortlisted" || status === "advanced";
  const isHold = decisionAction === "hold" || status === "hold";
  const isRejected = decisionAction === "reject" || status === "rejected";
  const hasExistingDecision = isAdvanced || isHold || isRejected;
  const savedRationale = candidate?.decision_rationale || packet?.human_decision?.rationale || null;

  const name = candidate?.candidate_name || candidate?.candidate_profiles?.name || "Candidate";
  const role = candidate?.current_role || candidate?.candidate_profiles?.bio || candidate?.candidate_profiles?.headline || null;
  const company = candidate?.current_company || candidate?.candidate_profiles?.current_company || hiringRun?.company || null;
  const location = candidate?.location || candidate?.candidate_profiles?.location || null;
  const linkedInUrl = candidate?.candidate_profiles?.resume_link || candidate?.linkedin_url || null;

  const hasEvaluation = Boolean(packet && (packet.evaluation_timestamp || packet.id));
  const metrics = packet?.evaluation_metrics || {};
  const fitScore = hasEvaluation
    ? resolveAuthoritativeFitScore(packet, candidate)
    : null;

  const proofStrength = hasEvaluation
    ? (metrics.proof_strength != null
        ? Number(metrics.proof_strength)
        : (candidate?.proof_strength != null ? Number(candidate.proof_strength) : null))
    : null;

  const readiness = metrics.decision_readiness || candidate?.readiness_state || (hasEvaluation ? "EVALUATED" : "EVALUATION_NOT_STARTED");
  const isHighFit = fitScore != null && fitScore >= 0.8;

  const handleTriggerAction = async (actionType) => {
    const trimmed = rationale.trim();
    if ((actionType === "hold" || actionType === "reject") && !trimmed) {
      setRationaleError("Rationale is required before putting a candidate on hold or rejecting.");
      return;
    }
    setRationaleError("");
    const effectiveRationale = trimmed || "Advanced to next stage after candidate review.";
    setActiveAction(actionType);
    if (onAction) {
      await onAction(actionType, effectiveRationale);
      setIsChangingDecision(false);
    }
    setActiveAction(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#0c0c0c] text-white p-4 font-sans select-none overflow-y-auto scrollbar-hide space-y-5">
      {/* Back to Shortlist link */}
      <div>
        <Link
          href={shortlistUrl}
          className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Shortlist</span>
        </Link>
      </div>

      {/* Candidate Brief Header Card */}
      <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.07] space-y-2">
        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/35 block">
          Candidate Brief
        </span>
        <h2 className="text-sm font-semibold text-white/95 leading-tight">{name}</h2>
        {role && <p className="text-xs text-white/50 leading-snug">{role}</p>}
        {company && <p className="text-[11px] text-white/40">{company}</p>}
        {location && <p className="text-[11px] text-white/35">{location}</p>}

        {linkedInUrl && (
          <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
            <a
              href={linkedInUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#0A66C2] hover:text-[#0A66C2]/80 transition-colors"
            >
              <LinkedInIcon className="h-3.5 w-3.5 fill-current" />
              <span>Public Profile</span>
              <ExternalLink className="h-2.5 w-2.5 opacity-60" />
            </a>
            <span className="text-[9px] font-mono text-white/30 uppercase">External Link</span>
          </div>
        )}
      </div>

      {/* Fit Score & Proof Metrics */}
      <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.07] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/35">Fit Score</span>
          {fitScore != null ? (
            <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
              isHighFit ? "bg-green-500/15 text-green-400 border border-green-500/30" : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
            }`}>
              {formatCanonicalScoreDecimal(fitScore)}
            </span>
          ) : hasEvaluation ? (
            <span className="text-[11px] font-mono text-amber-300 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/25">
              Unverified (null)
            </span>
          ) : (
            <span className="text-[11px] font-mono text-white/40 px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08]">
              Pending
            </span>
          )}
        </div>

        <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isHighFit ? "bg-[#00D604]" : "bg-amber-400"}`}
            style={{ width: `${fitScore != null ? Math.min(100, Math.round(fitScore * 100)) : 0}%` }}
          />
        </div>

        {hasEvaluation && fitScore == null && (
          <p className="text-[10px] leading-relaxed text-amber-200/80 bg-amber-500/[0.06] border border-amber-500/20 rounded-lg px-2.5 py-2">
            Self-reported résumé claims lack external code/repo corroboration (`fit_score: null`, `gate_pass: false`). This indicates insufficient verification, not candidate unsuitability.
          </p>
        )}

        <div className="pt-2 border-t border-white/[0.06] grid grid-cols-2 gap-2 text-left">
          <div>
            <span className="text-[9px] font-mono text-white/30 block uppercase">Proof Strength</span>
            <span className="text-xs font-mono text-white/80 font-medium">
              {proofStrength != null ? `${(proofStrength * 100).toFixed(0)}%` : "—"}
            </span>
          </div>
          <div>
            <span className="text-[9px] font-mono text-white/30 block uppercase">Readiness</span>
            <span className={`text-[10px] font-mono font-medium truncate block ${
              readiness === "EVIDENCE READY"
                ? "text-green-400/90"
                : readiness === "EVALUATION_NOT_STARTED"
                ? "text-white/50"
                : "text-amber-300/90"
            }`}>
              {readiness}
            </span>
          </div>
        </div>
      </div>

      {/* Context Grounding Citation */}
      <div className="p-3 rounded-xl bg-blue-500/[0.04] border border-blue-500/20 text-[10px] text-blue-200/80 space-y-1">
        <span className="font-semibold text-blue-300 block">Authoritative Evidence Citation:</span>
        <p className="leading-relaxed">
          {packet
            ? "Grounded in evaluated candidate evidence and approved role rubric."
            : "Pending evaluation. Generate a decision packet to ground citations in role context."}
        </p>
      </div>

      {/* Recorded Decision & Next Steps OR Disposition Form */}
      {hasExistingDecision && !isChangingDecision ? (
        <div className="space-y-3 pt-1">
          <div className={`p-3.5 rounded-xl border space-y-2.5 ${
            isAdvanced
              ? "bg-[#00D604]/10 border-[#00D604]/30"
              : isHold
              ? "bg-amber-500/10 border-amber-500/30"
              : "bg-red-500/10 border-red-500/30"
          }`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`inline-flex items-center gap-1.5 text-xs font-mono font-bold uppercase ${
                isAdvanced ? "text-[#00D604]" : isHold ? "text-amber-400" : "text-red-400"
              }`}>
                {isAdvanced && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                {isHold && <PauseCircle className="h-4 w-4 shrink-0" />}
                {isRejected && <XCircle className="h-4 w-4 shrink-0" />}
                {isAdvanced ? "Candidate Advanced" : isHold ? "Placed on Hold" : "Candidate Rejected"}
              </span>
              <button
                type="button"
                onClick={() => setIsChangingDecision(true)}
                className="text-[10px] font-mono text-white/50 hover:text-white underline"
              >
                Change
              </button>
            </div>

            {savedRationale && (
              <div className="p-2 rounded-lg bg-black/40 border border-white/[0.08] text-[11px] text-white/80 font-sans">
                <span className="text-[9px] font-mono uppercase tracking-wider text-white/40 block mb-0.5">
                  Saved Rationale
                </span>
                {savedRationale}
              </div>
            )}

            {isAdvanced && (
              <div className="text-[10px] font-mono text-[#00D604]/90 bg-black/30 rounded-lg px-2.5 py-1.5 border border-[#00D604]/20">
                {Array.isArray(emails) && emails.length > 0
                  ? `✓ Outreach sequence queued (${emails.length} dry-run emails)`
                  : "✓ Ready for async screening & interview stage"}
              </div>
            )}
          </div>

          {/* Next Step Workflow CTAs */}
          <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-2.5">
            <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/45 block">
              Next Step Workflow
            </span>

            {isAdvanced && onLaunchScreening && (
              <button
                type="button"
                onClick={onLaunchScreening}
                disabled={screeningLoading}
                className="w-full py-2.5 px-3 rounded-xl bg-[#00D604] text-black font-semibold text-xs hover:bg-[#00D604]/90 transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {screeningLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5" />
                )}
                <span>Launch Async Screening</span>
              </button>
            )}

            {isAdvanced && (
              <Link
                href={`/employer/chat?role_id=${hiringRun?.id || candidate?.hiring_run_id || ""}&candidate_id=${candidate?.id || ""}`}
                className="w-full py-2 px-3 rounded-xl bg-white/[0.06] border border-white/[0.12] text-white/90 hover:text-white hover:bg-white/[0.1] font-medium text-xs transition-all flex items-center justify-center gap-1.5"
              >
                <span>Continue in AI Copilot Chat →</span>
              </Link>
            )}

            {!isAdvanced && (
              <Link
                href={`/employer/chat?role_id=${hiringRun?.id || candidate?.hiring_run_id || ""}&candidate_id=${candidate?.id || ""}`}
                className="w-full py-2 px-3 rounded-xl bg-white/[0.06] border border-white/[0.12] text-white/90 hover:text-white hover:bg-white/[0.1] font-medium text-xs transition-all flex items-center justify-center gap-1.5"
              >
                <span>Continue Packet Review in AI Chat →</span>
              </Link>
            )}

            {isAdvanced && (candidate?.candidate_id || candidate?.id) && (
              <Link
                href={`/candidate/status/${candidate?.candidate_id || candidate?.id}`}
                className="w-full py-2 px-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white/75 hover:text-white hover:bg-white/[0.07] font-medium text-xs transition-all flex items-center justify-center gap-1.5"
              >
                <span>View Candidate Status Timeline →</span>
              </Link>
            )}

            <Link
              href={shortlistUrl}
              className="w-full py-2 px-3 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white/75 hover:text-white hover:bg-white/[0.07] font-medium text-xs transition-all flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Review Next Candidate in Shortlist</span>
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Quick AI Chat Continuation Link */}
          <Link
            href={`/employer/chat?role_id=${hiringRun?.id || candidate?.hiring_run_id || ""}&candidate_id=${candidate?.id || ""}`}
            className="w-full py-2 px-3 rounded-xl bg-[#00D604]/10 border border-[#00D604]/25 text-[#00D604] hover:bg-[#00D604]/15 font-medium text-xs transition-all flex items-center justify-center gap-1.5"
          >
            <span>Continue Packet in AI Copilot Chat →</span>
          </Link>

          {/* Decision Rationale Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="sidebar-reviewer-rationale" className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/50 block">
                Reviewer Rationale
              </label>
              <span className="text-[9px] font-mono text-white/35">
                Optional for Advance · Required for Hold / Reject
              </span>
            </div>
            <textarea
              id="sidebar-reviewer-rationale"
              value={rationale}
              onChange={(e) => {
                setRationale(e.target.value);
                if (e.target.value.trim()) setRationaleError("");
              }}
              placeholder="Optional note for Advance; required justification for Hold or Reject..."
              rows={3}
              className={`w-full text-xs p-2.5 rounded-lg bg-white/[0.02] border ${rationaleError ? "border-red-500/80 ring-1 ring-red-500/40" : "border-white/[0.08]"} text-white placeholder-white/25 focus:outline-none focus:border-white/25 resize-none font-sans`}
            />
            {rationaleError && (
              <p className="text-[11px] text-red-400 font-medium" role="alert">
                {rationaleError}
              </p>
            )}
          </div>

          {/* Human Disposition Actions (SS3–SS4 reference) */}
          <div className="space-y-2 pt-1">
            <button
              onClick={() => handleTriggerAction("advance")}
              disabled={actionLoading}
              className="w-full py-2.5 px-3 rounded-xl bg-[#00D604] text-black font-semibold text-xs hover:bg-[#00D604]/90 transition-all flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              {actionLoading && activeAction === "advance" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              <span>Advance Candidate</span>
            </button>

            <button
              onClick={() => handleTriggerAction("hold")}
              disabled={actionLoading}
              className="w-full py-2 px-3 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white/80 hover:text-white hover:bg-white/[0.08] font-medium text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {actionLoading && activeAction === "hold" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <PauseCircle className="h-3.5 w-3.5" />
              )}
              <span>Put on Hold</span>
            </button>

            <button
              onClick={() => handleTriggerAction("reject")}
              disabled={actionLoading}
              className="w-full py-2 px-3 rounded-xl bg-transparent border border-red-500/30 text-red-400 hover:bg-red-500/10 font-medium text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {actionLoading && activeAction === "reject" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              <span>Reject Candidate</span>
            </button>

            {hasExistingDecision && (
              <button
                type="button"
                onClick={() => setIsChangingDecision(false)}
                className="w-full py-1.5 text-[11px] font-mono text-white/45 hover:text-white/80"
              >
                Cancel
              </button>
            )}
          </div>
        </>
      )}

      {/* Provenance Footer */}
      <div className="pt-3 border-t border-white/[0.05] text-[10px] text-white/30 space-y-1">
        <div>Role: <span className="text-white/60">{hiringRun?.role_title || "Role not specified"}</span></div>
        <div>Rubric: <span className="font-mono text-white/60">v{packet?.rubric_version || hiringRun?.rubric_version || "1.0.0"}</span></div>
      </div>
    </div>
  );
}
