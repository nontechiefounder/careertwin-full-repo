"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Send, Paperclip, Loader2, ChevronDown, ChevronRight,
  FileText, Zap, Users, CheckCircle2, Clock, Circle,
  ArrowRight, Sparkles, Plus, BarChart3, MessageSquare
} from "lucide-react";
import { CTLogo } from "@/components/NaiveShell";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger
} from "@/components/ui/collapsible";

// ── helpers ────────────────────────────────────────────────────────
const AGENT_ICONS = {
  sourcing:   "⚡",
  extractor:  "◎",
  scorer:     "≡",
  screener:   "◈",
  packager:   "◻",
};

function AgentDot({ status }) {
  if (status === "active")   return <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse-dot shrink-0" />;
  if (status === "idle")     return <span className="w-2 h-2 rounded-full bg-white/20 shrink-0" />;
  if (status === "done")     return <span className="w-2 h-2 rounded-full bg-white/40 shrink-0" />;
  return <span className="w-2 h-2 rounded-full bg-white/10 shrink-0" />;
}

function StatusPill({ status }) {
  const map = {
    active:    "bg-green-500/15 text-green-400 border-green-500/20",
    sourcing:  "bg-blue-500/15 text-blue-400 border-blue-500/20",
    reviewing: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    completed: "bg-white/[0.06] text-white/40 border-white/[0.08]",
    draft:     "bg-white/[0.04] text-white/30 border-white/[0.06]",
  };
  return (
    <span className={`text-[8px] font-mono tracking-[0.18em] uppercase px-1.5 py-0.5 rounded-full border ${map[status] || map.draft}`}>
      {status}
    </span>
  );
}

function ActionStep({ label, done, active }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {done   ? <CheckCircle2 className="h-3 w-3 text-green-400/70 shrink-0" />
       : active ? <Loader2 className="h-3 w-3 text-white/40 animate-spin shrink-0" />
       : <Circle className="h-3 w-3 text-white/15 shrink-0" />}
      <span className={`text-[11px] ${done ? "text-white/45 line-through" : active ? "text-white/65" : "text-white/25"}`}>
        {label}
      </span>
    </div>
  );
}

// ── Pixel Artifact Thumbnail (naive.ai style animated dot grid)
function PixelArtifact({ rows = 6, cols = 10, seed = 0 }) {
  const dots = useMemo(() => Array.from({ length: rows * cols }, (_, i) => ({
    id: i,
    delay: ((i * 0.17 + seed * 0.3) % 3).toFixed(2),
    sz: (i + seed) % 5 === 0 ? "w-1.5 h-1.5" : "w-1 h-1",
    op: (i + seed) % 4 === 0 ? "opacity-60" : (i + seed) % 2 === 0 ? "opacity-30" : "opacity-10",
  })), [rows, cols, seed]);
  return (
    <div className="w-full h-full bg-[#0a0a0a] flex items-center justify-center p-2">
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {dots.map(d => (
          <div key={d.id} className={`${d.sz} rounded-full bg-white ${d.op} pixel-pulse`}
            style={{ animationDelay: `${d.delay}s` }} />
        ))}
      </div>
    </div>
  );
}

