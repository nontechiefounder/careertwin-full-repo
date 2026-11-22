"use client";

import { useState } from "react";
import { RotateCcw, Copy, Check, ThumbsUp, ThumbsDown, Bookmark } from "lucide-react";
import { toast } from "sonner";

/**
 * Minimal 5-Icon Action Row (↻  ⧉  👍  👎  🔖)
 */
export default function MessageActions({ content, onPinToRubric, onRetry }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState(null); // 'like' | 'dislike'
  const [saved, setSaved] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Copied response to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy text");
    }
  };

  const handleFeedback = (type) => {
    setFeedback(type);
    toast.success(
      type === "like"
        ? "Marked as helpful hiring insight"
        : "Feedback noted for grounding alignment"
    );
  };

  const handleBookmark = () => {
    setSaved(!saved);
    if (onPinToRubric) {
      onPinToRubric();
    } else {
      toast.success(saved ? "Removed from saved insights" : "Saved insight to role rubric");
    }
  };

  return (
    <div className="flex items-center gap-1 pt-2 text-[#8D8D8D]">
      <button
        type="button"
        onClick={onRetry}
        className="p-1.5 rounded-lg hover:bg-[#181818] hover:text-[#E1E1E5] transition-colors"
        title="Regenerate response"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={handleCopy}
        className="p-1.5 rounded-lg hover:bg-[#181818] hover:text-[#E1E1E5] transition-colors"
        title="Copy response"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-[#00D604]" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>

      <button
        type="button"
        onClick={() => handleFeedback("like")}
        className={`p-1.5 rounded-lg hover:bg-[#181818] transition-colors ${
          feedback === "like" ? "text-[#00D604]" : "hover:text-[#E1E1E5]"
        }`}
        title="Helpful response"
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={() => handleFeedback("dislike")}
        className={`p-1.5 rounded-lg hover:bg-[#181818] transition-colors ${
          feedback === "dislike" ? "text-amber-400" : "hover:text-[#E1E1E5]"
        }`}
        title="Inaccurate or out-of-scope"
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        onClick={handleBookmark}
        className={`p-1.5 rounded-lg hover:bg-[#181818] transition-colors ${
          saved ? "text-[#00D604]" : "hover:text-[#E1E1E5]"
        }`}
        title="Bookmark insight"
      >
        <Bookmark className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
