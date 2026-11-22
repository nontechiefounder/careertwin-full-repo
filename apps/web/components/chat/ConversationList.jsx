"use client";

import { useEffect, useRef } from "react";
import UserMessage from "./UserMessage";
import AssistantMessage from "./AssistantMessage";
import ChatLoadingState from "./ChatLoadingState";
import ChatEmptyState from "./ChatEmptyState";

export default function ConversationList({
  messages = [],
  isSubmitting = false,
  onSelectSuggestion,
  onNavigate,
  onOpenArtifact,
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSubmitting]);

  if (messages.length === 0 && !isSubmitting) {
    return <ChatEmptyState onSelectSuggestion={onSelectSuggestion} />;
  }

  return (
    <div
      aria-label="Conversation Messages Stream"
      className="flex-1 overflow-y-auto px-6 py-6 space-y-4 scrollbar-hide"
    >
      {messages.map((msg, i) => {
        if (msg.role === "user") {
          return <UserMessage key={msg.id || i} message={msg} />;
        }
        return (
          <AssistantMessage
            key={msg.id || i}
            message={msg}
            onSelectSuggestion={onSelectSuggestion}
            onNavigate={onNavigate}
            onOpenArtifact={onOpenArtifact}
          />
        );
      })}

      {isSubmitting && <ChatLoadingState />}
      <div ref={bottomRef} />
    </div>
  );
}
