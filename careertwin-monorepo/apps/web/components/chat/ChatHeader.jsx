"use client";

import { MessageSquare } from "lucide-react";

export default function ChatHeader({ activeRoleTitle }) {
  return (
    <header className="px-6 py-3.5 border-b border-[#343434]/50 bg-[#111111] flex items-center justify-between shrink-0 shadow-md">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-[#10D97A]/10 border border-[#10D97A]/30 flex items-center justify-center text-[#10D97A]">
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-[#F2F2F2] flex items-center gap-2">
            Hiring AI Assistant
            <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-white/60">
              Evidence-aware assistant
            </span>
          </h1>
          <p className="text-[11px] text-[#4A4A4A] font-mono">
            {activeRoleTitle ? `Active Context: ${activeRoleTitle}` : "Evidence-aware recruitment conversation"}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#343434] bg-[#1A1A1A] text-[10px] font-mono text-white/50">
          <span>Non-streaming chat</span>
        </div>
      </div>
    </header>
  );
}
