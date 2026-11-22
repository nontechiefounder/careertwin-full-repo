"use client";

import { Skeleton } from "@/components/ui/skeleton";

export default function PacketSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading candidate trust packet"
      className="p-6 max-w-4xl mx-auto space-y-6 animate-pulse"
    >
      {/* Header Skeleton */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#111111] p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1 max-w-md">
            <Skeleton className="h-4 w-32 bg-white/[0.06] rounded" />
            <Skeleton className="h-8 w-64 bg-white/[0.08] rounded-lg" />
            <Skeleton className="h-3 w-48 bg-white/[0.04] rounded" />
          </div>
          <Skeleton className="h-8 w-36 bg-white/[0.08] rounded-full" />
        </div>
      </div>

      {/* Metrics Skeleton Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Skeleton className="h-28 w-full rounded-2xl bg-white/[0.04]" />
        <Skeleton className="h-28 w-full rounded-2xl bg-white/[0.04]" />
        <Skeleton className="h-28 w-full rounded-2xl bg-white/[0.04]" />
        <Skeleton className="h-28 w-full rounded-2xl bg-white/[0.04]" />
      </div>

      {/* Claim Ledger Skeleton */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#111111] p-6 space-y-4">
        <Skeleton className="h-5 w-48 bg-white/[0.08] rounded" />
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-xl bg-white/[0.04]" />
          <Skeleton className="h-20 w-full rounded-xl bg-white/[0.04]" />
          <Skeleton className="h-20 w-full rounded-xl bg-white/[0.04]" />
        </div>
      </div>
    </div>
  );
}
