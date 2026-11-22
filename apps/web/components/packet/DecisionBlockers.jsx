"use client";

import { AlertCircle, HelpCircle, ArrowRight, ShieldAlert } from "lucide-react";

export default function DecisionBlockers({ packet, missingProof = [] }) {
  const gaps = packet?.missing_proof || missingProof || [];

  return (
    <section
      aria-label="Decision Blockers & Minimum Missing Proof"
      className="rounded-2xl border border-amber-500/20 bg-[#111111] p-6 space-y-5 shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-400" aria-hidden="true" />
          <h2 className="text-xs font-mono font-bold tracking-[0.15em] uppercase text-amber-400">
            Decision Blockers & Minimum Missing Proof ({gaps.length} Gaps)
          </h2>
        </div>
        <span className="text-[10px] font-mono text-amber-400/70 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
          Human Verification Needed
        </span>
      </div>

      <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.03] flex items-start gap-2.5">
        <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-[11px] font-sans text-white/70 leading-relaxed">
          <strong className="text-amber-400 font-mono">Important:</strong> A missing proof blocker indicates a requirement gap requiring evidence verification or interview probe—it is NOT an automatic rejection signal.
        </p>
      </div>

      <div className="space-y-4">
        {gaps.map((gap, i) => {
          const title = gap.unproven_requirement || gap.title || "Not available";
          const gateType = gap.gate_type ? String(gap.gate_type).replace(/_/g, " ") : "PROOF GAP";
          const whyInsufficient = gap.why_insufficient || gap.reason || "Not available";
          const nextProof = gap.minimum_next_proof || gap.next_proof || "Not available";
          const probe = gap.interview_probe || gap.recommended_human_action || "Not available";

          return (
            <div
              key={i}
              className="p-5 rounded-xl border border-white/[0.08] bg-white/[0.02] space-y-3"
            >
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-xs font-semibold text-white/90 font-sans flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  {title}
                </h3>
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
                  {gateType}
                </span>
              </div>

              <p className="text-xs text-white/60 leading-relaxed font-sans pl-3 border-l border-amber-500/20">
                {whyInsufficient}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-white/[0.06]">
                <div className="space-y-1">
                  <span className="text-[9px] font-mono uppercase text-white/40 font-semibold flex items-center gap-1">
                    <HelpCircle className="h-3 w-3 text-blue-400" />
                    Minimum Sufficient Proof Required
                  </span>
                  <p className="text-xs font-mono text-white/80 leading-snug">
                    {nextProof}
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="text-[9px] font-mono uppercase text-white/40 font-semibold flex items-center gap-1">
                    <ArrowRight className="h-3 w-3 text-[#00D604]" />
                    Recommended Interview Probe
                  </span>
                  <p className="text-xs font-mono text-[#00D604] leading-snug">
                    {probe}
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        {gaps.length === 0 && (
          <div className="p-6 text-center border border-dashed border-white/10 rounded-xl">
            <p className="text-xs text-white/40 italic">
              No decision blockers were supplied in this packet.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
