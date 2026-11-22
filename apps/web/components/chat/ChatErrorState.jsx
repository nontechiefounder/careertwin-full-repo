"use client";

import { AlertCircle, RefreshCw } from "lucide-react";

export default function ChatErrorState({ errorMessage, lastSubmittedInput, onResend }) {
  if (!errorMessage) return null;

  return (
    <div
      role="alert"
      data-testid="chat-error-alert"
      className="m-4 p-4 rounded-xl border border-red-500/30 bg-red-500/[0.05] text-xs text-red-300 space-y-2 animate-fade-in"
    >
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
        <span className="font-semibold">{errorMessage}</span>
      </div>

      {lastSubmittedInput && (
        <p className="text-[11px] text-white/60 font-mono italic bg-black/20 p-2 rounded border border-white/5">
          Saved Message: &quot;{lastSubmittedInput}&quot;
        </p>
      )}

      {onResend && lastSubmittedInput && (
        <button
          type="button"
          onClick={() => onResend(lastSubmittedInput)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-200 font-mono text-[11px] hover:bg-red-500/30 transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          <span>Resend Message</span>
        </button>
      )}
    </div>
  );
}
