"use client";

import { Search, ChevronUp } from "lucide-react";

/**
 * Search Box Skeleton + Two-Dot Indicator
 */
export default function ChatLoadingState({ activeQuery = "Searching role rubric, candidate claims, and grounded hiring evidence..." }) {
  return (
    <div
      className="max-w-[740px] mx-auto w-full space-y-5 my-3 animate-fade-in"
      aria-live="polite"
    >
      {/* Search Accordion Skeleton Box */}
      <div className="rounded-xl border border-[#222222] bg-[#0c0c0c] p-3.5 space-y-3">
        {/* Top Search Query Bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Search className="h-3.5 w-3.5 text-[#8D8D8D] shrink-0" />
            <span className="text-[12px] text-[#8D8D8D] truncate">
              {activeQuery}
            </span>
          </div>
          <ChevronUp className="h-3.5 w-3.5 text-[#8D8D8D] shrink-0" />
        </div>

        {/* Row 1: 4 Visual Preview Card Skeletons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[88px] rounded-lg bg-[#1A1A1A] animate-pulse"
            />
          ))}
        </div>

        {/* Sources Pill Skeleton */}
        <div className="h-5 w-20 rounded-md bg-[#1A1A1A] animate-pulse" />

        {/* Row 2: 4 Source Card Skeletons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-[72px] rounded-lg border border-[#1E1E1E] bg-[#111111] p-2.5 flex flex-col justify-between"
            >
              <div className="space-y-1.5">
                <div className="h-2.5 w-full rounded bg-[#222222] animate-pulse" />
                <div className="h-2.5 w-2/3 rounded bg-[#222222] animate-pulse" />
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3.5 h-3.5 rounded-full bg-[#222222] animate-pulse shrink-0" />
                <div className="h-2 w-14 rounded bg-[#222222] animate-pulse" />
              </div>
            </div>
          ))}
          <div className="h-[72px] rounded-lg border border-[#1E1E1E] bg-[#111111] p-2.5 flex items-center justify-center">
            <div className="h-3 w-16 rounded bg-[#222222] animate-pulse" />
          </div>
        </div>
      </div>

      {/* Two-Dot Pulsing Indicator */}
      <div className="flex items-center gap-1 pl-1 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[#E1E1E5] animate-pulse" />
        <span
          className="w-1.5 h-1.5 rounded-full bg-[#E1E1E5] animate-pulse"
          style={{ animationDelay: "200ms" }}
        />
      </div>
    </div>
  );
}
