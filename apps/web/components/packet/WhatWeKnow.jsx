"use client";

import { CheckCircle, HelpCircle, AlertCircle, AlertTriangle, Layers } from "lucide-react";

function EvidenceCategoryBox({ title, items, color, border, bg, icon: Icon }) {
  if (!items || items.length === 0) return null;

  return (
    <div className={`p-4 rounded-xl border ${border} ${bg} space-y-2.5`}>
      <h3 className={`text-[10px] uppercase font-mono tracking-[0.15em] font-bold flex items-center gap-2 ${color}`}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {title} ({items.length})
      </h3>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-white/80 flex items-start gap-2 leading-relaxed font-sans">
            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 bg-current ${color}`} aria-hidden="true" />
            <span>{typeof item === 'string' ? item : item.claim_text || item.title}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function WhatWeKnow({ packet }) {
  const verified = packet?.what_is_verified || [];
  const inferred = packet?.what_is_inferred || [];
  const uncertain = packet?.what_remains_uncertain || [];
  const concerns = packet?.concerns || [];
  const conflicting = packet?.conflicting || [];

  const hasData = verified.length > 0 || inferred.length > 0 || uncertain.length > 0 || concerns.length > 0 || conflicting.length > 0;

  return (
    <section
      aria-label="Evidence Breakdown: What We Know"
      className="rounded-2xl border border-white/[0.08] bg-[#111111] p-6 space-y-5 shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-[#00D604]" aria-hidden="true" />
          <h2 className="text-xs font-mono font-bold tracking-[0.15em] uppercase text-white/90">
            Evidence Categorization & Provenance
          </h2>
        </div>
        <span className="text-[10px] font-mono text-white/40">
          Source Spans & Inferred Evidence
        </span>
      </div>

      {!hasData && (
        <div className="p-6 text-center border border-dashed border-white/10 rounded-xl">
          <p className="text-xs text-white/40 italic">
            No categorized evidence items found in this packet.
          </p>
        </div>
      )}

      {hasData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <EvidenceCategoryBox
            title="Supported Evidence"
            items={verified}
            color="text-[#00D604]"
            border="border-[#00D604]/20"
            bg="bg-[#00D604]/[0.02]"
            icon={CheckCircle}
          />
          <EvidenceCategoryBox
            title="Inferred Claims"
            items={inferred}
            color="text-blue-400"
            border="border-blue-500/20"
            bg="bg-blue-500/[0.02]"
            icon={HelpCircle}
          />
          <EvidenceCategoryBox
            title="Conflicting Evidence"
            items={conflicting}
            color="text-amber-400"
            border="border-amber-500/20"
            bg="bg-amber-500/[0.02]"
            icon={AlertTriangle}
          />
          <EvidenceCategoryBox
            title="Uncertain / Missing"
            items={uncertain}
            color="text-amber-400/90"
            border="border-amber-500/20"
            bg="bg-amber-500/[0.02]"
            icon={AlertCircle}
          />
          <EvidenceCategoryBox
            title="Key Risk Signals"
            items={concerns}
            color="text-rose-400"
            border="border-rose-500/20"
            bg="bg-rose-500/[0.02]"
            icon={AlertCircle}
          />
        </div>
      )}
    </section>
  );
}
