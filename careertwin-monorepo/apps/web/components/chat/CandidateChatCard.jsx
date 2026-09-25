"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";

export default function CandidateChatCard({ artifact, onNavigate }) {
  if (!artifact || !artifact.title || !artifact.type || !artifact.href) {
    return null;
  }

  const { title, type, href, summary } = artifact;

  return (
    <div className="mt-3 p-4 rounded-xl border border-[#343434] bg-[#1A1A1A] hover:border-[#10D97A]/40 transition-all flex items-center justify-between gap-4 max-w-md shadow-lg">
      <div className="space-y-1 min-w-0">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#10D97A] shrink-0" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-white/40 border-l border-white/10 pl-2">
            {type}
          </span>
        </div>
        <p className="text-xs font-semibold text-[#F2F2F2] truncate">{title}</p>
        {summary && (
          <p className="text-[11px] text-[#4A4A4A] line-clamp-2 leading-relaxed">{summary}</p>
        )}
      </div>

      <Link
        href={href}
        onClick={(e) => {
          if (onNavigate) {
            e.preventDefault();
            onNavigate(href);
          }
        }}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#10D97A]/10 border border-[#10D97A]/30 text-[#10D97A] text-[11px] font-mono font-medium hover:bg-[#10D97A]/20 transition-colors shrink-0"
      >
        <span>Open</span>
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
