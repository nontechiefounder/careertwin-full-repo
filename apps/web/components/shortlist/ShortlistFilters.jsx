"use client";

import { Search, Filter, X } from "lucide-react";

export default function ShortlistFilters({
  readinessFilter,
  onReadinessChange,
  searchQuery,
  onSearchChange,
  totalResults,
  onClearFilters,
}) {
  const readinessOptions = [
    "ALL",
    "EVIDENCE READY",
    "HUMAN REVIEW REQUIRED",
    "NEEDS PROOF",
    "INSUFFICIENT EVIDENCE",
  ];

  const hasActiveFilters = readinessFilter !== "ALL" || (searchQuery && searchQuery.trim() !== "");

  return (
    <div className="border-b border-[#343434] bg-[#111111]/80 px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-mono text-[#A3A3A3] flex items-center gap-1 mr-1">
          <Filter className="h-3 w-3" /> Filter:
        </span>
        {readinessOptions.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onReadinessChange(opt)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-mono font-medium transition-all ${
              readinessFilter === opt
                ? "border border-[#00D604]/40 bg-[#00D604]/10 text-[#00D604]"
                : "border border-[#343434] bg-[#1A1A1A] text-[#F2F2F2]/80 hover:text-[#F2F2F2]"
            }`}
            data-testid={`filter-${opt.toLowerCase().replace(/\s+/g, '-')}`}
          >
            {opt}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="h-3.5 w-3.5 text-[#A3A3A3] absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search candidate name..."
            className="w-48 md:w-56 pl-8 pr-3 py-1 rounded-lg border border-[#343434] bg-[#1A1A1A] text-xs text-[#F2F2F2] placeholder:text-[#A3A3A3] focus:outline-none focus:border-[#00D604]/40"
            data-testid="candidate-search-input"
          />
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="px-2 py-1 rounded-md border border-[#343434] bg-[#1A1A1A] text-[10px] font-mono text-rose-400 hover:bg-rose-500/10 flex items-center gap-1 transition-all"
            data-testid="clear-filters-btn"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
        <span className="text-[10px] font-mono text-[#A3A3A3]">
          {totalResults} candidate{totalResults !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}
