"use client";

import { User } from "lucide-react";

export default function UserMessage({ message }) {
  if (!message) return null;

  return (
    <div
      data-message-role="user"
      className="flex items-center gap-3 pt-6 pb-2 animate-fade-in max-w-[740px] mx-auto w-full"
    >
      <div className="w-7 h-7 rounded-full bg-[#181818] border border-[#262626] flex items-center justify-center text-[#8D8D8D] shrink-0">
        <User className="h-3.5 w-3.5" />
      </div>

      <div className="text-[15px] font-medium text-[#E1E1E5] tracking-tight leading-snug break-words">
        {message.content}
      </div>
    </div>
  );
}
