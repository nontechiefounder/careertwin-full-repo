"use client";

export default function PromptSuggestions({ suggestions = [], onSelect, onNavigate }) {
  if (!Array.isArray(suggestions) || suggestions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 pt-1.5" aria-label="Suggested Prompt Actions">
      {suggestions.map((s, i) => {
        const label = typeof s === "string" ? s : s.label || s.text;
        if (!label) return null;
        return (
          <button
            key={i}
            type="button"
            onClick={() => {
              if (typeof s === "object" && s.kind === "navigate" && s.href) {
                if (onNavigate) onNavigate(s.href);
              } else if (onSelect) {
                onSelect(typeof s === "object" ? s.text || s.label : s);
              }
            }}
            className="px-3 py-1.5 rounded-xl border border-[#343434] bg-[#1A1A1A] text-[11px] font-mono text-white/70 hover:text-[#00D604] hover:border-[#00D604]/40 hover:bg-[#00D604]/[0.05] transition-all"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
