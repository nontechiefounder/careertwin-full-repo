"use client";

import { Cpu, ShieldCheck, Zap } from "lucide-react";

/**
 * AI Context & Grounding Quota Meter
 * Inspired by educalvolpz/ai-context-meter & syeddhasnainn/cost-meter
 */
export default function AiContextMeter({
  usedTokens = 14200,
  maxTokens = 1000000,
  groundingScore = 100,
  roleTitle = "Active Role"
}) {
  const percentUsed = Math.min(Math.round((usedTokens / maxTokens) * 100), 100);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-[#00D604]/10 border border-[#00D604]/20 flex items-center justify-center shrink-0">
          <Cpu className="h-4 w-4 text-[#00D604]" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-white/90 font-mono text-[11px]">{roleTitle} Context Window</span>
            <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-[#00D604]/15 text-[#00D604] border border-[#00D604]/30">
              {groundingScore}% Scoped
            </span>
          </div>
          <p className="text-[10px] text-white/40 mt-0.5">
            Strict refusal enforced for out-of-scope queries · Zero hallucination mode
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-[10px] font-mono text-white/40 uppercase">Tokens Cached</div>
          <div className="text-xs font-mono font-semibold text-white/80">
            {(usedTokens / 1000).toFixed(1)}k / {(maxTokens / 1000).toFixed(0)}k
          </div>
        </div>
        <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#00D604] to-emerald-400 rounded-full"
            style={{ width: `${Math.max(percentUsed, 5)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

