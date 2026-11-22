"use client";

import { FileText } from "lucide-react";

export default function SourcePills({ sources = [], onSelectSource }) {
  if (!Array.isArray(sources) || sources.length === 0) return null;

  const validSources = sources.filter(s => s && (s.filename || s.title || s.id));
  if (validSources.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-2">
      <span className="text-[10px] font-mono uppercase tracking-wider text-white/40 flex items-center gap-1">
        <FileText className="h-3 w-3 text-[#00D604]" /> Attributable Sources:
      </span>
      {validSources.map((src, i) => {
        const title = src.filename || src.title || src.id;
        return (
          <span
            key={i}
            onClick={() => onSelectSource && onSelectSource(src)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#00D604]/30 bg-[#00D604]/[0.06] text-[10px] font-mono text-[#00D604] ${
              onSelectSource ? "cursor-pointer hover:bg-[#00D604]/[0.15]" : ""
            } transition-all`}
          >
            <span>{title}</span>
            {src.page != null && <span className="opacity-60">(p. {src.page})</span>}
          </span>
        );
      })}
    </div>
  );
}
