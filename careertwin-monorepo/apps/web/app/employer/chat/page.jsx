"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import ChatShell from "@/components/chat/ChatShell";
import ChatHeader from "@/components/chat/ChatHeader";
import ConversationList from "@/components/chat/ConversationList";
import PromptBar from "@/components/chat/PromptBar";
import ChatErrorState from "@/components/chat/ChatErrorState";
import { MessageSquare, BarChart3, Plus, LogOut } from "lucide-react";
import { CTLogo } from "@/components/NaiveShell";

export default function ChatPage() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [messages, setMessages] = useState([]);
  const [errorMessage, setErrorMessage] = useState(null);
  const [lastSubmittedInput, setLastSubmittedInput] = useState("");
  const [runs, setRuns] = useState([]);
  const [activeRun, setActiveRun] = useState(null);
  const [orgId, setOrgId] = useState(null);

  // Fetch hiring runs for role & organization context
  useEffect(() => {
    api
      .get("/employer/analytics")
      .then((res) => {
        const r = res.data?.runs || [];
        setRuns(r);
        if (r.length > 0) {
          setActiveRun(r[0]);
          if (r[0].org_id) setOrgId(r[0].org_id);
        }
      })
      .catch(() => {});
  }, []);

  // Initial welcome message
  useEffect(() => {
    if (!user) return;
    const firstName = user.name?.split(" ")?.[0] || "there";
    const initialMsg = {
      id: "welcome_greeting",
      role: "assistant",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      content: `Hi ${firstName} 👋 I'm your CareerTWiN hiring AI assistant.\n\nI can help you review candidate proof packets, navigate active shortlists, and inspect hiring pipeline health.\n\nHow can I help you today?`,
      suggestions: [
        "Give me a summary of my current hiring pipeline",
        "Show candidates",
        "Open role intake"
      ],
    };
    setMessages((prev) => (prev.length > 0 ? prev : [initialMsg]));
  }, [user]);

  const handleSubmitPrompt = async (customPrompt) => {
    const msgText = (customPrompt || input).trim();
    if (!msgText || isSubmitting) return;

    setInput("");
    setErrorMessage(null);
    setLastSubmittedInput(msgText);
    setIsSubmitting(true);

    const userMsg = {
      id: `usr_${Date.now()}`,
      role: "user",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      content: msgText,
    };

    setMessages((prev) => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg && lastMsg.role === "user" && lastMsg.content === msgText) {
        return prev; // Prevent duplicate user bubble on retry
      }
      return [...prev, userMsg];
    });

    try {
      const payloadContext = {};
      const effectiveOrgId = orgId || activeRun?.org_id;
      if (effectiveOrgId) payloadContext.org_id = effectiveOrgId;
      if (activeRun?.id) payloadContext.active_run_id = activeRun.id;

      const res = await api.post("/employer/chat", {
        message: msgText,
        context: payloadContext,
      });

      const data = res.data || {};

      // Fail closed if reply is missing or non-string
      if (!data.reply || typeof data.reply !== "string" || data.reply.trim().length === 0) {
        throw new Error("Malformed API response: Missing reply text.");
      }

      const aiMsg = {
        id: `ai_${Date.now()}`,
        role: "assistant",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        content: data.reply,
        artifact: data.artifact || null,
        sources: Array.isArray(data.sources) ? data.sources : [],
        suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.log("[ChatPage] Error during chat submit caught:", err?.message || err);
      const apiErr = err.response?.data?.error;
      const apiNext = err.response?.data?.safe_next_action;

      if (apiErr === "ORGANIZATION_CONTEXT_REQUIRED") {
        setErrorMessage(apiNext || "Select an organization before using hiring chat.");
      } else if (apiErr === "CHAT_DATA_UNAVAILABLE") {
        setErrorMessage(apiNext || "Hiring chat data is temporarily unavailable. Please try again.");
      } else {
        setErrorMessage("Unable to connect to hiring chat service. Your message has been saved.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const sidebar = (
    <aside className="w-56 shrink-0 border-r border-[#343434]/40 bg-[#111111] flex flex-col justify-between p-4">
      <div className="space-y-6">
        <button onClick={() => router.push("/employer")} className="flex items-center gap-2.5 w-full text-left group">
          <CTLogo />
          <span className="text-xs font-semibold tracking-tight text-white/90 group-hover:text-[#10D97A] transition-colors font-mono">
            CareerTWiN
          </span>
        </button>

        <nav className="space-y-1">
          <button
            onClick={() => router.push("/employer/chat")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-[#10D97A]/10 border border-[#10D97A]/30 text-[#10D97A] text-xs font-mono font-medium"
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            <span>Chat V2</span>
          </button>

          <button
            onClick={() => router.push("/employer")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-white/60 hover:text-white hover:bg-white/[0.04] transition-all text-xs font-mono"
          >
            <BarChart3 className="h-4 w-4 shrink-0" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => router.push("/employer/intake")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-white/60 hover:text-white hover:bg-white/[0.04] transition-all text-xs font-mono"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>New Role</span>
          </button>
        </nav>
      </div>

      <div className="pt-4 border-t border-[#343434]/30 space-y-2">
        <p className="text-[10px] font-mono text-white/40 truncate">{user?.email || "Employer"}</p>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-[10px] font-mono text-white/40 hover:text-red-400 transition-colors"
        >
          <LogOut className="h-3 w-3" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );

  const header = (
    <ChatHeader
      activeRoleTitle={activeRun?.role_title}
    />
  );

  return (
    <ChatShell header={header} sidebar={sidebar}>
      {errorMessage && (
        <ChatErrorState
          errorMessage={errorMessage}
          lastSubmittedInput={lastSubmittedInput}
          onResend={(resendText) => handleSubmitPrompt(resendText)}
        />
      )}

      <ConversationList
        messages={messages}
        isSubmitting={isSubmitting}
        onSelectSuggestion={(promptText) => handleSubmitPrompt(promptText)}
        onNavigate={(targetPath) => router.push(targetPath)}
      />

      <PromptBar
        input={input}
        onChange={(val) => setInput(val)}
        onSubmit={() => handleSubmitPrompt()}
        isSubmitting={isSubmitting}
      />
    </ChatShell>
  );
}
