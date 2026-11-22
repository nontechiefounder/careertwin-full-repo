"use client";

import { motion } from "motion/react";
import { Sparkles } from "lucide-react";

/**
 * Luminous Thinking Orb component inspired by larsen66/thinking-orbs and anark17r/ai-thiking-orb-and-input
 * Visualizes active AI cognition, tool reasoning, and synthesis phases.
 */
export default function ThinkingOrb({ size = "md", active = true, label = "Thinking..." }) {
  const sizeClasses = {
    sm: "w-5 h-5",
    md: "w-8 h-8",
    lg: "w-12 h-12",
  };

  return (
    <div className="flex items-center gap-3">
      <div className={`relative ${sizeClasses[size] || sizeClasses.md} flex items-center justify-center`}>
        {/* Outer ambient glow ring */}
        <motion.div
          animate={active ? { scale: [1, 1.35, 1], opacity: [0.3, 0.7, 0.3] } : { opacity: 0.2 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#00D604]/40 via-emerald-400/30 to-teal-500/30 blur-md"
        />

        {/* Rotating subtle particle orbit */}
        <motion.div
          animate={active ? { rotate: 360 } : {}}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="absolute -inset-1 rounded-full border border-dashed border-[#00D604]/40"
        />

        {/* Core luminous orb */}
        <motion.div
          animate={active ? { scale: [0.9, 1.08, 0.9] } : { scale: 1 }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className="relative z-10 w-full h-full rounded-full bg-gradient-to-br from-[#00D604] via-emerald-500 to-teal-600 shadow-[0_0_15px_rgba(0,214,4,0.5)] flex items-center justify-center text-black"
        >
          <Sparkles className="w-1/2 h-1/2 text-black animate-pulse" />
        </motion.div>
      </div>

      {label && (
        <div className="flex flex-col">
          <span className="text-xs font-mono font-medium text-white/90 tracking-wide flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#00D604] animate-ping" />
            {label}
          </span>
          <span className="text-[10px] font-mono text-white/40">Grounded to active role context</span>
        </div>
      )}
    </div>
  );
}