function formatChatText(text, isUser) {
  if (isUser || !text || typeof text !== "string") return text;
  const parts = text.split(/(\*\*.*?\*\*|\[.*?\])/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono border border-[#10D97A]/40 bg-[#10D97A]/10 text-[#10D97A] mx-0.5 leading-none shadow-[0_0_10px_rgba(16,217,122,0.2)] font-semibold tracking-wide translate-y-[-1px]">{part.slice(2, -2)}</span>;
    }
    if (part.startsWith("[") && part.endsWith("]")) {
      return <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono border border-[#10D97A]/40 bg-[#10D97A]/10 text-[#10D97A] mx-0.5 leading-none shadow-[0_0_10px_rgba(16,217,122,0.2)] font-semibold tracking-wide translate-y-[-1px]">{part.slice(1, -1)}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}

// ── Message Bubble ─────────────────────────────────────────────────
function MessageBubble({ msg, onArtifactClick }) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const isUser = msg.role === "user";

  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""} animate-fade-in`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-[11px] shrink-0 mt-0.5">
          CT
        </div>
      )}

      <div className={`flex-1 max-w-[85%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1.5`}>
        {/* Timestamp */}
        <span className="text-[9px] text-white/20 font-mono px-1">
          {isUser ? "You" : "CareerTWiN AI"} · {msg.time}
        </span>

        {/* Actions completed pill */}
        {!isUser && msg.steps?.length > 0 && (
          <button
            type="button"
            onClick={() => setStepsOpen(o => !o)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.07] transition-all text-[10px] text-white/40"
          >
            <CheckCircle2 className="h-2.5 w-2.5 text-green-400" />
            {msg.steps.filter(s => s.done).length} action{msg.steps.filter(s => s.done).length !== 1 ? "s" : ""} completed
            <ChevronDown className={`h-2.5 w-2.5 transition-transform ${stepsOpen ? "rotate-180" : ""}`} />
          </button>
        )}

        {stepsOpen && msg.steps?.length > 0 && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5 space-y-0.5 w-full">
            {msg.steps.map((step, i) => (
              <ActionStep key={i} label={step.label} done={step.done} active={step.active} />
            ))}
          </div>
        )}

        {/* Message text */}
        <div className={`px-4 py-3 rounded-xl text-[13px] leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-white/[0.08] border border-white/[0.10] text-white/80 ml-auto"
            : "bg-transparent text-white/70"
        }`}>
          {formatChatText(msg.content, isUser)}
        </div>

        {/* Artifact card - with pixel thumbnail */}
        {!isUser && msg.artifact && (
          <div
            onClick={() => onArtifactClick?.(msg.artifact)}
            className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:border-white/[0.14] hover:bg-white/[0.05] cursor-pointer transition-all w-full group"
          >
            <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0">
              <PixelArtifact rows={5} cols={7} seed={(msg.artifact.title || "").length} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-white/70 truncate">{msg.artifact.title}</p>
              <p className="text-[9px] text-white/30 font-mono uppercase tracking-wider">{msg.artifact.type}</p>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-white/20 group-hover:text-white/50 transition-colors" />
          </div>
        )}

        {/* Approve Plan button */}
        {!isUser && msg.showApprove && msg.onApprove && (
          <button
            type="button"
            onClick={msg.onApprove}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/[0.12] border border-green-500/[0.20] text-green-400 text-[11px] font-medium hover:bg-green-500/[0.20] transition-all"
          >
            <CheckCircle2 className="h-3 w-3" /> Approve Plan
          </button>
        )}

        {/* Suggestion chips */}
        {!isUser && msg.chips?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            {msg.chips.map((chip, i) => (
              <button key={i} type="button" onClick={chip.action}
                className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[10px] text-white/45 hover:text-white/75 hover:border-white/[0.15] hover:bg-white/[0.07] transition-all">
                {chip.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Artifact Card ──────────────────────────────────────────────────
function ArtifactCard({ run, onClick, active }) {
  const pct = run.candidates_count > 0
    ? Math.round(((run.shortlisted_count || 0) / run.candidates_count) * 100)
    : 0;
  const seed = (run.id || 0) + (run.role_title || "").length;
  return (
    <div
      onClick={() => onClick(run)}
      className={`rounded-xl border cursor-pointer transition-all ${
        active ? "border-white/20 bg-white/[0.04]" : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.035]"
      }`}
    >
      {/* Pixel thumbnail */}
      <div className="h-[72px] w-full rounded-t-xl overflow-hidden">
        <PixelArtifact rows={5} cols={12} seed={seed} />
      </div>
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-white/80 truncate">{run.role_title}</p>
            {run.company && <p className="text-[10px] text-white/30 truncate">{run.company}</p>}
          </div>
          <StatusPill status={run.status || "draft"} />
        </div>
        <div className="flex items-center justify-between text-[9px] font-mono text-white/30 mb-1.5">
          <span>{run.candidates_count || 0} sourced</span>
          <span>{run.shortlisted_count || 0} shortlisted</span>
        </div>
        {run.candidates_count > 0 && (
          <div className="h-0.5 bg-white/[0.05] rounded-full overflow-hidden">
            <div className="h-full bg-white/40 rounded-full" style={{ width: `${pct}%` }} />
          </div>
        )}
        <p className="text-[9px] text-white/20 font-mono mt-1.5">
          {new Date(run.created_at || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </p>
      </div>
    </div>
  );
}

// ── Main Chat Page ─────────────────────────────────────────────────
export default function ChatPage() {
  const router  = useRouter();
  const path    = usePathname();
  const { user, logout } = useAuth();

  const [input,    setInput]    = useState("");
  const [sending,  setSending]  = useState(false);
  const [runs,     setRuns]     = useState([]);
  const [activeRun, setActiveRun] = useState(null);
  const [artifactTab, setArtifactTab] = useState("all");
  const [messages, setMessages] = useState([]);
  const chatEndRef = useRef(null);

  // ── Load hiring runs for artifacts panel ──────────────────────
  useEffect(() => {
    api.get("/employer/analytics").then(res => {
      const r = res.data?.runs || [];
      setRuns(r);
      if (r.length > 0) setActiveRun(r[0]);
    }).catch(() => {});
  }, []);

  // ── Send a message ─────────────────────────────────────────────
  const sendMessage = async (text) => {
    const msgText = text || input.trim();
    if (!msgText) return;
    setInput("");
    setSending(true);

    const userMsg = {
      id: Date.now(),
      role: "user",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      content: msgText,
    };
    setMessages(m => [...m, userMsg]);

    try {
      const res = await api.post("/employer/chat", {
        message: msgText,
        context: {
          active_run_id: activeRun?.id,
          runs_count: runs.length,
          user_name: user?.name,
        },
      });
      const data = res.data;
      const aiMsg = {
        id: Date.now() + 1,
        role: "assistant",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        content: data.reply || "I'm working on that for you.",
        steps: data.steps || [],
        artifact: data.artifact || null,
        showApprove: data.show_approve || false,
        chips: (data.suggestions || []).map(s => ({ label: s, action: () => sendMessage(s) })),
      };
      setMessages(m => [...m, aiMsg]);
    } catch (e) {
      const errMsg = {
        id: Date.now() + 1,
        role: "assistant",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        content: "I ran into an issue. Could you try again, or navigate to the relevant page directly?",
        chips: [
          { label: "Go to Dashboard", action: () => router.push("/employer") },
          { label: "Start new intake", action: () => router.push("/employer/intake") },
        ],
      };
      setMessages(m => [...m, errMsg]);
    } finally {
      setSending(false);
    }
  };

  // ── Greeting message from AI ──────────────────────────────────
  useEffect(() => {
    const firstName = user?.name?.split(" ")?.[0] || "there";
    const greeting = {
      id: "greeting",
      role: "assistant",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      content: `Hi ${firstName} 👋 I'm your CareerTWiN hiring AI.\n\nI can help you source candidates, review shortlists, generate hiring briefs, start screening sessions, and understand pipeline health — all through conversation.\n\nWhat would you like to work on?`,
      chips: [
        { label: "Start a new role intake", action: () => router.push("/employer/intake") },
        { label: "Review my pipeline", action: () => sendMessage("Give me a summary of my current hiring pipeline") },
        { label: "Source for a role", action: () => sendMessage("Help me start sourcing candidates") },
        { label: "Review shortlist", action: () => sendMessage("Show me candidates ready for review") },
      ],
    };
    setMessages([greeting]);
  }, [user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Filtered artifacts ─────────────────────────────────────────
  const filteredRuns = runs.filter(r => {
    if (artifactTab === "all") return true;
    if (artifactTab === "active") return ["sourcing", "active"].includes(r.status);
    if (artifactTab === "review") return r.status === "reviewing" || (r.shortlisted_count > 0);
    if (artifactTab === "done") return r.status === "completed";
    return true;
  });

  // ── Active agents (synthesized from runs) ─────────────────────
  const activeAgents = [
    {
      name: "Sourcing Agent",
      icon: "⚡",
      status: runs.some(r => r.status === "sourcing") ? "active" : "idle",
      task: runs.find(r => r.status === "sourcing")
        ? `Sourcing for ${runs.find(r => r.status === "sourcing")?.role_title}`
        : "No active sourcing",
    },
    {
      name: "Profile Extractor",
      icon: "◎",
      status: runs.some(r => (r.candidates_count || 0) > 0) ? "done" : "idle",
      task: `${runs.reduce((s, r) => s + (r.candidates_count || 0), 0)} profiles extracted total`,
    },
    {
      name: "Fit Scorer",
      icon: "≡",
      status: runs.some(r => (r.shortlisted_count || 0) > 0) ? "done" : "idle",
      task: `${runs.reduce((s, r) => s + (r.shortlisted_count || 0), 0)} candidates scored`,
    },
    {
      name: "Screen Agent",
      icon: "◈",
      status: runs.some(r => (r.screens_completed || 0) > 0) ? "done" : "idle",
      task: `${runs.reduce((s, r) => s + (r.screens_completed || 0), 0)} screens completed`,
    },
  ];

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="h-screen bg-[#0d0d0d] text-white flex overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── LEFT SIDEBAR ──────────────────────────────────────────── */}
      <aside className="w-[196px] shrink-0 border-r border-white/[0.06] flex flex-col bg-[#0b0b0b]">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-white/[0.06] shrink-0">
          <button onClick={() => router.push("/employer")} className="flex items-center gap-2 w-full text-left group">
            <CTLogo />
            <span className="text-[13px] font-semibold tracking-tight text-white/85 group-hover:text-white transition-colors">
              CareerTWiN
            </span>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto scrollbar-hide">
          <button
            onClick={() => router.push("/employer/chat")}
            className={`nav-item ${path === "/employer/chat" ? "nav-item-active" : "nav-item-default"} w-full`}
          >
            <MessageSquare className="h-3.5 w-3.5 shrink-0" /> Chat
          </button>
          <button
            onClick={() => router.push("/employer")}
            className={`nav-item ${path === "/employer" ? "nav-item-active" : "nav-item-default"} w-full`}
          >
            <BarChart3 className="h-3.5 w-3.5 shrink-0" /> Dashboard
          </button>
          <button
            onClick={() => router.push("/employer/intake")}
            className={`nav-item ${path === "/employer/intake" ? "nav-item-active" : "nav-item-default"} w-full`}
          >
            <Plus className="h-3.5 w-3.5 shrink-0" /> New Role
          </button>

          <div className="pt-3">
            <p className="mono-label px-2.5 mb-1.5">AGENTS</p>
            {activeAgents.map((a, i) => (
              <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-white/[0.03] transition-colors cursor-default">
                <AgentDot status={a.status} />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium text-white/55 truncate">{a.name}</p>
                  <p className="text-[9px] text-white/25 truncate">{a.task}</p>
                </div>
              </div>
            ))}
          </div>
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/[0.05] shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse-dot" />
              <span className="mono-label">Live</span>
            </div>
          </div>
          <p className="text-[10px] text-white/35 truncate mb-1">{user?.name || user?.email}</p>
          <button onClick={logout} className="text-[10px] text-white/20 hover:text-white/50 transition-colors">
            Sign out
          </button>
        </div>
      </aside>

      {/* ── CENTER: CHAT ──────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0 border-r border-white/[0.05]">
        {/* Chat header */}
        <div className="px-6 py-3 border-b border-white/[0.06] shrink-0 flex items-center justify-between">
          <div>
            <h1 className="text-[13px] font-semibold text-white/80">Chat</h1>
            <p className="text-[10px] text-white/28 mt-0.5">Your hiring AI assistant</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => router.push("/employer/intake")}
              className="btn-white !py-1.5 !text-[11px]"
            >
              <Plus className="h-3 w-3" /> New Role
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 scrollbar-hide">
          {messages.map(msg => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              onArtifactClick={(a) => a.href && router.push(a.href)}
            />
          ))}
          {sending && (
            <div className="flex gap-3 animate-fade-in">
              <div className="w-7 h-7 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-[11px] shrink-0">CT</div>
              <div className="flex items-center gap-2 px-4 py-3">
                <div className="flex gap-1">
                  {[0,1,2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/25 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
                <span className="text-[11px] text-white/30">Thinking…</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input area */}
        <div className="px-5 pb-5 pt-2 shrink-0">
          <div className="rounded-xl border border-white/[0.09] bg-white/[0.03] hover:border-white/[0.14] focus-within:border-white/[0.20] transition-all">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything about your hiring pipeline…"
              rows={2}
              disabled={sending}
              className="w-full bg-transparent px-4 pt-3.5 pb-1 text-[13px] text-white/75 placeholder:text-white/22 resize-none outline-none scrollbar-hide"
              data-testid="chat-input"
            />
            <div className="flex items-center justify-between px-3 pb-2.5">
              <div className="flex items-center gap-1">
                <button type="button" className="p-1.5 rounded-lg text-white/20 hover:text-white/50 hover:bg-white/[0.04] transition-all">
                  <Paperclip className="h-3.5 w-3.5" />
                </button>
                <span className="text-[9px] text-white/15 font-mono">↵ send · ⇧↵ newline</span>
              </div>
              <button
                type="button"
                onClick={() => sendMessage()}
                disabled={sending || !input.trim()}
                className="w-7 h-7 rounded-lg bg-white flex items-center justify-center disabled:opacity-25 hover:bg-white/90 transition-all"
                data-testid="chat-send-btn"
              >
                {sending
                  ? <Loader2 className="h-3.5 w-3.5 text-black animate-spin" />
                  : <ArrowRight className="h-3.5 w-3.5 text-black" />}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* ── RIGHT: ARTIFACTS ──────────────────────────────────────── */}
      <aside className="w-[280px] shrink-0 border-l border-white/[0.06] bg-[#0b0b0b] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-white/[0.06] shrink-0">
          <p className="text-[11px] font-semibold text-white/45 tracking-wide">Artifacts</p>
        </div>

        {/* Artifact tabs */}
        <div className="px-3 py-2 border-b border-white/[0.04] flex items-center gap-0.5 shrink-0">
          {[
            { id: "all",    label: "All" },
            { id: "active", label: "Active" },
            { id: "review", label: "Review" },
            { id: "done",   label: "Done" },
          ].map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setArtifactTab(t.id)}
              className={`px-2 py-0.5 rounded-md text-[10px] font-mono transition-all ${
                artifactTab === t.id ? "bg-white/[0.07] text-white/65" : "text-white/25 hover:text-white/45"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Artifact list */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 scrollbar-hide">
          {filteredRuns.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-[11px] text-white/20">No artifacts yet</p>
              <button
                type="button"
                onClick={() => router.push("/employer/intake")}
                className="mt-3 btn-ghost !text-[10px]"
              >
                <Plus className="h-3 w-3" /> Create first role
              </button>
            </div>
          ) : (
            filteredRuns.map(run => (
              <ArtifactCard
                key={run.id}
                run={run}
                active={activeRun?.id === run.id}
                onClick={r => {
                  setActiveRun(r);
                  sendMessage(`Tell me about the ${r.role_title} hiring pipeline`);
                }}
              />
            ))
          )}
        </div>

        {/* Active Agents mini panel */}
        <div className="border-t border-white/[0.06] shrink-0">
          <div className="px-4 py-2.5 border-b border-white/[0.04]">
            <p className="mono-label">ACTIVE AGENTS</p>
          </div>
          <div className="px-3 py-2 space-y-1.5 max-h-[140px] overflow-y-auto scrollbar-hide">
            {activeAgents.map((a, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-full bg-white/[0.05] border border-white/[0.07] flex items-center justify-center text-[9px] shrink-0 mt-0.5">
                  {a.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium text-white/50 truncate">{a.name}</p>
                  <div className="flex items-center gap-1">
                    <AgentDot status={a.status} />
                    <p className="text-[9px] text-white/25 truncate leading-snug">{a.task}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
