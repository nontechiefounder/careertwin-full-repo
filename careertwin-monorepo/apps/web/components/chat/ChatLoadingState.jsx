"use client";

import { Loader2, Sparkles } from "lucide-react";

export default function ChatLoadingState() {
  return (
    <div className="flex gap-3 items-start my-4 animate-fade-in" aria-live="polite">
      <div className="w-7 h-7 rounded-full bg-[#10D97A]/10 border border-[#10D97A]/30 flex items-center justify-center text-[10px] font-mono text-[#10D97A] shrink-0 mt-0.5 shadow-sm">
        <Sparkles className="h-3.5 w-3.5" />
      </div>

      <div className="p-4 rounded-2xl rounded-tl-xs bg-[#111111] border border-[#343434]/60 text-xs text-[#F2F2F2] flex items-center gap-2 shadow-md">
        <Loader2 className="h-4 w-4 text-[#10D97A] animate-spin shrink-0" />
        <span className="font-mono text-white/70">Processing response...</span>
      </div>
    </div>
  );
}
