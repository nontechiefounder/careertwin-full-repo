"use client";

import { useState, useEffect, useRef, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ChevronDown, ChevronRight, Search, ShieldCheck,
  AlertCircle, CheckCircle, Clock, Zap, Globe,
  Linkedin, Terminal, BarChart3, Plus, Loader2,
  ArrowLeft, Github, Users, Filter, CheckSquare,
  FileText, Package, Sparkles, Lock, ArrowUpRight,
  RefreshCw
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import NaiveShell from "@/components/NaiveShell";
import LinkedInIcon from "@/components/icons/LinkedInIcon";

// Helper to replace text "LinkedIn" with its official logo icon
function renderTextWithLinkedIn(text) {
  if (!text || typeof text !== "string") return text;
  if (!/linkedin/i.test(text)) return text;
  const parts = text.split(/(linkedin)/gi);
  return parts.map((part, idx) => {
    if (part.toLowerCase() === "linkedin") {
      return (
        <span key={idx} className="inline-flex items-center align-baseline mx-0.5">
          <LinkedInIcon className="h-3.5 w-3.5 text-[#0A66C2] fill-current inline align-text-bottom" />
        </span>
      );
    }
    return part;
  });
}

// Helper to render description with subtle LinkedIn logo instead of text
function renderEventDescription(text) {
  if (!text) return null;
  if (/linkedin(\.com)?/i.test(text)) {
    const cleanText = text.replace(/https?:\/\/(www\.)?linkedin\.com\/in\//gi, '').replace(/linkedin\.com\/in\//gi, '');
    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <LinkedInIcon className="inline h-3.5 w-3.5 text-[#0A66C2] shrink-0 align-sub fill-current" />
        <span>{renderTextWithLinkedIn(cleanText)}</span>
      </span>
    );
  }
  return text;
}

// ── Event Icon Selector matching screenshot badges ─────────────────
function EventIcon({ type }) {
  switch (type) {
    case "agent_init":
    case "init":
      return (
        <div className="w-5 h-5 rounded bg-purple-500/15 border border-purple-500/20 flex items-center justify-center shrink-0">
          <Zap className="h-3 w-3 text-purple-400" />
        </div>
      );
    case "agent_search":
    case "search":
      return (
        <div className="w-5 h-5 rounded bg-blue-500/15 border border-blue-500/20 flex items-center justify-center shrink-0">
          <Search className="h-3 w-3 text-blue-400" />
        </div>
      );
    case "agent_filter":
    case "filter":
      return (
        <div className="w-5 h-5 rounded bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center shrink-0">
          <Filter className="h-3 w-3 text-indigo-400" />
        </div>
      );
    case "profile_open":
    case "agent_profile":
      return (
        <div className="w-5 h-5 rounded bg-slate-500/15 border border-slate-500/20 flex items-center justify-center shrink-0">
          <Users className="h-3 w-3 text-slate-300" />
        </div>
      );
    case "github_check":
    case "agent_github":
      return (
        <div className="w-5 h-5 rounded bg-zinc-700/30 border border-zinc-600/30 flex items-center justify-center shrink-0">
          <Github className="h-3 w-3 text-zinc-300" />
        </div>
      );
    case "extract_capabilities":
    case "agent_extract":
      return (
        <div className="w-5 h-5 rounded bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0">
          <Package className="h-3 w-3 text-amber-400" />
        </div>
      );
    case "compare_requirements":
    case "agent_fitter":
      return (
        <div className="w-5 h-5 rounded bg-sky-500/15 border border-sky-500/20 flex items-center justify-center shrink-0">
          <CheckSquare className="h-3 w-3 text-sky-400" />
        </div>
      );
    case "recruiter_note":
    case "agent_note":
      return (
        <div className="w-5 h-5 rounded bg-neutral-700/30 border border-neutral-600/30 flex items-center justify-center shrink-0">
          <FileText className="h-3 w-3 text-neutral-300" />
        </div>
      );
    case "decision":
    case "shortlist":
    case "complete":
      return (
        <div className="w-5 h-5 rounded bg-green-500/15 border border-green-500/20 flex items-center justify-center shrink-0">
          <CheckCircle className="h-3 w-3 text-green-400" />
        </div>
      );
    case "agent_error":
      return (
        <div className="w-5 h-5 rounded bg-red-500/15 border border-red-500/20 flex items-center justify-center shrink-0">
          <AlertCircle className="h-3 w-3 text-red-400" />
        </div>
      );
    default:
      return (
        <div className="w-5 h-5 rounded bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
          <div className="h-1.5 w-1.5 rounded-full bg-white/40" />
        </div>
      );
  }
}

// ── Format title with bracketed candidate name highlight and LinkedIn icon ──────────
function FormattedEventTitle({ title }) {
  if (!title) return null;
  const match = title.match(/^(.*?)(\[[^\]]+\])(.*)$/);
  if (match) {
    return (
      <span className="text-[12px] font-medium text-white/90 leading-snug">
        {renderTextWithLinkedIn(match[1])}
        <span className="text-blue-400 font-mono font-medium">{match[2]}</span>
        {renderTextWithLinkedIn(match[3])}
      </span>
    );
  }
  return <span className="text-[12px] font-medium text-white/90 leading-snug">{renderTextWithLinkedIn(title)}</span>;
}

