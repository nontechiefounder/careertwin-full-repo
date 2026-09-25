"use client";

import { AlertOctagon, RotateCcw, ArrowLeft } from "lucide-react";

export default function PacketErrorState({ errorMessage, onRetry, shortlistUrl }) {
  return (
    <div
      role="alert"
      aria-label="Packet loading error"
      className="p-6 max-w-2xl mx-auto space-y-6 my-12"
    >
      <div className="rounded-2xl border border-rose-500/20 bg-[#111111] p-8 text-center space-y-5 shadow-2xl">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
          <AlertOctagon className="h-6 w-6" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white tracking-tight">
            Failed to Load Decision Packet
          </h2>
          <p className="text-xs text-rose-400/80 font-mono bg-rose-500/[0.05] p-3 rounded-xl border border-rose-500/10 max-w-md mx-auto">
            {errorMessage || "An unexpected error occurred while loading candidate packet data."}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl border border-[#10D97A]/40 bg-[#10D97A]/15 text-xs font-mono font-bold text-[#10D97A] hover:bg-[#10D97A]/25 transition-all focus:outline-none focus:ring-2 focus:ring-[#10D97A]"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Retry Fetching Packet</span>
            </button>
          )}

          {shortlistUrl && (
            <a
              href={shortlistUrl}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] text-xs font-mono text-white/80 hover:bg-white/[0.08] transition-all focus:outline-none focus:ring-2 focus:ring-white/40"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Shortlist</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
