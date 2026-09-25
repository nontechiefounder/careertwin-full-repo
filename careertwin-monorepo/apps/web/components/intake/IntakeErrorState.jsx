"use client";

import { AlertTriangle } from "lucide-react";

export default function IntakeErrorState({ error }) {
  if (!error) return null;

  return (
    <div
      role="alert"
      className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 flex items-start gap-3 my-4 text-xs text-rose-300"
    >
      <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
      <div>
        <h4 className="font-semibold text-rose-300 mb-0.5">Role Intake Submission Error</h4>
        <p className="text-rose-300/80 leading-relaxed">{error}</p>
      </div>
    </div>
  );
}
