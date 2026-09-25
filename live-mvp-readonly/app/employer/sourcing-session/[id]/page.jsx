"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ChevronDown, ChevronRight, Search, ShieldCheck,
  AlertCircle, CheckCircle, Clock, Zap, Globe,
  Linkedin, Terminal, BarChart3, Plus, Loader2,
  ArrowLeft, Github, Users
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import NaiveShell from "@/components/NaiveShell";

// ── Agent roster shown in the right panel ─────────────────────────
const AGENTS = [
  { id: "sourcing",   name: "Sourcing Agent",      icon: Search,      desc: "LinkedIn & GitHub signal harvester" },
  { id: "extractor",  name: "Profile Extractor",   icon: Globe,       desc: "Structured data extraction"         },
  { id: "fitter",     name: "Fit Scorer",           icon: BarChart3,   desc: "Role-brief alignment scoring"       },
  { id: "verifier",   name: "Verification Agent",  icon: ShieldCheck, desc: "Proof-of-work validator"            },
];

// ── Map events to which agent is doing the work ───────────────────
const AGENT_EVENT_MAP = {
  sourcing:  ["agent_search", "agent_init", "init"],
  extractor: ["agent_profile", "agent_extract", "extract"],
  fitter:    ["agent_filter", "shortlist", "hold"],
  verifier:  ["agent_filter", "agent_error"],
};

// ── Group flat events into collapsible "action batches" ───────────
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
      if (ev.event_type === "complete" || ev.event_type === "shortlist") {
        cur.completed = true;
        cur = null;
      }
    }
  });
  return groups;
}

// ── Step indicator icon inside an expanded group ──────────────────
function StepDot({ type, isActive }) {
  if (type === "shortlist" || type === "complete")
    return <CheckCircle className="h-3.5 w-3.5 text-green-400 shrink-0" />;
  if (type === "agent_error")
    return <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />;
  if (isActive)
    return <Loader2 className="h-3.5 w-3.5 text-white/50 animate-spin shrink-0" />;
  return (
    <div className="h-3.5 w-3.5 rounded-full border border-white/20 shrink-0" />
  );
}

