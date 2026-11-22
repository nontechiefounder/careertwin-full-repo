"use client";

import { FileText } from "lucide-react";

export default function EvidenceCitation({ evidenceRef, onSelectRef }) {
  if (!evidenceRef) return null;

  const filename = evidenceRef.filename || "resume";
  const triggerId = `evidence-citation-trigger-${evidenceRef.id || filename.replace(/[^a-z0-9]/gi, '_')}`;

  let pageStr = null;
  if (typeof evidenceRef.locator === "object" && evidenceRef.locator?.page != null) {
    pageStr = `(Page ${evidenceRef.locator.page})`;
  } else if (typeof evidenceRef.locator === "string" && evidenceRef.locator.includes("Page")) {
    pageStr = `(${evidenceRef.locator})`;
  }

  return (
    <button
      type="button"
      id={triggerId}
      aria-label={`View evidence source citation for ${filename}`}
      onClick={(e) => {
        const btn = e.currentTarget;
        if (btn) btn.focus();
        onSelectRef(evidenceRef, btn);
      }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-white/10 bg-white/[0.03] hover:bg-white/[0.08] hover:border-[#00D604]/40 text-xs font-mono text-white/80 transition-all focus:outline-none focus:ring-2 focus:ring-[#00D604]/50 cursor-pointer"
    >
      <FileText className="h-3.5 w-3.5 text-[#00D604]" aria-hidden="true" />
      <span className="truncate max-w-[180px]">{filename}</span>
      {pageStr && <span className="text-white/40 font-normal ml-0.5">{pageStr}</span>}
    </button>
  );
}
