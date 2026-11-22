"use client";

import { CheckCircle2 } from "lucide-react";

export default function IntakeSection({ step, activeStep, title, children }) {
  const isActive = step === activeStep;
  const isDone = step < activeStep;

  return (
    <div
      id={`step-${step}`}
      className={`rounded-xl border p-5 transition-all duration-200 ${isActive
          ? "border-[#00D604]/40 bg-[#1A1A1A]"
          : isDone
            ? "border-[#343434]/60 bg-[#111111]/80"
            : "border-[#343434]/40 bg-[#111111]/40"
        }`}
    >
      <div className="flex items-center gap-2.5 mb-4">
        <div
          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-mono font-semibold ${isDone
                ? "bg-[#00D604]/20 text-[#00D604] border border-[#00D604]/30"
                : isActive
                    ? "bg-[#00D604] text-[#0E0E0E] font-bold"
                    : "bg-[#1A1A1A] text-[#4A4A4A] border border-[#343434]"
          }`}
        >
          {isDone ? <CheckCircle2 className="h-3 w-3" /> : step}
        </div>
        <h2 className={`text-xs font-semibold ${isActive ? "text-[#F2F2F2]" : "text-[#F2F2F2]/60"}`}>
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}
