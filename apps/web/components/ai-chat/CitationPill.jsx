"use client";

import { FileText, ShieldCheck, ExternalLink, Bookmark, Check } from "lucide-react";
import { useState } from "react";

/**
 * Interactive Evidence Citation Pill & Rail
 * Inspired by kokonutd/ai-citations, vercel/sources & rmahammad/source-citation-rail
 */
export function CitationPill({ source, index }) {
  const [showTooltip, setShowTooltip] = useState(false);

  const getSourceIcon = (type) => {
    switch (type) {
      case "ROLE_BRIEF":
      case "MUST_HAVES":
        return <ShieldCheck className="h-3 w-3 text-[#00D604]" />;
      case "WORKFLOW_DOCUMENT":
        return <FileText className="h-3 w-3 text-blue-400" />;
      default:
        return <Bookmark className="h-3 w-3 text-emerald-400" />;
    }
  };

  const title = source.title || source.name || `Source ${index + 1}`;
  const excerpt = source.excerpt || source.summary || "Verified ground-truth context from active hiring workflow.";

  return (
    <div className="relative inline-block my-0.5 mr-1.5">
      <button
        type="button"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.10] text-[11px] font-mono text-white/80 hover:text-white transition-all cursor-pointer"
      >
        {getSourceIcon(source.type)}
        <span className="font-semibold text-[#00D604]">[{index + 1}]</span>
        <span className="truncate max-w-[130px]">{title}</span>
      </button>

      {showTooltip && (
        <div className="absolute bottom-full left-0 mb-2 w-64 p-3 rounded-xl bg-[#1a1a1a] border border-white/15 shadow-2xl text-xs z-50 pointer-events-none">
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-[#00D604] font-semibold uppercase tracking-wider mb-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            Verified Workflow Evidence
          </div>
          <div className="font-medium text-white/90 text-xs mb-1">{title}</div>
          <p className="text-[11px] text-white/50 leading-relaxed font-sans">{excerpt}</p>
        </div>
      )}
    </div>
  );
}

export function SourceRail({ sources = [] }) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-3 pt-2.5 border-t border-white/[0.06] space-y-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-white/40">
        <FileText className="h-3 w-3 text-[#00D604]" />
        Verified Grounding Sources ({sources.length})
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {sources.map((src, i) => (
          <CitationPill key={i} source={src} index={i} />
        ))}
      </div>
    </div>
  );
}

