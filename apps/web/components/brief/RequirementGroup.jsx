"use client";

import { CheckCircle2, AlertOctagon, Search, ShieldCheck } from "lucide-react";

export function getRequirementText(item) {
  if (item === null || item === undefined) return null;
  if (typeof item === "string") return item;
  if (typeof item === "number") return String(item);

  if (typeof item === "object") {
    const text = item.text || item.description || item.title || null;
    if (text != null && typeof text !== "object") return String(text);
  }

  return null;
}

export default function RequirementGroup({
  title,
  type = "must",
  items = [],
  emptyText = "Not available",
}) {
  let badgeStyles = "border-[#00D604]/30 bg-[#00D604]/10 text-[#00D604]";
  let label = "Must-have requirement";
  let Icon = CheckCircle2;

  if (type === "disqualifier") {
    badgeStyles = "border-rose-500/30 bg-rose-500/10 text-rose-400";
    label = "Disqualifier condition";
    Icon = AlertOctagon;
  } else if (type === "inferred") {
    badgeStyles = "border-blue-500/30 bg-blue-500/10 text-blue-400";
    label = "Evidence requirement";
    Icon = Search;
  } else if (type === "verification") {
    badgeStyles = "border-amber-500/30 bg-amber-500/10 text-amber-400";
    label = "Human review required";
    Icon = ShieldCheck;
  }

  const validItems = items
    .map(getRequirementText)
    .filter((text) => text !== null && text !== "");

  return (
    <div className="rounded-xl border border-[#343434] bg-[#111111] p-5 space-y-3" data-testid={`requirement-group-${type}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-[#F2F2F2] flex items-center gap-2">
          <Icon className="h-4 w-4 shrink-0" />
          {title}
        </h3>
        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-mono font-medium ${badgeStyles}`}>
          {label}
        </span>
      </div>

      {validItems.length === 0 ? (
        <p className="text-xs text-[#4A4A4A] italic">{emptyText}</p>
      ) : (
        <ul className="space-y-2" data-testid={`requirement-list-${type}`}>
          {validItems.map((text, idx) => (
            <li key={idx} className="flex items-start gap-2 text-xs text-[#F2F2F2]/75 leading-relaxed" data-testid={`requirement-item-${type}-${idx}`}>
              <span className="text-[#00D604] font-mono mt-0.5 shrink-0">•</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
