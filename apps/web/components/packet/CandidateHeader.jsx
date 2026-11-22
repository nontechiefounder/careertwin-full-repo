"use client";

import ReadinessBadge from "./ReadinessBadge.jsx";
import { ShieldCheck, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function CandidateHeader({
  candidateName = "Not available",
  targetRole = "Not available",
  currentRole = "Not available",
  location = "Not available",
  readinessState,
  revision,
  evaluatedTimestamp,
  onOpenAuditDetails,
  roleId
}) {
  const formattedTimestamp = evaluatedTimestamp
    ? (typeof evaluatedTimestamp === "string" && evaluatedTimestamp.includes("Not available")
        ? "Not available"
        : new Date(evaluatedTimestamp).toUTCString())
    : "Not available";

  const cleanCurrentRole = typeof currentRole === "string" && currentRole.length > 50
    ? (currentRole.split(/\r?\n|\.\s+/)[0].slice(0, 50).trim() + "…")
    : currentRole;

  return (
    <header className="rounded-2xl border border-white/[0.08] bg-[#111111] p-6 space-y-4 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div className="flex items-center gap-3">
          {roleId && (
            <Link
              href={`/employer/shortlist/${roleId}`}
              className="p-2 rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/60 hover:text-white hover:border-[#00D604]/40 transition-colors inline-flex items-center gap-1.5 text-xs shrink-0"
              aria-label="Return to candidate shortlist"
              data-testid="return-to-shortlist-btn"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline font-mono">Shortlist</span>
            </Link>
          )}
          <div>
            <h1 className="text-2xl font-bold font-sans text-white tracking-tight">
              {candidateName}
            </h1>
            <p className="text-xs font-mono text-white/50 mt-1">
              Role: <span className="text-white/80 font-semibold">{targetRole}</span>
            </p>
          </div>
        </div>

        {/* Canonical Readiness State Badge */}
        <div className="flex items-center gap-3">
          <ReadinessBadge readinessState={readinessState} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between text-xs text-white/50 font-mono gap-3">
        <div className="flex items-center gap-4">
          <span>Current: <strong className="text-white/80">{cleanCurrentRole}</strong></span>
          <span>Location: <strong className="text-white/80">{location}</strong></span>
          <span title="Last evaluated timestamp">Evaluated: {formattedTimestamp}</span>
        </div>

        <div className="flex items-center gap-3">
          {revision != null && (
            <span className="text-[11px] text-white/40">
              REV {revision}
            </span>
          )}

          {/* Audit Details Drawer Trigger */}
          <button
            type="button"
            id="audit-details-trigger-btn"
            aria-label="View Audit Details drawer"
            onClick={(e) => {
              const btn = e.currentTarget;
              if (btn) btn.focus();
              onOpenAuditDetails(btn);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-xs font-mono font-medium text-white/80 hover:bg-white/[0.08] hover:text-white transition-all focus:outline-none focus:ring-2 focus:ring-[#00D604]/50 cursor-pointer"
          >
            <ShieldCheck className="h-3.5 w-3.5 text-[#00D604]" aria-hidden="true" />
            <span>View Audit Details</span>
          </button>
        </div>
      </div>
    </header>
  );
}
