"use client";

import { Sparkles } from "lucide-react";
import SourcePills from "./SourcePills";
import CandidateChatCard from "./CandidateChatCard";
import PromptSuggestions from "./PromptSuggestions";

function formatText(text) {
  if (!text || typeof text !== "string") return text;
  const parts = text.split(/(\*\*.*?\*\*|\[.*?\])/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <span
          key={i}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono border border-[#10D97A]/40 bg-[#10D97A]/10 text-[#10D97A] mx-0.5 font-semibold"
        >
          {part.slice(2, -2)}
        </span>
      );
    }
    if (part.startsWith("[") && part.endsWith("]")) {
      return (
        <span
          key={i}
          className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono border border-[#10D97A]/40 bg-[#10D97A]/10 text-[#10D97A] mx-0.5 font-semibold"
        >
          {part.slice(1, -1)}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function AssistantMessage({ message, onSelectSuggestion, onNavigate }) {
  if (!message) return null;

  const content = message.content || message.reply || "";
  const sources = Array.isArray(message.sources) ? message.sources : [];
  const artifact = message.artifact && typeof message.artifact === "object" ? message.artifact : null;
  const suggestions = Array.isArray(message.suggestions) ? message.suggestions : [];

  return (
    <div className="flex gap-3 items-start my-4 animate-fade-in" data-message-role="assistant">
      <div className="w-7 h-7 rounded-full bg-[#10D97A]/10 border border-[#10D97A]/30 flex items-center justify-center text-[10px] font-mono text-[#10D97A] shrink-0 mt-0.5 shadow-sm">
        <Sparkles className="h-3.5 w-3.5" />
      </div>

      <div className="flex-1 max-w-[85%] space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-semibold text-[#10D97A]">CareerTWiN AI</span>
          <span className="text-[9px] text-[#4A4A4A] font-mono">· {message.time || "Just now"}</span>
        </div>

        {/* Main message text */}
        <div className="p-4 rounded-2xl rounded-tl-xs bg-[#111111] border border-[#343434]/60 text-xs text-[#F2F2F2] leading-relaxed whitespace-pre-wrap shadow-md">
          {formatText(content)}
          {sources.length > 0 && <SourcePills sources={sources} />}
        </div>

        {/* Candidate / Role Artifact Card */}
        {artifact && artifact.title && artifact.type && artifact.href && (
          <CandidateChatCard artifact={artifact} onNavigate={onNavigate} />
        )}

        {/* Prompt Suggestions Chips */}
        {suggestions.length > 0 && (
          <PromptSuggestions suggestions={suggestions} onSelect={onSelectSuggestion} />
        )}
      </div>
    </div>
  );
}
