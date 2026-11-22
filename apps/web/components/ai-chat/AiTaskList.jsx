"use client";

import { CheckCircle2, Circle, Loader2, ArrowRight, ShieldCheck, Database, FileText, Search } from "lucide-react";

/**
 * AI Task List & Pipeline Status Component
 * Inspired by educalvolpz/ai-task-list & monolythdev/ai-agent-pipeline
 * Visualizes how multiple intakes funnel into ONE central processing hub.
 */
export default function AiTaskList({
  title = "Active Pipeline Verification Tasks",
  tasks = [
    { id: "t1", label: "Multi-Intake Parsing (JD + Rubric Docs)", status: "completed", intake: "Role Brief" },
    { id: "t2", label: "Semantic Knowledge Graph Synthesis", status: "completed", intake: "Evidence Engine" },
    { id: "t3", label: "Candidate Verification & Proof Profiling", status: "in_progress", intake: "Global Talent Graph" },
    { id: "t4", label: "Truthful Shortlist Contract Dispatch", status: "queued", intake: "Central Pipeline" }
  ]
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#141414] p-4 space-y-3">
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#00D604]" />
          <h4 className="text-xs font-semibold text-white/90 font-mono">{title}</h4>
        </div>
        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#00D604]/10 text-[#00D604] border border-[#00D604]/20">
          Unified Engine Active
        </span>
      </div>

      <div className="space-y-2">
        {tasks.map((task, idx) => (
          <div
            key={task.id || idx}
            className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/[0.04] text-xs"
          >
            <div className="flex items-center gap-2.5">
              {task.status === "completed" ? (
                <CheckCircle2 className="h-4 w-4 text-[#00D604] shrink-0" />
              ) : task.status === "in_progress" ? (
                <Loader2 className="h-4 w-4 text-[#00D604] animate-spin shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-white/20 shrink-0" />
              )}
              <span className={`font-medium ${task.status === "completed" ? "text-white/80" : task.status === "in_progress" ? "text-white font-semibold" : "text-white/40"}`}>
                {task.label}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/[0.04] text-white/50 border border-white/[0.06]">
                {task.intake}
              </span>
              <span className={`text-[10px] font-mono capitalize ${task.status === "completed" ? "text-[#00D604]" : task.status === "in_progress" ? "text-emerald-300 animate-pulse" : "text-white/30"}`}>
                {task.status.replace("_", " ")}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

