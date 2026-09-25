"use client";

import { Send, Loader2 } from "lucide-react";

export default function PromptBar({ input, onChange, onSubmit, isSubmitting }) {
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isSubmitting && input.trim()) {
        onSubmit();
      }
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!isSubmitting && input.trim()) {
          onSubmit();
        }
      }}
      className="p-4 border-t border-[#343434]/40 bg-[#111111] shrink-0"
    >
      <div className="rounded-2xl border border-[#343434] bg-[#1A1A1A] focus-within:border-[#10D97A]/50 transition-all p-3 space-y-2">
        <label htmlFor="chat-prompt-input" className="sr-only">
          Ask a question about your hiring pipeline or candidate evidence
        </label>
        <textarea
          id="chat-prompt-input"
          data-testid="chat-input"
          value={input}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about candidate proof, role requirements, or pipeline readiness..."
          rows={2}
          disabled={isSubmitting}
          className="w-full bg-transparent text-xs text-[#F2F2F2] placeholder:text-[#4A4A4A] outline-none resize-none scrollbar-hide font-sans"
        />

        <div className="flex items-center justify-between pt-1 border-t border-[#343434]/30">
          <span className="text-[10px] font-mono text-[#4A4A4A]">
            Press <kbd className="px-1 py-0.5 rounded bg-[#111111] border border-[#343434]">Enter</kbd> to submit · <kbd className="px-1 py-0.5 rounded bg-[#111111] border border-[#343434]">Shift+Enter</kbd> for line break
          </span>

          <button
            type="submit"
            data-testid="chat-send-btn"
            aria-label="Submit Chat Prompt"
            disabled={isSubmitting || !input.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#10D97A] text-[#0E0E0E] text-xs font-mono font-semibold hover:bg-[#10D97A]/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Submitting...</span>
              </>
            ) : (
              <>
                <span>Send</span>
                <Send className="h-3 w-3" />
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