// ── Group flat events into collapsible action batches ─────────────
function groupEvents(events) {
  const groups = [];
  let cur = null;
  events.forEach(ev => {
    const isStart = ev.event_type === "agent_init" || ev.event_type === "init";
    if (!cur || isStart) {
      cur = { id: ev.id, events: [ev], completed: false };
      groups.push(cur);
    } else {
      cur.events.push(ev);
      if (ev.event_type === "complete" || ev.event_type === "shortlist" || ev.event_type === "decision") {
        cur.completed = true;
        cur = null;
      }
    }
  });
  return groups;
}

// ── Action Group Pill ─────────────────────────────────────────────
function ActionGroup({ group, isLast, agentRunning }) {
  const [open, setOpen] = useState(isLast);
  const done = group.completed || !isLast;
  const count = group.events.length;

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium w-fit transition-all ${
          done
            ? "bg-white/[0.05] text-white/50 hover:bg-white/[0.08]"
            : "bg-white/[0.08] text-white/75 hover:bg-white/[0.11]"
        }`}
      >
        {done ? (
          <CheckCircle className="h-3 w-3 text-white/40 shrink-0" />
        ) : agentRunning ? (
          <Loader2 className="h-3 w-3 text-white/50 animate-spin shrink-0" />
        ) : (
          <div className="h-2.5 w-2.5 rounded-full border border-white/25 shrink-0" />
        )}
        {done
          ? `✓ ${count} action${count !== 1 ? "s" : ""} completed`
          : `${count} action${count !== 1 ? "s" : ""} in progress`}
        {open
          ? <ChevronDown className="h-3 w-3 ml-0.5 text-white/25" />
          : <ChevronRight className="h-3 w-3 ml-0.5 text-white/25" />}
      </button>

      {open && (
        <div className="mt-1.5 ml-1.5 pl-4 border-l border-white/[0.06] space-y-3 py-1.5">
          {group.events.map((ev, i) => (
            <div key={ev.id || i} className="flex items-start gap-2.5 group">
              <div className="mt-0.5">
                <EventIcon type={ev.event_type} />
              </div>
              <div className="min-w-0 flex-1">
                <FormattedEventTitle title={ev.title} />
                {ev.description && (
                  <p className="text-[11px] text-white/45 mt-0.5 leading-relaxed">
                    {ev.description}
                  </p>
                )}
              </div>
              <span className="text-[9px] font-mono text-white/30 shrink-0 mt-0.5">
                {ev.timestamp ? (
                  ev.timestamp.includes(":") && ev.timestamp.length <= 8
                    ? ev.timestamp
                    : new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
                ) : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────
export default function SourcingSessionPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const { logout } = useAuth();

  const [data, setData]           = useState(null);
  const [brief, setBrief]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [apiError, setApiError]   = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [addOpen, setAddOpen]     = useState(false);
  const [adding, setAdding]       = useState(false);
  const [addForm, setAddForm]     = useState({
    candidate_name: "", current_role: "", current_company: "",
    location: "", skills: "", notes: "", github_url: "", linkedin_url: ""
  });
  const feedRef = useRef(null);

  const fetchData = useCallback(async (isInitial = false) => {
    try {
      const res = await api.get(`/employer/sourcing-sessions/${id}`);
      setData(res.data);
      
      if (isInitial && res.data?.session?.hiring_run_id) {
        const briefRes = await api.get(`/employer/brief/${res.data.session.hiring_run_id}`);
        setBrief(briefRes.data.brief);
      }
      
      setApiError(false);
      setLoading(false);
    } catch (err) {
      if (isInitial) setApiError(true);
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) fetchData(true);
    });
    const interval = setInterval(() => fetchData(false), 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fetchData]);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [data?.events?.length]);

  const handleAutoSource = async () => {
    setAgentLoading(true);
    try {
      // Trigger backend auto-source
      await api.post(`/employer/sourcing-sessions/${id}/auto-source`);
      toast.success("Autonomous Sourcing Copilot dispatched");
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to trigger auto-sourcing.");
    } finally {
      setAgentLoading(false);
    }
  };

  const handleAddCandidate = async (e) => {
    e.preventDefault();
    if (!addForm.candidate_name.trim()) return;
    setAdding(true);
    try {
      await api.post("/employer/candidate-extractions", {
        session_id: id,
        hiring_run_id: data?.session?.hiring_run_id,
        ...addForm,
        skills: addForm.skills.split(",").map(s => s.trim()).filter(Boolean)
      });
      toast.success("Profile injected");
      setAddOpen(false);
      setAddForm({ candidate_name: "", current_role: "", current_company: "", location: "", skills: "", notes: "", github_url: "", linkedin_url: "" });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || "Manual candidate injection is disabled.");
    }
    finally { setAdding(false); }
  };

  // Derived state
  const session   = data?.session;
  const events    = data?.events || [];
  const run       = data?.hiring_run;
  const isRunning = session?.agent_running || agentLoading;

  const activeCandidates = data?.candidates || [];

  const stats = {
    scanned: session?.profiles_scanned || 0,
    shortlisted: activeCandidates.length,
    creditsSpent: run?.crustdata_credits_spent || 0,
  };

  // Browser bar URL derivation
  const activeUrl = events.findLast?.(e => e.url)?.url
    || (isRunning ? "Searching talent graph..." : "Ready to browse");

  if (loading) return (
    <div className="h-screen bg-[#030303] flex flex-col items-center justify-center text-white font-mono">
      <Loader2 className="h-6 w-6 text-[#00D604] animate-spin mb-3" />
      <p className="text-xs text-white/50">Initializing workBYLiNE Sourcing Engine...</p>
    </div>
  );

  if (apiError && !data) return (
    <div className="h-screen bg-[#030303] flex flex-col items-center justify-center text-center px-4 font-sans">
      <div className="w-14 h-14 rounded-2xl bg-red-500/[0.04] border border-red-500/[0.1] flex items-center justify-center mb-4">
        <AlertCircle className="h-6 w-6 text-red-400/80" />
      </div>
      <p className="text-[14px] font-medium text-white/80 mb-2">Connection Lost</p>
      <p className="text-[12px] text-white/40 max-w-[320px] leading-relaxed mb-6">
        Unable to reach the workBYLiNE engine. The backend service may be offline or restarting.
      </p>
      <button onClick={() => typeof window !== 'undefined' && window.location.reload()}
        className="px-4 py-2 rounded-xl bg-white/10 text-white text-[12px] font-medium hover:bg-white/15 transition-all">
        Try Reconnecting
      </button>
    </div>
  );

  const quickActions = [
    {
      label: "View Shortlist",
      icon: "→",
      action: () => router.push(`/employer/shortlist/${session?.hiring_run_id || id}`),
    },
    {
      label: isRunning ? "Agent Running..." : "⚡ Auto-Source",
      action: handleAutoSource,
      disabled: isRunning,
      loading: agentLoading,
    },
    {
      label: "+ Inject Profile",
      action: () => setAddOpen(true),
    },
    {
      label: "← Back to Brief",
      action: () => router.push(`/employer/brief/${session?.hiring_run_id || id}`),
    },
  ];

  const mustHavesList = (brief?.explicit_requirements || brief?.must_haves || run?.must_haves || []).slice(0, 5);

  const activeFilters = [
    run?.role_title && `Role: ${run.role_title}`,
    run?.location && `Location: ${run.location}`
  ].filter(Boolean);

  return (
    <div
      className="h-screen bg-[#030303] text-[var(--text-primary)] flex flex-col overflow-hidden font-sans select-none"
      data-testid="sourcing-session-page"
    >
      {/* ── Top Bar across entire page (matches reference screenshots) ── */}
      <header className="h-[42px] shrink-0 border-b border-white/[0.08] bg-[#0A0A0A] px-4 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-semibold text-white/90">
            <span className="w-5 h-5 rounded bg-white/[0.08] border border-white/10 flex items-center justify-center text-[11px] font-bold text-[#00D604] font-mono">w</span>
            <span className="tracking-tight text-[13px] font-medium font-sans">
              work<span className="text-[#00D604] font-bold">BYLiNE</span>
            </span>
          </div>
          <span className="text-white/20">|</span>
          <div className="flex items-center gap-1 text-white/40 text-[11px]">
            <span className="hover:text-white/70 cursor-pointer" onClick={() => router.push("/employer/intake")}>Intake</span>
            <span>&gt;</span>
            <span className="hover:text-white/70 cursor-pointer" onClick={() => router.push(`/employer/brief/${session?.hiring_run_id || id}`)}>Brief</span>
            <span>&gt;</span>
            <span className="text-white/80 font-medium">Sourcing</span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-4 text-[11px] text-white/45">
          <span>profiles scanned <strong className="text-white/75 font-normal">{stats.scanned}</strong></span>
          <span>•</span>
          <span className="text-green-400">shortlisted <strong className="text-green-400 font-normal">{stats.shortlisted}</strong></span>
          <span>•</span>
          <span>hold <strong className="text-white/50 font-normal">0</strong></span>
          <span>•</span>
          <span className="text-white/60">
            Role: <strong className="text-white/85 font-medium">{run?.role_title || "Untitled Role"}</strong>{run?.company ? ` @ ${run.company}` : ""}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-[10px]">
            <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? "bg-green-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.8)]" : "bg-green-400"}`} />
            <span>LIVE</span>
          </div>
          <button
            type="button"
            onClick={() => fetchData(false)}
            className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] cursor-pointer text-white/40 hover:text-white/80 transition-colors text-[10px]"
            title="Refresh session data"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* ── Main 3-Column Layout ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Left Column: Role Brief & Filters ── */}
        <aside className="w-[220px] shrink-0 border-r border-white/[0.06] flex flex-col bg-[#0b0b0b] overflow-y-auto">
          <div className="px-4 py-4 border-b border-white/[0.06]">
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-mono text-white/30 uppercase tracking-[0.2em]">Sourcing Copilot</span>
              <span className="text-[13px] font-semibold tracking-tight text-white/90 font-mono">workBYLiNE</span>
            </div>
          </div>

          <nav className="px-2.5 py-2 border-b border-white/[0.06] space-y-0.5">
            <button
              onClick={() => router.push("/employer")}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] text-white/40 hover:text-white/75 hover:bg-white/[0.04] transition-all text-left"
            >
              <BarChart3 className="h-3.5 w-3.5 shrink-0" />
              Dashboard
            </button>
            <button
              onClick={() => router.back()}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[12px] text-white/40 hover:text-white/75 hover:bg-white/[0.04] transition-all text-left"
            >
              <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
              Back
            </button>
          </nav>

          <div className="px-4 py-4 border-b border-white/[0.06] flex-1 overflow-y-auto scrollbar-hide">
            <p className="text-[9px] font-mono text-white/30 uppercase tracking-[0.2em] mb-2.5">Role Brief</p>
            <p className="text-[13px] text-white/90 font-medium leading-snug mb-0.5">
              {run?.role_title || "Untitled Role"}
            </p>
            {run?.company && <p className="text-[11px] text-white/35 mb-3">{run.company}</p>}
            
            {brief?.role_summary && (
              <p className="text-[10px] text-white/30 leading-relaxed mb-4 italic border-l border-white/10 pl-2">
                {brief.role_summary.slice(0, 110)}...
              </p>
            )}

            <div className="mt-3">
              <p className="text-[9px] font-mono text-white/25 uppercase tracking-[0.18em] mb-2">Must-Haves</p>
              {mustHavesList.length > 0 ? (
                <div className="space-y-2">
                  {mustHavesList.map((skill, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-green-400/80 text-[11px] shrink-0 font-bold">✓</span>
                      <span className="text-[11px] text-white/60 leading-tight">{skill}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-white/35 italic">No explicit must-haves defined.</p>
              )}
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-mono text-white/25 uppercase tracking-[0.18em]">Filters Active</p>
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/[0.05] text-white/40 font-mono">
                  {activeFilters.length || 1}
                </span>
              </div>
              <div className="space-y-1">
                {activeFilters.length > 0 ? (
                  activeFilters.map(filter => (
                    <div
                      key={filter}
                      className="px-2.5 py-1 rounded bg-white/[0.03] border border-white/[0.05] text-[10px] text-white/50 truncate hover:bg-white/[0.05] transition-colors"
                    >
                      {filter}
                    </div>
                  ))
                ) : (
                  <div className="px-2.5 py-1 rounded bg-white/[0.03] border border-white/[0.05] text-[10px] text-white/40 font-mono italic">
                    Default role filters active
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-white/[0.04]">
              <p className="text-[9px] font-mono text-white/25 uppercase tracking-[0.18em] mb-1.5">Session</p>
              <div className="text-[10px] font-mono text-white/40 space-y-0.5">
                <div>ID: {id ? id.slice(0, 8).toUpperCase() : "—"}</div>
                <div>Started: {session?.created_at ? new Date(session.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : (events[0]?.timestamp ? new Date(events[0].timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "—")}</div>
              </div>
            </div>
          </div>

          <div className="mt-auto px-4 py-4 bg-[#0b0b0b] border-t border-white/[0.04]">
            <p className="text-[9px] font-mono text-white/25 uppercase tracking-[0.2em] mb-2.5">Sourcing Budget</p>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3 w-3 text-blue-400/70" />
                  <span className="text-[11px] text-white/45">workBYLiNE Search</span>
                </div>
                <span className="text-[11px] font-mono text-white/65">{stats.creditsSpent}/5 CR</span>
              </div>
              
              <div className="w-full h-1 bg-white/[0.04] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-400/50 transition-all duration-500 rounded-full"
                  style={{ width: `${(stats.creditsSpent / 5) * 100}%` }}
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-white/[0.04]">
              <div className={`w-1.5 h-1.5 rounded-full ${
                isRunning ? "bg-green-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.7)]" : "bg-white/20"
              }`} />
              <span className="text-[9px] font-mono text-white/30 uppercase tracking-[0.2em]">
                {isRunning ? "Live Sourcing" : "Standby"}
              </span>
            </div>
          </div>
        </aside>

        {/* ── Center Column: Browser Chrome & Activity Feed ── */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0 bg-[#030303]">
          {/* Session Sub-Bar */}
          <div className="px-6 py-2.5 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-[#0A0A0A]">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-white/25 uppercase tracking-[0.2em]">Session</span>
              <span className="text-[10px] font-mono text-white/40 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06]">
                {id ? id.slice(0, 8).toUpperCase() : "—"}
              </span>
            </div>
            {isRunning && (
              <span className="flex items-center gap-1.5 text-[10px] text-[#00D604] font-mono">
                <Loader2 className="h-3 w-3 animate-spin" />
                Executing live search
              </span>
            )}
            {!isRunning && events.length > 0 && (
              <span className="text-[10px] text-white/25 font-mono">Agent standby</span>
            )}
          </div>

          {/* ── Simulated Browser Window Chrome (matches screenshot 2 & 4) ── */}
          <div className="px-6 py-2 border-b border-white/[0.06] bg-[#121212] flex items-center gap-3">
            {/* macOS Window Controls */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] inline-block shadow-sm" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] inline-block shadow-sm" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f] inline-block shadow-sm" />
            </div>

            {/* Address Bar */}
            <div className="flex-1 max-w-xl flex items-center gap-2 px-3 py-1 rounded-md bg-white/[0.025] border border-white/[0.07] text-[11px] font-mono text-white/50">
              <Globe className="h-3 w-3 text-white/30 shrink-0" />
              <span className="truncate">{activeUrl}</span>
            </div>
          </div>

          {/* Sourcing Activity Section Header */}
          <div className="px-6 py-3 border-b border-white/[0.04] flex items-center justify-between shrink-0 bg-[#0A0A0A]">
            <span className="text-[10px] font-mono text-white/30 uppercase tracking-[0.2em]">
              Sourcing Activity
            </span>
            <span className="text-[10px] font-mono text-white/30">
              {events.length ? `${events.length} event${events.length === 1 ? "" : "s"}` : ""}
            </span>
          </div>

          {/* Activity Event Feed */}
          <div ref={feedRef} className="flex-1 overflow-y-auto px-6 py-5 scrollbar-hide">
            {events.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
                <div className="w-14 h-14 rounded-2xl bg-white/[0.02] border border-white/[0.05] flex items-center justify-center">
                  <Search className="h-5 w-5 text-white/20" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-white/40 mb-1">No sourcing activity yet</p>
                  <p className="text-[11px] text-white/20 max-w-[280px] leading-relaxed">
                    Add a profile manually or launch the sourcing agent using the buttons below.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {events.map((ev, i) => {
                  const isDecision = ev.event_type === "decision" || ev.event_type === "shortlist" || (ev.title && ev.title.includes("SHORTLISTED"));
                  return (
                    <div 
                      key={ev.id || i} 
                      className={`flex items-start gap-3 group transition-colors ${
                        isDecision ? "p-2.5 -mx-2.5 rounded-xl border border-green-500/20 bg-green-950/20" : ""
                      }`}
                    >
                      <div className="mt-0.5">
                        <EventIcon type={ev.event_type} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <FormattedEventTitle title={ev.title} />
                        {ev.description && (
                          <p className="text-[11px] text-white/55 mt-0.5 leading-relaxed font-sans">
                            {renderEventDescription(ev.description)}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-white/30 shrink-0 mt-0.5">
                        {ev.timestamp ? (
                          ev.timestamp.includes(":") && ev.timestamp.length <= 8
                            ? ev.timestamp
                            : new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
                        ) : ""}
                      </span>
                    </div>
                  );
                })}

                {isRunning && (
                  <div className="flex items-center gap-2 pt-2 text-[11px] text-white/30 font-mono italic">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>*** Agent working...</span>
                  </div>
                )}

                {!isRunning && events.length >= 8 && (
                  <div className="flex items-center gap-3 mt-6 pt-4 border-t border-white/[0.05]">
                    <CheckCircle className="h-4 w-4 text-green-400 shrink-0" />
                    <div>
                      <p className="text-[12px] text-white/70 font-medium">Sourcing sequence complete</p>
                      <p className="text-[10px] text-white/30 mt-0.5">
                        {stats.scanned} profiles scanned · {stats.shortlisted} shortlisted
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Action Bar */}
          <div className="px-6 pb-4 pt-3 border-t border-white/[0.06] shrink-0 bg-[#0A0A0A]">
            <div className="flex flex-wrap gap-2 mb-2.5">
              {quickActions.map((btn, i) => (
                <button
                  key={i}
                  onClick={btn.action}
                  disabled={btn.disabled}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                    i === 0
                      ? "bg-white/[0.06] border-white/[0.1] text-white/80 hover:bg-white/[0.10] hover:text-white"
                      : i === 1
                      ? "bg-white/[0.04] border-white/[0.08] text-[#00D604] hover:bg-[#00D604]/10 hover:border-[#00D604]/20"
                      : "bg-white/[0.03] border-white/[0.06] text-white/50 hover:bg-white/[0.07] hover:text-white/80"
                  }`}
                >
                  {btn.loading && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
                  {btn.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
              {isRunning
                ? <Loader2 className="h-3.5 w-3.5 text-[#00D604] animate-spin shrink-0" />
                : <div className="h-3.5 w-3.5 rounded-full border border-white/[0.15] shrink-0" />
              }
              <span className="text-[11px] text-white/30 flex-1 italic select-none">
                {isRunning ? "Agent is working..." : "Agent on standby — use quick actions above"}
              </span>
            </div>
          </div>
        </main>

        {/* ── Right Column: Sourced Candidates List ── */}
        <aside className="w-[280px] shrink-0 border-l border-white/[0.06] bg-[#0A0A0A] flex flex-col">
          <div className="px-5 py-3 h-[42px] border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-[#0A0A0A]">
            <span className="text-[10px] font-mono text-white/30 uppercase tracking-[0.2em]">Candidates</span>
            <span className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-[9px] font-mono text-white/50">
              {activeCandidates.length} {activeCandidates.length === 1 ? "Match" : "Matches"}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04] scrollbar-hide">
            {activeCandidates.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-6 text-center text-white/30 space-y-2.5">
                <div className="w-11 h-11 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                  <Users className="h-5 w-5 text-white/20" />
                </div>
                <p className="text-xs text-white/40 font-normal">Candidates will appear as they&apos;re reviewed</p>
              </div>
            ) : (
              activeCandidates.map((c, i) => {
                const name = c.candidate_profiles?.name || c.candidate_name || "Candidate";
                const bio = c.candidate_profiles?.headline || c.candidate_profiles?.bio || "Profile details pending";
                const score = typeof c.fit_score === 'number' ? c.fit_score : null;
                const isHigh = score !== null && score >= 0.8;
                const isFair = score !== null && score >= 0.6;
                const skills = Array.isArray(c.highlights) && c.highlights.length
                  ? c.highlights
                  : (Array.isArray(c.candidate_profiles?.skills) ? c.candidate_profiles.skills : []);

                return (
                  <div
                    key={c.id || i}
                    onClick={() => router.push(`/employer/packet/${c.id}`)}
                    className="p-4 hover:bg-white/[0.025] transition-all cursor-pointer group"
                  >
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="min-w-0 pr-2">
                        <p className="text-[13px] font-medium text-white/90 truncate group-hover:text-white transition-colors">
                          {name}
                        </p>
                        <p className="text-[11px] text-white/40 truncate mt-0.5">
                          {bio}
                        </p>
                      </div>

                      <div className={`px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider shrink-0 ${
                        isHigh
                          ? "bg-green-500/10 border border-green-500/20 text-green-400"
                          : isFair
                          ? "bg-yellow-500/10 border border-yellow-500/20 text-yellow-400"
                          : "bg-white/5 border border-white/10 text-white/40"
                      }`}>
                        {isHigh ? "shortlisted" : isFair ? "fair match" : (c.status || "new")}
                      </div>
                    </div>

                    {/* Fit Score & Progress Bar */}
                    <div className="flex items-center justify-between text-[10px] text-white/40 font-mono mt-2 mb-1">
                      <span>Fit score</span>
                      {score !== null ? (
                        <span className={isHigh ? "text-green-400" : isFair ? "text-yellow-400" : "text-white/60"}>
                          {score.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-white/40 italic">Evaluation pending</span>
                      )}
                    </div>
                    {score !== null && (
                      <div className="w-full h-[3px] bg-white/[0.06] rounded-full overflow-hidden mb-2.5">
                        <div
                          className={`h-full rounded-full transition-all ${
                            isHigh ? "bg-green-400" : isFair ? "bg-yellow-400" : "bg-white/30"
                          }`}
                          style={{ width: `${Math.round(score * 100)}%` }}
                        />
                      </div>
                    )}

                    {/* Skill / Highlights Tags */}
                    {skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {skills.slice(0, 3).map((tag, tagIdx) => (
                          <span
                            key={tagIdx}
                            className="px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/[0.06] text-[9px] text-white/50 font-mono"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Action & Evidence Link */}
                    <div className="pt-1.5 border-t border-white/[0.04] flex items-center justify-between text-[9px] font-mono text-white/35">
                      <span className="text-[#00D604]/80">
                        {c.contextCitation || "Attributable evidence pending review"}
                      </span>
                      <span className="text-blue-400 hover:text-blue-300">View Packet →</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>

      {/* ── Profile Injection Dialog ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-[#0e0e0e] border-white/[0.08] max-w-sm text-white rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-[14px] font-semibold tracking-tight text-white/85">
              Inject Candidate Profile
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddCandidate} className="space-y-3 mt-1">
            {[
              { key: "candidate_name", label: "Name",    placeholder: "Jane Doe",                           required: true },
              { key: "current_role",   label: "Title",   placeholder: "e.g. Distributed Systems Engineer"                 },
              { key: "current_company",label: "Company", placeholder: "e.g. Acme Corp"                                    },
              { key: "skills",         label: "Skills",  placeholder: "e.g. Go, Distributed Systems, Raft"                },
              { key: "github_url",     label: "GitHub",  placeholder: "https://github.com/username"                       },
            ].map(field => (
              <div key={field.key}>
                <Label className="text-[9px] uppercase tracking-[0.18em] text-white/30 font-mono">
                  {field.label}
                </Label>
                <Input
                  value={addForm[field.key]}
                  onChange={e => setAddForm(f => ({ ...f, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  required={field.required}
                  className="mt-1 bg-white/[0.04] border-white/[0.07] h-9 text-[13px] rounded-lg"
                />
              </div>
            ))}
            <Button
              type="submit"
              disabled={adding}
              className="w-full bg-white text-black hover:bg-white/90 h-9 text-[13px] font-medium mt-1 rounded-xl"
            >
              {adding && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
              {adding ? "Injecting…" : "Inject Profile"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
