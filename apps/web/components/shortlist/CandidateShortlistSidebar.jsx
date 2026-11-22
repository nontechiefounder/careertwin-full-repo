"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, PauseCircle, XCircle, ShieldCheck, Zap, ExternalLink, FileText, Loader2 } from "lucide-react";
import LinkedInIcon from "@/components/icons/LinkedInIcon";
import { resolveAuthoritativeFitScore, formatCanonicalScoreDecimal } from "@/lib/scoreUtils";

export default function CandidateShortlistSidebar({
  extraction,
  hiringRun,
  onAction,
  actionLoading = false
}) {
  const [rationale, setRationale] = useState("");
  const [activeAction, setActiveAction] = useState(null);

  if (!extraction) {
    return (
      <div className="flex flex-col h-full bg-[#0c0c0c] text-white p-5 font-sans justify-center items-center text-center">
        <FileText className="h-8 w-8 text-white/20 mb-2" />
        <p className="text-xs text-white/50">Select a candidate card to view context & evaluation brief</p>
      </div>
    );
  }

  const profile = extraction.candidate_profiles || {};
  const packet = extraction.decision_packet || {};
  const metrics = packet.evaluation_metrics || {};

  const name = profile.name || extraction.candidate_name || "Candidate";
  const role = profile.bio || profile.headline || extraction.current_role || null;
  const location = profile.location || extraction.location || null;
  const linkedInUrl = profile.resume_link || extraction.linkedin_url || null;

  const hasEvaluation = Boolean(packet && (packet.evaluation_timestamp || packet.id || packet.ledger_id));
  const fitScore = hasEvaluation
    ? resolveAuthoritativeFitScore(packet, extraction)
    : null;

  const proofStrength = hasEvaluation && metrics.proof_strength != null
    ? Number(metrics.proof_strength)
    : (hasEvaluation && extraction.proof_strength != null ? Number(extraction.proof_strength) : null);

  const readiness = metrics.decision_readiness || extraction.readiness_state || (hasEvaluation ? "EVALUATED" : "EVALUATION_NOT_STARTED");
  const isHighFit = fitScore != null && fitScore >= 0.8;

  const skills = Array.isArray(profile.skills) && profile.skills.length > 0
    ? profile.skills
    : (Array.isArray(packet.skills) ? packet.skills : []);

  const handleTriggerAction = async (actionType) => {
    setActiveAction(actionType);
    if (onAction) {
      await onAction(extraction.id, actionType, rationale);
    }
    setActiveAction(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#0c0c0c] text-white p-4 font-sans select-none overflow-y-auto scrollbar-hide space-y-4">
      {/* Header Info Card */}
      <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.07] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/35">
            Candidate Preview
          </span>
          <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-green-400">
            {extraction.status || "Pending Review"}
          </span>
        </div>

        <h3 className="text-sm font-semibold text-white/95 leading-tight">{name}</h3>
        {role && <p className="text-xs text-white/50 leading-snug">{role}</p>}
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
            <span className="text-[9px] font-mono text-white/30">External Link</span>
          </div>
        )}
      </div>

      {/* Fit Score & Proof Metrics */}
      <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.07] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/35">Fit Assessment</span>
          {fitScore != null ? (
            <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
              isHighFit ? "bg-green-500/15 text-green-400 border border-green-500/30" : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
            }`}>
              {formatCanonicalScoreDecimal(fitScore)}
            </span>
          ) : (
            <span className="text-[11px] font-mono text-white/40 px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08]">
              Unassessed
            </span>
          )}
        </div>

        <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${fitScore == null ? "bg-white/20" : isHighFit ? "bg-[#00D604]" : "bg-amber-400"}`}
            style={{ width: `${fitScore != null ? Math.min(100, Math.round(fitScore * 100)) : 0}%` }}
          />
        </div>

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
              readiness === "EVIDENCE READY" ? "text-green-400/90" : "text-amber-300/90"
            }`}>
              {readiness}
            </span>
          </div>
        </div>
      </div>

      {/* Matched Capabilities */}
      <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.07] space-y-2">
        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/35 block">
          Key Capabilities
        </span>
        {skills.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {skills.slice(0, 5).map((skill, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] text-white/70"
              >
                {skill}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-white/40 italic">No capabilities extracted yet.</p>
        )}
      </div>

      {/* Context Grounding Citation */}
      <div className="p-3 rounded-xl bg-blue-500/[0.04] border border-blue-500/20 text-[10px] text-blue-200/80 space-y-1">
        <span className="font-semibold text-blue-300 block">Authoritative Evidence Citation:</span>
        <p className="leading-relaxed">
          {Array.isArray(packet?.evidence_refs) && packet.evidence_refs.length > 0
            ? `Grounded in ${packet.evidence_refs.length} source-attributable evidence span(s) from ${packet.filename || "uploaded candidate document"} (Rev ${packet.ledger_revision || 1}).`
            : hasEvaluation
            ? `Evaluated against role contract (${hiringRun?.role_title || "Active Role"}). Open Decision Packet to inspect claims and missing-proof gaps.`
            : "Pending evaluation. Upload candidate documents and generate a Decision Packet for source-attributable citations."}
        </p>
      </div>

      {/* Reviewer Disposition Actions */}
      <div className="space-y-2 pt-1">
        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={() => handleTriggerAction("advance")}
            disabled={actionLoading}
            className="py-1.5 px-2 rounded-lg bg-[#00D604]/20 border border-[#00D604]/40 text-[#00D604] hover:bg-[#00D604]/30 text-[11px] font-medium transition-all flex items-center justify-center gap-1 disabled:opacity-50"
          >
            {actionLoading && activeAction === "advance" ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Advance
          </button>
          <button
            onClick={() => handleTriggerAction("hold")}
            disabled={actionLoading}
            className="py-1.5 px-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/70 hover:bg-white/[0.08] text-[11px] font-medium transition-all flex items-center justify-center gap-1 disabled:opacity-50"
          >
            {actionLoading && activeAction === "hold" ? <Loader2 className="h-3 w-3 animate-spin" /> : <PauseCircle className="h-3 w-3" />}
            Hold
          </button>
          <button
            onClick={() => handleTriggerAction("reject")}
            disabled={actionLoading}
            className="py-1.5 px-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-[11px] font-medium transition-all flex items-center justify-center gap-1 disabled:opacity-50"
          >
            {actionLoading && activeAction === "reject" ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
            Reject
          </button>
        </div>

        {/* View Decision Packet Button */}
        <Link
          href={`/employer/packet/${extraction.id}`}
          className="w-full py-2.5 px-3 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.12] text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5 mt-2 shadow-sm"
        >
          <FileText className="h-3.5 w-3.5 text-[#00D604]" />
          <span>View Decision Packet</span>
          <ArrowRight className="h-3.5 w-3.5 ml-auto" />
        </Link>

        {/* Continue in AI Copilot Chat Button */}
        <Link
          href={`/employer/chat?role_id=${hiringRun?.id || extraction.hiring_run_id || ""}&candidate_id=${extraction.id}`}
          className="w-full py-2 px-3 rounded-xl bg-[#00D604]/10 hover:bg-[#00D604]/15 border border-[#00D604]/25 text-[#00D604] font-medium text-xs transition-all flex items-center justify-center gap-1.5"
        >
          <span>Continue in AI Copilot Chat →</span>
        </Link>
      </div>
    </div>
  );
}

