"use client";

import PromptComposer from "@/components/ai-chat/PromptComposer";

export default function PromptBar({
  input,
  onChange,
  onSubmit,
  isSubmitting,
  onAttachDoc,
  activeRoleTitle = "Target Role",
  conciseMode = false,
  onToggleConcise,
}) {
  return (
    <div className="shrink-0 bg-transparent pb-3 pt-1">
      <PromptComposer
        input={input}
        onChange={onChange}
        onSubmit={onSubmit}
        isSubmitting={isSubmitting}
        onAttachDoc={onAttachDoc}
        activeRoleTitle={activeRoleTitle}
        conciseMode={conciseMode}
        onToggleConcise={onToggleConcise}
      />
    </div>
  );
}
