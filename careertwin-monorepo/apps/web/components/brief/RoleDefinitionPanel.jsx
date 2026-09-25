"use client";

import { MapPin, Building2, Layers } from "lucide-react";

export default function RoleDefinitionPanel({ summary, location, stage, company }) {
  const displayCompany = company || "Not available";
  const displayLocation = location || "Not available";
  const displayStage = stage || "Not available";

  return (
    <div className="rounded-xl border border-[#343434] bg-[#111111] p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-[#F2F2F2]">Role Definition & Scope</h2>
        <div className="flex items-center gap-2 flex-wrap text-xs text-[#4A4A4A]">
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#343434] bg-[#1A1A1A]" data-testid="brief-company">
            <Building2 className="h-3 w-3 text-[#10D97A]" />
            {displayCompany}
          </span>
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#343434] bg-[#1A1A1A]" data-testid="brief-location">
            <MapPin className="h-3 w-3 text-amber-400" />
            {displayLocation}
          </span>
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#343434] bg-[#1A1A1A] uppercase text-[10px] font-mono" data-testid="brief-company-stage">
            <Layers className="h-3 w-3 text-blue-400" />
            {displayStage}
          </span>
        </div>
      </div>
      <p className="text-xs text-[#F2F2F2]/70 leading-relaxed" data-testid="brief-summary">
        {summary || "Not available"}
      </p>
    </div>
  );
}