// ── Single collapsible action-batch pill ─────────────────────────
function ActionGroup({ group, isLast, agentRunning }) {
  const [open, setOpen] = useState(isLast);
  const done = group.completed || !isLast;
  const count = group.events.length;

  // Keep last group open as events pour in
  useEffect(() => { if (isLast) setOpen(true); }, [isLast]);

  return (
    <div className="mb-2">
      {/* Pill toggle */}
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

      {/* Expanded step list */}
      {open && (
        <div className="mt-1.5 ml-1.5 pl-4 border-l border-white/[0.06] space-y-2.5 py-1">
          {group.events.map((ev, i) => {
            const isActive = isLast && i === group.events.length - 1 && agentRunning;
            return (
              <div key={ev.id || i} className="flex items-start gap-2.5 group">
                <div className="mt-0.5">
                  <StepDot type={ev.event_type} isActive={isActive} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[12px] font-medium leading-snug ${
                    isActive ? "text-white/90" : "text-white/55"
                  }`}>
                    {ev.title}
                  </p>
                  {ev.description && (
                    <p className="text-[10px] text-white/28 mt-0.5 leading-relaxed line-clamp-2">
                      {ev.description}
                    </p>
                  )}
                  {ev.candidate_name && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/15 text-[9px] font-mono text-blue-400/70">
                        <Linkedin className="h-2 w-2" />
                        LinkedIn
                      </span>
                      <span className="text-[10px] text-white/35 font-mono">{ev.candidate_name}</span>
                    </div>
                  )}
                </div>
                <span className="text-[9px] font-mono text-white/20 shrink-0 mt-0.5">
                  {new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })}
                </span>
              </div>
            );
          })}
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

  const fetchData = async (isInitial = false) => {
    try {
      const res = await api.get(`/employer/sourcing-sessions/${id}`);
      setData(res.data);
      
      // Only fetch the professionalized brief ONCE, not on every 3s poll
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
  };

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(false), 3000);
    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [data?.events?.length]);

  const handleAutoSource = async () => {
    setAgentLoading(true);
    try {
      await api.post(`/employer/sourcing-sessions/${id}/auto-source`);
      toast.success("Sourcing agent dispatched");
      // Force an immediate sync
      await fetchData();
    } catch (err) { toast.error("Failed to start agent"); }
    finally { setAgentLoading(false); }
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
    } catch (err) { toast.error("Failed to add candidate"); }
    finally { setAdding(false); }
  };

  // Derived state
  const session  = data?.session;
  const events   = data?.events || [];
  const run      = data?.hiring_run;
  const groups   = groupEvents(events);
  const isRunning = session?.agent_running;

  const stats = {
    scanned:     session?.profiles_scanned || events.filter(e => e.event_type === "agent_profile").length,
    shortlisted: data?.candidates?.length || session?.shortlisted_count || events.filter(e => e.event_type === "shortlist").length,
    creditsSpent: run?.crustdata_credits_spent || 0,
  };

  const getAgentStatus = (agentId) => {
    if (!isRunning) return "standby";
    const last = events[events.length - 1];
    if (!last) return "standby";
    return AGENT_EVENT_MAP[agentId]?.includes(last.event_type) ? "active" : "standby";
  };

  if (loading) return (
    <NaiveShell
      pageTitle="Sourcing Session"
      pageSubtitle="Initializing Agent..."
      goBack="/employer"
    >
      <div className="flex h-[calc(100vh-80px)] overflow-hidden max-w-6xl mx-auto border-x border-white/[0.04]">
        <div className="w-[320px] shrink-0 border-r border-white/[0.04] bg-[#0d0d0d]/50 p-6 flex flex-col gap-6">
          <Skeleton className="h-10 w-full bg-white/[0.03] rounded-lg" />
          <div className="space-y-4">
            <Skeleton className="h-6 w-2/3 bg-white/[0.03]" />
            <Skeleton className="h-6 w-1/2 bg-white/[0.03]" />
          </div>
        </div>
        <div className="flex-1 p-6 flex flex-col gap-5">
          {[1,2,3].map(i => (
            <div key={i} className="flex gap-4 items-start">
              <Skeleton className="h-8 w-8 rounded-full bg-white/[0.03] shrink-0" />
              <div className="space-y-2 flex-1 pt-1">
                <Skeleton className="h-4 w-1/4 bg-white/[0.04]" />
                <Skeleton className="h-16 w-full rounded-lg bg-white/[0.02]" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </NaiveShell>
  );

  if (apiError && !data) return (
    <div className="h-screen bg-[#0d0d0d] flex flex-col items-center justify-center text-center px-4">
      <div className="w-14 h-14 rounded-2xl bg-red-500/[0.04] border border-red-500/[0.1] flex items-center justify-center mb-4">
        <AlertCircle className="h-6 w-6 text-red-400/80" />
      </div>
      <p className="text-[14px] font-medium text-white/80 mb-2">Connection Lost</p>
      <p className="text-[12px] text-white/40 max-w-[300px] leading-relaxed mb-6">
        Unable to reach the CareerTWiN engine. The backend service may be offline or restarting.
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
      action: () => router.push(`/employer/shortlist/${session?.hiring_run_id}`),
    },
    {
      label: isRunning ? "Agent Running..." : "⚡ Auto-Source",
      action: handleAutoSource,
      disabled: isRunning || agentLoading,
      loading: agentLoading,
    },
    {
      label: "+ Inject Profile",
      action: () => setAddOpen(true),
    },
    {
      label: "← Back to Brief",
      action: () => router.push(`/employer/brief/${session?.hiring_run_id}`),
    },
  ];

  return (
    <div
      className="h-screen bg-[#0d0d0d] text-white flex overflow-hidden font-sans"
      data-testid="sourcing-session-page"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <aside className="w-[196px] shrink-0 border-r border-white/[0.06] flex flex-col bg-[#0b0b0b] overflow-y-auto">
        <div className="px-4 py-5 border-b border-white/[0.06]">
          <div className="flex flex-col gap-1.5">
            <span className="text-[9px] font-mono text-white/30 uppercase tracking-[0.2em]">Sourcing Copilot</span>
            <span className="text-[13px] font-semibold tracking-tight text-white/90 font-mono">CareerTWiN</span>
          </div>
        </div>

        <nav className="px-2.5 py-2.5 border-b border-white/[0.06] space-y-0.5">
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

        <div className="px-4 py-5 border-b border-white/[0.06] flex-1 overflow-y-auto scrollbar-hide">
          <p className="text-[9px] font-mono text-white/30 uppercase tracking-[0.2em] mb-3">Role Brief</p>
          <p className="text-[13px] text-white/80 font-medium leading-snug mb-1">
            {run?.role_title || "Unnamed Role"}
          </p>
          <p className="text-[11px] text-white/30 mb-4">{run?.company}</p>
          
          {brief?.role_summary && (
            <p className="text-[10px] text-white/25 leading-relaxed mb-5 italic border-l border-white/10 pl-2">
              {brief.role_summary.slice(0, 120)}...
            </p>
          )}

          <div className="space-y-2.5">
            {(brief?.explicit_requirements || run?.must_haves || ["React", "Typescript", "Node.js"]).slice(0, 6).map((skill, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <CheckCircle className="h-3.5 w-3.5 text-white/25 shrink-0 mt-[0.15rem]" />
                <span className="text-[11px] text-white/55 leading-tight">{skill}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="px-4 py-5 border-b border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[9px] font-mono text-white/30 uppercase tracking-[0.2em]">Filters Active</p>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.05] text-white/40 font-mono">3</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(!run?.locations?.length ? ["Remote"] : run.locations).map(l => (
              <span key={l} className="px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.06] text-[10px] text-white/50 truncate max-w-full hover:bg-white/[0.05] transition-colors">{l}</span>
            ))}
            <span className="px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.06] text-[10px] text-white/50 hover:bg-white/[0.05] transition-colors">Senior</span>
            <span className="px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.06] text-[10px] text-white/50 hover:bg-white/[0.05] transition-colors">High Match</span>
          </div>
        </div>
        
        <div className="mt-auto px-4 py-5 bg-[#0b0b0b] border-t border-white/[0.04]">
          <p className="text-[9px] font-mono text-white/20 uppercase tracking-[0.2em] mb-3">Sourcing Budget</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-blue-400/60" />
                <span className="text-[11px] text-white/40">Careertwin Search</span>
              </div>
              <span className="text-[11px] font-mono text-white/60">{stats.creditsSpent || 0}/5 CR</span>
            </div>
            
            <div className="w-full h-1 bg-white/[0.04] rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${
                  stats.creditsSpent >= 5 ? "bg-red-500/40" : "bg-blue-400/40"
                }`} 
                style={{ width: `${(stats.creditsSpent / 5) * 100}%` }}
              ></div>
            </div>
            
            {stats.creditsSpent >= 5 && (
              <p className="text-[9px] text-red-400/50 italic mt-1 leading-tight">
                Credits exhausted for this position.
              </p>
            )}
          </div>

          <div className="flex items-center gap-1.5 mt-6 pt-4 border-t border-white/[0.04]">
            <div className={`w-1.5 h-1.5 rounded-full ${
              isRunning ? "bg-green-400 animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.6)]" : "bg-white/15"
            }`} />
            <span className="text-[9px] font-mono text-white/25 uppercase tracking-[0.2em]">
              {isRunning ? "Live Sourcing" : run?.sourcing_status === 'completed' ? "Scan Finalized" : "Standby"}
            </span>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="px-6 py-3 border-b border-white/[0.06] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-[10px] font-mono text-white/20 uppercase tracking-[0.2em]">Session</span>
            <span className="text-[10px] font-mono text-white/35 bg-white/[0.04] px-2 py-0.5 rounded-md border border-white/[0.06]">
              {id?.slice(0, 8).toUpperCase()}
            </span>
          </div>
          {isRunning && (
            <span className="flex items-center gap-1.5 text-[10px] text-green-400/70 font-mono">
              <Loader2 className="h-3 w-3 animate-spin" />
              Executing live search
            </span>
          )}
          {!isRunning && events.length > 0 && (
            <span className="text-[10px] text-white/22 font-mono">Agent standby</span>
          )}
        </div>

        <div ref={feedRef} className="flex-1 overflow-y-auto px-6 py-5 scrollbar-hide">
          {events.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                <Search className="h-6 w-6 text-white/15" />
              </div>
              <div>
                <p className="text-[13px] font-medium text-white/35 mb-1">No sourcing activity yet</p>
                <p className="text-[11px] text-white/18 max-w-[260px] leading-relaxed">
                  Add a profile manually or launch the sourcing agent using the buttons below.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3 mb-5">
                <div className="w-7 h-7 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0 mt-0.5 text-white/50 text-[13px]">
                  ⚡
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[12px] font-semibold text-white/75">CareerTWiN Agent</span>
                    <span className="text-[9px] text-white/22 font-mono">
                      {events[0] ? new Date(events[0].timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                    </span>
                  </div>
                  <p className="text-[12px] text-white/45 leading-relaxed">
                    Sourcing session started for{" "}
                    <span className="text-white/65 font-medium">{run?.role_title}</span>
                    {run?.company ? <> at <span className="text-white/65 font-medium">{run.company}</span></> : ""}.
                    I'll keep you updated as profiles are scanned and evaluated.
                  </p>
                </div>
              </div>

              <div className="space-y-0.5">
                {groups.map((group, i) => (
                  <ActionGroup
                    key={group.id || i}
                    group={group}
                    isLast={i === groups.length - 1}
                    agentRunning={isRunning}
                  />
                ))}
              </div>

              {!isRunning && (
                <div className="flex items-center gap-3 mt-5 pt-4 border-t border-white/[0.04]">
                  <CheckCircle className="h-3.5 w-3.5 text-green-400/70 shrink-0" />
                  <div>
                    <p className="text-[12px] text-white/55 font-medium">Sourcing sequence complete</p>
                    <p className="text-[10px] text-white/25 mt-0.5">
                      {stats.scanned} profiles scanned · {stats.shortlisted} shortlisted
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 pb-4 pt-3 border-t border-white/[0.06] shrink-0 bg-[#0d0d0d]">
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {quickActions.map((btn, i) => (
              <button
                key={i}
                onClick={btn.action}
                disabled={btn.disabled}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                  i === 0
                    ? "bg-white/[0.06] border-white/[0.09] text-white/70 hover:bg-white/[0.10] hover:text-white"
                    : "bg-white/[0.03] border-white/[0.06] text-white/50 hover:bg-white/[0.07] hover:text-white/80"
                }`}
              >
                {btn.loading && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
                {btn.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white/[0.025] border border-white/[0.055]">
            {isRunning
              ? <Loader2 className="h-3.5 w-3.5 text-white/22 animate-spin shrink-0" />
              : <div className="h-3.5 w-3.5 rounded-full border border-white/[0.12] shrink-0" />
            }
            <span className="text-[12px] text-white/22 flex-1 italic select-none">
              {isRunning ? "Agent is working..." : "Agent on standby — use quick actions above"}
            </span>
          </div>
        </div>
      </main>

      <aside className="w-[280px] shrink-0 border-l border-white/[0.06] bg-[#0b0b0b] flex flex-col pt-0">
        <div className="px-5 py-3 h-[45px] border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-[#0d0d0d]">
          <span className="text-[10px] font-mono text-white/20 uppercase tracking-[0.2em]">Candidates</span>
          <span className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-[9px] font-mono text-white/40">
            {stats.shortlisted} Match{stats.shortlisted !== 1 && 'es'}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
          {data?.candidates
            ?.sort((a, b) => b.fit_score - a.fit_score)
            .map((c, i) => (
              <div
                key={c.id || i}
                className="p-5 hover:bg-white/[0.02] transition-all cursor-pointer group"
                onClick={() => router.push(`/employer/packet/${c.id}`)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0 pr-3">
                    <p className="text-[13px] font-medium text-white/85 truncate group-hover:text-white transition-colors">
                      {c.candidate_profiles?.name || "Candidate"}
                    </p>
                    <p className="text-[11px] text-white/35 truncate mt-0.5">
                      {c.candidate_profiles?.bio || "Found via search"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end shrink-0 gap-1.5">
                    <div className={`px-1.5 py-0.5 rounded border text-[9px] font-mono tracking-wide uppercase ${
                      c.fit_score >= 0.8 ? "bg-green-500/10 border-green-500/15 text-green-400" :
                      c.fit_score >= 0.6 ? "bg-yellow-500/10 border-yellow-500/15 text-yellow-500" :
                      "bg-white/5 border-white/10 text-white/40"
                    }`}>
                      {c.fit_score >= 0.8 ? "High Fit" : c.fit_score >= 0.6 ? "Fair Match" : "Low Sig"}
                    </div>
                  </div>
                </div>
                
                <div className="w-full h-[3px] bg-white/[0.04] rounded-full overflow-hidden mt-3 mb-3">
                  <div className={`h-full rounded-full ${
                    c.fit_score >= 0.8 ? "bg-green-400/80" : "bg-yellow-400/60"
                  }`} style={{ width: `${(c.fit_score * 100) || 85}%` }}></div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                    <span className="px-1.5 py-0.5 rounded-sm bg-white/[0.03] border border-white/[0.05] text-[9px] text-white/50 tracking-wider font-mono">
                      {c.candidate_profiles?.location || "Global"}
                    </span>
                    {c.candidate_profiles?.linkedin_url && (
                        <span className="px-1.5 py-0.5 rounded-sm bg-blue-500/5 text-blue-400/40 text-[9px]">
                            <Linkedin className="h-2 w-2" />
                        </span>
                    )}
                </div>
              </div>
          ))}
          {!data?.candidates?.length && (
            <div className="p-6 text-center mt-10">
              <div className="w-10 h-10 rounded-full bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mx-auto mb-3">
                <Users className="h-4 w-4 text-white/15" />
              </div>
              <p className="text-[12px] text-white/30 font-medium">No candidates yet</p>
              <p className="text-[10px] text-white/20 mt-1 max-w-[180px] mx-auto leading-relaxed">Agent is sweeping networks to find matches.</p>
            </div>
          )}
        </div>
      </aside>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-[#0e0e0e] border-white/[0.08] max-w-sm text-white rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-[14px] font-semibold tracking-tight text-white/85">
              Inject Profile
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddCandidate} className="space-y-3 mt-1">
            {[
              { key: "candidate_name", label: "Name",    placeholder: "Alex Rivera",     required: true },
              { key: "current_role",   label: "Title",   placeholder: "Staff Engineer"                  },
              { key: "current_company",label: "Company", placeholder: "Stripe"                          },
              { key: "skills",         label: "Skills",  placeholder: "Go, Kafka, Postgres"             },
              { key: "github_url",     label: "GitHub",  placeholder: "https://github.com/…"            },
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
