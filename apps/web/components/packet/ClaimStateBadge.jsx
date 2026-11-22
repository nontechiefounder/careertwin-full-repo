"use client";

export default function ClaimStateBadge({ claimState, className = "" }) {
  if (!claimState) {
    return (
      <span
        role="status"
        aria-label="Claim state: Not available"
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md border border-white/10 bg-white/[0.04] text-[9px] font-mono font-bold tracking-wide uppercase text-white/40 ${className}`}
      >
        <span className="w-1 h-1 rounded-full bg-white/40 shrink-0" aria-hidden="true" />
        Not available
      </span>
    );
  }

  const normalized = String(claimState).toUpperCase().trim();

  let styles = null;

  if (normalized === "SUPPORTED") {
    styles = {
      label: "SUPPORTED",
      bg: "bg-[#00D604]/10",
      border: "border-[#00D604]/30",
      text: "text-[#00D604]",
    };
  } else if (normalized === "INFERRED") {
    styles = {
      label: "INFERRED",
      bg: "bg-blue-500/10",
      border: "border-blue-500/30",
      text: "text-blue-400",
    };
  } else if (normalized === "UNSUPPORTED") {
    styles = {
      label: "UNSUPPORTED",
      bg: "bg-white/[0.04]",
      border: "border-white/[0.12]",
      text: "text-white/50",
    };
  } else if (normalized === "CONFLICTING") {
    styles = {
      label: "CONFLICTING",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      text: "text-amber-400",
    };
  }

  if (!styles) {
    return (
      <span
        role="status"
        aria-label="Claim state: Not available"
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md border border-white/10 bg-white/[0.04] text-[9px] font-mono font-bold tracking-wide uppercase text-white/40 ${className}`}
      >
        <span className="w-1 h-1 rounded-full bg-white/40 shrink-0" aria-hidden="true" />
        Not available
      </span>
    );
  }

  return (
    <span
      role="status"
      aria-label={`Claim state: ${styles.label}`}
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md border text-[9px] font-mono font-bold tracking-wide uppercase ${styles.bg} ${styles.border} ${styles.text} ${className}`}
    >
      <span className="w-1 h-1 rounded-full bg-current shrink-0" aria-hidden="true" />
      {styles.label}
    </span>
  );
}
