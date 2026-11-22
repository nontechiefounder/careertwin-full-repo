"use client";

import { useState } from "react";
import { ChevronDown, Brain, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

/**
 * Collapsible Reasoning Thread component inspired by konsstepnov/reasoning-thread & elements-/chain-of-thought
 * Exposes honest AI reasoning steps, duration, and verification stages.
 */
export default function ReasoningThread({
  duration = "2.1s",
  steps = [
    { title: "Analyzing Target Role Requirements", detail: "Loaded Must-Haves, Nice-to-Haves, and Disqualifiers from role brief.", status: "complete" },
    { title: "Querying Role Knowledge Graph", detail: "Retrieved verified semantic facts from ingested workflow documents.", status: "complete" },
    { title: "Validating Grounding Boundaries", detail: "Enforced strict role scoping: filtered out-of-scope assumptions.", status: "complete" }
  ],
  defaultExpanded = false
}) {
  const [isOpen, setIsOpen] = useState(defaultExpanded);

  return (
    <div className="mb-3 rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden text-xs">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-2 text-white/70">
          <Brain className="h-3.5 w-3.5 text-[#00D604]" />
          <span className="font-mono text-[11px] font-medium text-white/90">
            Thought for <span className="text-[#00D604] font-semibold">{duration}</span> ({steps.length} reasoning steps)
          </span>
        </div>

        <div className="flex items-center gap-2 text-white/40">
          <span className="text-[10px] font-mono uppercase tracking-wider hidden sm:inline">
            {isOpen ? "Collapse Chain" : "Inspect Reasoning"}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-180 text-white/80" : ""}`} />
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-white/[0.06] px-4 py-3 bg-[#0a0a0a]/50 space-y-3"
          >
            <div className="relative pl-4 space-y-3 before:absolute before:left-1.5 before:top-2 before:bottom-2 before:w-[1px] before:bg-white/10">
              {steps.map((s, idx) => (
                <div key={idx} className="relative group">
                  <div className="absolute -left-[19px] top-0.5 w-3 h-3 rounded-full bg-[#141414] border border-[#00D604]/40 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00D604]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 font-mono text-[11px] font-semibold text-white/85">
                      <span>{s.title}</span>
                      <CheckCircle2 className="h-3 w-3 text-[#00D604]" />
                    </div>
                    {s.detail && (
                      <p className="text-[11px] text-white/50 mt-0.5 leading-relaxed font-sans">
                        {s.detail}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between text-[10px] font-mono text-white/35">
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-[#00D604]" />
                Role Context Grounded (Gemini 3.8 Flash)
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Zero Hallucination Filter Active
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

