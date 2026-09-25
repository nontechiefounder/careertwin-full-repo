"use client";

import { User } from "lucide-react";

export default function UserMessage({ message }) {
  if (!message) return null;

  return (
    <div data-message-role="user" className="flex gap-3 flex-row-reverse animate-fade-in my-3">
      <div className="w-7 h-7 rounded-full bg-[#1A1A1A] border border-[#343434] flex items-center justify-center text-[10px] font-mono text-white/70 shrink-0 mt-0.5 shadow-sm">
        <User className="h-3.5 w-3.5" />
      </div>

      <div className="flex flex-col items-end gap-1 max-w-[80%]">
        <span className="text-[9px] text-[#4A4A4A] font-mono px-1">
          You · {message.time || "Just now"}
        </span>
        <div className="px-4 py-3 rounded-2xl rounded-tr-xs bg-[#1A1A1A] border border-[#343434] text-xs text-[#F2F2F2] leading-relaxed whitespace-pre-wrap shadow-md">
          {message.content}
        </div>
      </div>
    </div>
  );
}
