"use client";

import { useState, useRef, useEffect } from "react";
import {
  ArrowUp,
  Search,
  Compass,
  RefreshCw,
  Square,
  Paperclip,
} from "lucide-react";

/**
 * Floating "Reply..." Pill Composer
 * Dark rounded-3xl box with bottom-left (Search + Compass) toggle pill
 * and bottom-right (Cycle + Circular ArrowUp / Stop Square) buttons.
 */
export default function PromptComposer({
  input,
  onChange,
  onSubmit,
  isSubmitting,
  onAttachDoc,
  activeRoleTitle = "Target Role",
  conciseMode = false,
  onToggleConcise,
}) {
  const textareaRef = useRef(null);
  const [searchGrounded, setSearchGrounded] = useState(true);
  const [modelIdx, setModelIdx] = useState(0);
  const modelNames = ["Gemini 3.8 Flash", "Deep Reasoning 2.0", "Role RAG Specialist"];

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isSubmitting && input.trim()) {
        onSubmit();
      }
    }
  };

  return (
    <div className="relative w-full max-w-[740px] mx-auto px-4">
      <div className="rounded-[24px] bg-[#161616] border border-[#262626] focus-within:border-[#383838] px-4 pt-3.5 pb-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.75)] transition-colors">
        <label htmlFor="chat-prompt-textarea" className="sr-only">
          Ask a question about your hiring pipeline
        </label>
        <textarea
          id="chat-prompt-textarea"
          ref={textareaRef}
          data-testid="chat-input"
          aria-label="Ask a question about your hiring pipeline"
          value={input}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Reply..."
          className="w-full resize-none bg-transparent text-[14px] text-[#E1E1E5] placeholder-[#6E6E73] focus:outline-none py-0.5 font-sans leading-relaxed"
          disabled={isSubmitting}
        />

        {/* Bottom Controls Bar */}
        <div className="flex items-center justify-between pt-2.5">
          {/* Bottom-Left: Dual-Icon Segmented Pill (Search + Deep/Concise) */}
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1 p-1 rounded-full bg-[#090909] border border-[#222222]">
              <button
                type="button"
                onClick={() => setSearchGrounded((prev) => !prev)}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                  searchGrounded
                    ? "bg-[#1C1912] text-[#F59E0B]"
                    : "text-[#8D8D8D] hover:text-[#E1E1E5]"
                }`}
                title={`Grounded Search: ${activeRoleTitle}`}
              >
                <Search className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => onToggleConcise && onToggleConcise()}
                data-testid="concise-mode-toggle"
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                  conciseMode
                    ? "bg-[#00D604]/15 text-[#00D604]"
                    : "text-[#8D8D8D] hover:text-[#E1E1E5]"
                }`}
                title={
                  conciseMode
                    ? "Concise Mode: ON"
                    : "Toggle Deep / Concise Mode"
                }
              >
                <Compass className="h-3.5 w-3.5" />
              </button>
            </div>

            {onAttachDoc && (
              <button
                type="button"
                onClick={onAttachDoc}
                className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#090909] border border-[#222222] text-[11px] text-[#8D8D8D] hover:text-[#E1E1E5] transition-colors truncate max-w-[220px]"
                title="Grounded Context · Click to attach or manage documents"
              >
                <Paperclip className="h-3 w-3 shrink-0" />
                <span className="truncate">{activeRoleTitle}</span>
              </button>
            )}
          </div>

          {/* Bottom-Right: Circular Model Switcher + Circular Send / Stop Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setModelIdx((i) => (i + 1) % modelNames.length)}
              className="w-8 h-8 rounded-full bg-[#090909] border border-[#262626] flex items-center justify-center text-[#8D8D8D] hover:text-[#E1E1E5] transition-colors"
              title={`Active Model: ${modelNames[modelIdx]}`}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              data-testid="chat-send-btn"
              onClick={onSubmit}
              disabled={isSubmitting || !input.trim()}
              aria-label={isSubmitting ? "Submitting..." : "Submit Chat Prompt"}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 ${
                isSubmitting
                  ? "bg-[#E1E1E5] text-[#030303] cursor-wait"
                  : input.trim()
                  ? "bg-[#E1E1E5] text-[#030303] hover:opacity-90"
                  : "bg-[#8D8D8D]/40 text-[#030303] opacity-60 cursor-not-allowed"
              }`}
              title={isSubmitting ? "Submitting..." : "Submit Chat Prompt"}
            >
              <span className="sr-only">
                {isSubmitting ? "Submitting..." : "Submit Chat Prompt"}
              </span>
              {isSubmitting ? (
                <Square className="h-3 w-3 fill-current" />
              ) : (
                <ArrowUp className="h-4 w-4 stroke-[2.5]" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
