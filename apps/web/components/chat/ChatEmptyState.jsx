"use client";

import { Sparkles, FileSearch, ShieldCheck, Users } from "lucide-react";
import PromptSuggestions from "./PromptSuggestions";

export default function ChatEmptyState({ onSelectSuggestion }) {
  const suggestions = [
    "Give me a summary of my current hiring pipeline",
    "Show candidates ready for review",
    "Help me start sourcing candidates for Senior Backend role",
    "Who needs proof verification?",
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center my-auto animate-fade-in max-w-lg mx-auto space-y-6">
      <div className="w-12 h-12 rounded-2xl bg-[#00D604]/10 border border-[#00D604]/30 flex items-center justify-center text-[#00D604] shadow-lg">
        <Sparkles className="h-6 w-6" />
      </div>

      <div className="space-y-2">
        <h2 className="text-base font-semibold text-[#F2F2F2]">
          workBYLiNE Evidence-Aware Copilot
        </h2>
        <p className="text-xs text-white/50 leading-relaxed font-sans">
          Ask questions about candidate proof status, role requirements, evidence attribution, or pipeline readiness. All evaluation gates remain strictly deterministic.
        </p>
      </div>

      <div className="w-full space-y-2 text-left">
        <p className="text-[10px] font-mono uppercase tracking-wider text-[#00D604] font-bold">
          Suggested Actions
        </p>
        <PromptSuggestions suggestions={suggestions} onSelect={onSelectSuggestion} />
      </div>
    </div>
  );
}
