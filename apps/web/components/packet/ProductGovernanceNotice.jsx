"use client";

import { ShieldCheck } from "lucide-react";

export default function ProductGovernanceNotice({ className = "" }) {
  return (
    <div
      role="region"
      aria-label="Product Governance Notice"
      className={`rounded-xl border border-white/[0.08] bg-[#111111] p-4 flex items-start gap-3 text-white/70 ${className}`}
    >
      <ShieldCheck className="h-5 w-5 text-[#00D604] shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="text-[11px] font-mono tracking-wider uppercase text-white/40 font-semibold">
          Product Governance Notice
        </p>
        <p className="text-xs text-white/80 leading-relaxed font-sans">
          workBYLiNE supports evidence review and interview prioritization. Hiring decisions remain with authorized human reviewers.
        </p>
      </div>
    </div>
  );
}
