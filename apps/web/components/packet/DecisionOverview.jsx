"use client";

import { Activity, ShieldCheck, PieChart, AlertCircle, CheckCircle } from "lucide-react";

export default function DecisionOverview({ evaluationMetrics, fitScore, proofStrength }) {
  const metrics = evaluationMetrics || {};
  const fitDist = metrics.role_fit_distribution;
  const fitLabel = metrics.role_fit_label;

  const proofVal = metrics.proof_strength != null ? metrics.proof_strength : (proofStrength != null ? proofStrength : null);
  const proofCoverage = metrics.proof_coverage != null ? metrics.proof_coverage : null;
  const uncertainty = metrics.uncertainty != null ? metrics.uncertainty : null;
  const gatePass = metrics.gate_pass;

  return (
    <section
      aria-label="Decision Overview & Proof Metrics"
      className="rounded-2xl border border-white/[0.08] bg-[#111111] p-6 space-y-5 shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#00D604]" aria-hidden="true" />
          <h2 className="text-xs font-mono font-bold tracking-[0.15em] uppercase text-white/90">
            Decision Overview & Proof Metrics
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Role-Fit Distribution */}
        <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono tracking-wider uppercase text-white/40 flex items-center gap-1.5">
              <PieChart className="h-3 w-3 text-blue-400" />
              Role-Fit Distribution
            </span>
            <span className="text-xs font-mono font-bold text-white/90">
              {fitLabel || "Not available"}
            </span>
          </div>
          {fitDist ? (
            <div className="space-y-1 pt-1" data-testid="role-fit-distribution-container">
              <div className="flex items-center justify-between text-[10px] font-mono text-white/60">
                <span>Strong (p_strong):</span>
                <span className="text-[#00D604]">{fitDist.p_strong != null ? `${(fitDist.p_strong * 100).toFixed(0)}%` : "Not available"}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-white/60">
                <span>Moderate (p_mod):</span>
                <span className="text-blue-400">{fitDist.p_moderate != null ? `${(fitDist.p_moderate * 100).toFixed(0)}%` : "Not available"}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-white/60">
                <span>Limited (p_lim):</span>
                <span className="text-amber-400">{fitDist.p_limited != null ? `${(fitDist.p_limited * 100).toFixed(0)}%` : "Not available"}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-white/60">
                <span>Low (p_low):</span>
                <span className="text-rose-400">{fitDist.p_low != null ? `${(fitDist.p_low * 100).toFixed(0)}%` : "Not available"}</span>
              </div>
            </div>
          ) : (
            <p className="text-[10px] font-mono text-white/30 pt-1">Not available</p>
          )}
        </div>

        {/* 2. Proof Strength */}
        <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono tracking-wider uppercase text-white/40 flex items-center gap-1.5">
              <ShieldCheck className="h-3 w-3 text-[#00D604]" />
              Proof Strength
            </span>
            <span className="text-xs font-mono font-bold text-[#00D604]">
              {proofVal != null ? proofVal.toFixed(2) : "Not available"}
            </span>
          </div>
          {proofVal != null ? (
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mt-3">
              <div
                className="h-full bg-[#00D604] rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, proofVal * 100))}%` }}
              />
            </div>
          ) : (
            <p className="text-[10px] font-mono text-white/30 pt-1">Not available</p>
          )}
        </div>

        {/* 3. Proof Coverage */}
        <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono tracking-wider uppercase text-white/40 flex items-center gap-1.5">
              <CheckCircle className="h-3 w-3 text-blue-400" />
              Proof Coverage
            </span>
            <span className="text-xs font-mono font-bold text-white/90">
              {proofCoverage != null ? `${(proofCoverage * 100).toFixed(0)}%` : "Not available"}
            </span>
          </div>
          {proofCoverage != null ? (
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mt-3">
              <div
                className="h-full bg-blue-400 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, proofCoverage * 100))}%` }}
              />
            </div>
          ) : (
            <p className="text-[10px] font-mono text-white/30 pt-1">Not available</p>
          )}
        </div>

        {/* 4. Candidate Uncertainty */}
        <div className="p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono tracking-wider uppercase text-white/40 flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3 text-amber-400" />
              Uncertainty
            </span>
            <span className="text-xs font-mono font-bold text-amber-400">
              {uncertainty != null ? uncertainty.toFixed(2) : "Not available"}
            </span>
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="text-[10px] font-mono text-white/50">Gate Status:</span>
            <span className={`text-[10px] font-mono font-bold ${gatePass === true ? "text-[#00D604]" : gatePass === false ? "text-amber-400" : "text-white/40"}`}>
              {gatePass === true ? "Passed" : gatePass === false ? "Review Needed" : "Not available"}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
