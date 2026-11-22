"use client";

export default function ReadinessBadge({ readinessState, className = "" }) {
  if (!readinessState) {
    return (
      <span
        role="status"
        aria-label="Readiness state: READINESS UNAVAILABLE"
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/10 bg-white/[0.04] text-[10px] font-mono font-bold tracking-wider uppercase text-white/50 ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-white/40 shrink-0" aria-hidden="true" />
        READINESS UNAVAILABLE
      </span>
    );
  }

  const normalized = String(readinessState).toUpperCase().trim();

  let styles = null;

  if (normalized === "EVIDENCE READY") {
    styles = {
      label: "EVIDENCE READY",
      bg: "bg-[#00D604]/10",
      border: "border-[#00D604]/30",
      text: "text-[#00D604]",
    };
  } else if (normalized === "HUMAN REVIEW REQUIRED") {
    styles = {
      label: "HUMAN REVIEW REQUIRED",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      text: "text-amber-400",
    };
  } else if (normalized === "NEEDS PROOF") {
    styles = {
      label: "NEEDS PROOF",
      bg: "bg-blue-500/10",
      border: "border-blue-500/30",
      text: "text-blue-400",
    };
  } else if (normalized === "INSUFFICIENT EVIDENCE") {
    styles = {
      label: "INSUFFICIENT EVIDENCE",
      bg: "bg-rose-500/10",
      border: "border-rose-500/30",
      text: "text-rose-400",
    };
  }

  if (!styles) {
    return (
      <span
        role="status"
        aria-label="Readiness state: READINESS UNAVAILABLE"
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/10 bg-white/[0.04] text-[10px] font-mono font-bold tracking-wider uppercase text-white/50 ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-white/40 shrink-0" aria-hidden="true" />
        READINESS UNAVAILABLE
      </span>
    );
  }

  return (
    <span
      role="status"
      aria-label={`Readiness state: ${styles.label}`}
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-mono font-bold tracking-wider uppercase ${styles.bg} ${styles.border} ${styles.text} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
      {styles.label}
    </span>
  );
}
