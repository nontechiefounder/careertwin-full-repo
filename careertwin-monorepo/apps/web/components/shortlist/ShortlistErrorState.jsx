"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ShortlistErrorState({ error, onRetry }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center p-10 text-center border border-rose-500/20 bg-rose-500/5 rounded-2xl my-8 max-w-lg mx-auto"
    >
      <div className="w-12 h-12 rounded-full border border-rose-500/30 bg-rose-500/10 flex items-center justify-center mb-4 text-rose-400">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold text-[#F2F2F2] mb-1">Failed to Load Shortlist</h3>
      <p className="text-xs text-rose-300/80 max-w-xs mb-6">
        {error || "An error occurred while retrieving candidate extractions for this hiring run."}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 rounded-lg border border-[#343434] bg-[#1A1A1A] text-xs font-medium text-[#F2F2F2] hover:border-[#10D97A]/40 hover:text-[#10D97A] transition-all flex items-center gap-2"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Retry Request
        </button>
      )}
    </div>
  );
}
