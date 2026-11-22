"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ChevronDown, ChevronRight, Search, ShieldCheck,
  AlertCircle, CheckCircle, Clock, Zap, Globe,
  Terminal, BarChart3, Plus, Loader2,
  ArrowLeft, Github, Users, ExternalLink, Sparkles, RefreshCw,
  Filter, Sliders, User, FileText, CheckCircle2, Shield, MapPin
} from "lucide-react";
import LinkedInIcon from "@/components/icons/LinkedInIcon";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

// ── Agent roster ──────────────────────────────────────────────────
const AGENTS = [
  { id: "sourcing",   name: "Sourcing Agent",      icon: Search,      desc: "Talent network & GitHub signal harvester" },
  { id: "extractor",  name: "Profile Extractor",   icon: Globe,       desc: "Structured candidate extraction"     },
  { id: "fitter",     name: "Fit Scorer",          icon: BarChart3,   desc: "Role-brief alignment & scoring"     },
  { id: "verifier",   name: "Verification Agent",  icon: ShieldCheck, desc: "Proof-of-work & fact validator"      },
];

const AGENT_EVENT_MAP = {
  sourcing:  ["agent_search", "agent_init", "init"],
  extractor: ["agent_profile", "agent_extract", "extract"],
  fitter:    ["agent_filter", "shortlist", "hold"],
  verifier:  ["agent_filter", "agent_error"],
};

// ── Narrative Timeline Event Item (V1 Timeline Fidelity) ──────────
function TimelineEventItem({ ev, isLast, agentRunning }) {
  const isDecision = ev.event_type === "shortlist" || (ev.title && ev.title.toLowerCase().includes("shortlisted"));
  const isError = ev.event_type === "agent_error" || (ev.title && ev.title.toLowerCase().includes("failed"));

  let Icon = Search;
  let iconBg = "bg-blue-500/10 text-blue-400 border-blue-500/20";

  if (ev.event_type === "agent_init" || ev.event_type === "init") {
    Icon = Zap;
    iconBg = "bg-purple-500/10 text-purple-400 border-purple-500/20";
  } else if (ev.event_type === "agent_search") {
    Icon = Search;
    iconBg = "bg-blue-500/10 text-blue-400 border-blue-500/20";
  } else if (ev.event_type === "agent_filter") {
    Icon = Sliders;
    iconBg = "bg-cyan-500/10 text-cyan-400 border-cyan-500/20";
  } else if (ev.event_type === "agent_profile") {
    Icon = User;
    iconBg = "bg-slate-500/10 text-slate-300 border-white/10";
  } else if (ev.event_type === "agent_extract") {
    Icon = Sparkles;
    iconBg = "bg-amber-500/10 text-amber-400 border-amber-500/20";
  } else if (ev.event_type === "agent_compare") {
    Icon = CheckCircle2;
    iconBg = "bg-blue-500/10 text-blue-400 border-blue-500/20";
  } else if (isDecision) {
    Icon = CheckCircle;
    iconBg = "bg-[#00D604]/20 text-[#00D604] border-[#00D604]/30";
  } else if (isError) {
    Icon = AlertCircle;
    iconBg = "bg-red-500/20 text-red-400 border-red-500/30";
  } else if (ev.title && ev.title.toLowerCase().includes("github")) {
    Icon = Github;
    iconBg = "bg-slate-500/10 text-slate-300 border-white/10";
  } else if (ev.title && ev.title.toLowerCase().includes("note")) {
    Icon = FileText;
    iconBg = "bg-slate-500/10 text-slate-300 border-white/10";
  }

  // Helper to render description with official logos
  const renderDescription = (text) => {
    if (!text) return null;
    const parts = text.split(/(https?:\/\/[^\s]+|linkedin\.com[^\s]+|github\.com[^\s]+)/gi);
    return (
      <span className="text-[11px] text-white/50 leading-relaxed font-sans">
        {parts.map((part, i) => {
          if (!part) return null;
          if (part.toLowerCase().includes("linkedin") || part.toLowerCase().includes("/in/")) {
            return (
              <span key={i} className="inline-flex items-center gap-1 text-[#0A66C2] font-mono mx-1">
                <LinkedInIcon className="h-3 w-3 fill-current inline shrink-0" />
                <span>{part.replace(/https?:\/\/(www\.)?linkedin\.com/gi, '')}</span>
              </span>
            );
          }
          if (part.toLowerCase().includes("github")) {
            return (
              <span key={i} className="inline-flex items-center gap-1 text-white/80 font-mono mx-1">
                <Github className="h-3 w-3 inline shrink-0" />
                <span>{part.replace(/https?:\/\/(www\.)?/gi, '')}</span>
              </span>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  };

  const formattedTime = ev.timestamp
    ? new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    : "09:00:00";

  if (isDecision) {
    return (
      <div className="flex items-start gap-3 p-3 rounded-xl bg-[#00D604]/[0.08] border border-[#00D604]/30 transition-all">
        <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 border ${iconBg}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[#00D604]">
              {ev.title}
            </p>
            <span className="text-[9px] font-mono text-white/30 shrink-0">
              {formattedTime}
            </span>
          </div>
          <div className="mt-0.5">
            {renderDescription(ev.description)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-white/[0.02] transition-colors">
      <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 border ${iconBg}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-white/90">
            {ev.title}
          </p>
          <span className="text-[9px] font-mono text-white/30 shrink-0">
            {formattedTime}
          </span>
        </div>
        <div className="mt-0.5">
          {renderDescription(ev.description)}
        </div>
      </div>
    </div>
  );
}

// ── Main Autonomous Sourcing View ─────────────────────────────────
export default function AutonomousAgentSourcingView({ hiringRunId, roleTitle = "", initialBrief = null }) {
  const router = useRouter();

  const [data, setData] = useState(null);
  const [brief, setBrief] = useState(initialBrief);
  const [loading, setLoading] = useState(true);
  const [agentLoading, setAgentLoading] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({
    candidate_name: "", current_role: "", current_company: "",
    location: "", skills: "", notes: "", github_url: "", linkedin_url: ""
  });
  const feedRef = useRef(null);

  const fetchData = useCallback(async (isInitial = false) => {
    try {
      const res = await api.get(`/employer/sourcing-sessions/${hiringRunId}`);
      setData(res.data);

      if (isInitial && !brief && res.data?.session?.hiring_run_id) {
        const briefRes = await api.get(`/employer/brief/${res.data.session.hiring_run_id}`);
        setBrief(briefRes.data.brief);
      }
      setLoading(false);
    } catch (err) {
      console.warn("Failed to poll sourcing session:", err.message);
      setLoading(false);
    }
  }, [hiringRunId, brief]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) fetchData(true);
    });
    const interval = setInterval(() => fetchData(false), 3500);
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
      const sessionId = data?.session?.id || hiringRunId;
      await api.post(`/employer/sourcing-sessions/${sessionId}/auto-source`);
      toast.success("Autonomous Sourcing Agent dispatched.");
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to trigger auto-source agent.");
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
        session_id: data?.session?.id || hiringRunId,
        hiring_run_id: hiringRunId,
        ...addForm,
        skills: addForm.skills.split(",").map(s => s.trim()).filter(Boolean)
      });
      toast.success("Profile injected successfully.");
      setAddOpen(false);
      setAddForm({ candidate_name: "", current_role: "", current_company: "", location: "", skills: "", notes: "", github_url: "", linkedin_url: "" });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || "Manual candidate injection is disabled.");
    } finally {
      setAdding(false);
    }
  };

  const session = data?.session;
  const events = data?.events || [];
  const run = data?.hiring_run;
  const isRunning = session?.agent_running;

  const lastErrorEvent = [...events].reverse().find(e => e.event_type === "agent_error");
  const lastEvent = events[events.length - 1];
  const hasFailed = !isRunning && (run?.sourcing_status === 'failed' || lastEvent?.event_type === "agent_error" || (lastErrorEvent && events.indexOf(lastErrorEvent) === events.length - 1));
  const isComplete = !isRunning && !hasFailed && (events.some(e => e.event_type === "complete" || e.event_type === "shortlist") || run?.sourcing_status === 'completed');

  const stats = {
    scanned: session?.profiles_scanned || events.filter(e => e.event_type === "agent_profile").length,
    shortlisted: data?.candidates?.length || session?.shortlisted_count || events.filter(e => e.event_type === "shortlist").length,
    creditsSpent: run?.credits_spent || 0,
  };

  // Find simulated browser active URL
  const activeBrowserUrl = events.find(e => e.description && (e.description.includes("github.com") || e.description.includes("linkedin.com")))?.description?.match(/(?:https?:\/\/)?(github\.com\/[^\s—]+|linkedin\.com\/[^\s—]+)/i)?.[1];

  if (loading) {
    return (
      <div className="rounded-xl border border-white/[0.08] bg-[#141414] p-8 flex flex-col items-center justify-center">
        <Loader2 className="h-6 w-6 text-[#00D604] animate-spin mb-2" />
        <p className="text-xs font-mono text-white/50">Connecting to Autonomous Sourcing Engine...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5" data-testid="autonomous-sourcing-view">
      {/* ── Top Bar: V1 Sourcing Header Breadcrumbs & Live Stats ── */}
      <div className="rounded-xl border border-white/[0.08] bg-[#141414] px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-white/80">
            <span className="w-4 h-4 rounded bg-[#00D604]/20 text-[#00D604] flex items-center justify-center text-[10px] font-bold font-mono">w</span>
            <span className="font-semibold text-white">work<span className="text-[#00D604]">BYLiNE</span></span>
            <span className="text-white/30">&gt;</span>
            <span className="text-white/50">Intake</span>
            <span className="text-white/30">&gt;</span>
            <span className="text-white/50">Brief</span>
            <span className="text-white/30">&gt;</span>
            <span className="text-[#00D604]">Sourcing</span>
          </div>
          <span className="text-white/20">|</span>
          <span className="text-white/60">
            profiles scanned <strong className="text-white font-mono">{stats.scanned}</strong>
          </span>
          <span className="text-white/40">·</span>
          <span className="text-white/60">
            shortlisted <strong className="text-[#00D604] font-mono">{stats.shortlisted}</strong>
          </span>
          <span className="text-white/40">·</span>
          <span className="text-white/60">
            hold <strong className="text-amber-400 font-mono">0</strong>
          </span>
          <span className="text-white/20">|</span>
          <span className="text-white/50 truncate max-w-[280px]">
            Role: <strong className="text-white/90">{run?.role_title || roleTitle || "Untitled Role"}{run?.company ? ` @ ${run.company}` : ""}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono bg-[#00D604]/10 text-[#00D604] border border-[#00D604]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00D604] animate-pulse" />
            LIVE
          </span>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-white/[0.04] text-white/80 hover:bg-white/[0.08] border border-white/10 transition-colors"
          >
            <Plus className="h-3.5 w-3.5 text-white/60" />
            Inject Profile
          </button>
          <button
            type="button"
            onClick={handleAutoSource}
            disabled={isRunning || agentLoading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#00D604] text-black hover:bg-[#00D604]/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-[#00D604]/20"
            data-testid="auto-source-btn"
          >
            {agentLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Dispatching...
              </>
            ) : isRunning ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Agents Running...
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5" />
                ⚡ Auto-Source
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── 3-Column Autonomous Cockpit ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Role Context & Filters (3 Cols) */}
        <div className="lg:col-span-3 space-y-4">
          <div className="rounded-xl border border-white/[0.08] bg-[#141414] p-4 space-y-4">
            <div>
              <div className="text-[9px] font-mono text-white/30 uppercase tracking-[0.2em] mb-1">ROLE BRIEF</div>
              <h4 className="text-sm font-semibold text-white/95">{run?.role_title || roleTitle || "Untitled Role"}</h4>
              {run?.company && <p className="text-xs text-white/40">{run.company}</p>}
            </div>

            <div className="pt-3 border-t border-white/[0.06]">
              <div className="text-[9px] font-mono text-white/30 uppercase tracking-[0.2em] mb-2">MUST-HAVES</div>
              {Array.isArray(brief?.explicit_requirements || run?.must_haves) && (brief?.explicit_requirements || run?.must_haves).length > 0 ? (
                <div className="space-y-1.5">
                  {(brief?.explicit_requirements || run?.must_haves).slice(0, 5).map((req, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle className="h-3.5 w-3.5 text-[#00D604] shrink-0 mt-0.5" />
                      <span className="text-[11px] text-white/80 leading-snug">{req}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-white/35 italic">No explicit must-haves set.</p>
              )}
            </div>

            <div className="pt-3 border-t border-white/[0.06]">
              <div className="text-[9px] font-mono text-white/30 uppercase tracking-[0.2em] mb-2">FILTERS ACTIVE</div>
              <div className="space-y-1.5">
                {[
                  run?.role_title && `Role: ${run.role_title}`,
                  run?.location && `Location: ${run.location}`
                ].filter(Boolean).length > 0 ? (
                  [
                    run?.role_title && `Role: ${run.role_title}`,
                    run?.location && `Location: ${run.location}`
                  ].filter(Boolean).map((flt, i) => (
                    <div key={i} className="px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white/70 font-mono">
                      {flt}
                    </div>
                  ))
                ) : (
                  <div className="px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06] text-xs text-white/40 font-mono italic">
                    Default role filters active
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-white/[0.06] space-y-1 font-mono text-[10px] text-white/40">
              <div className="text-[9px] uppercase tracking-[0.2em] mb-1 text-white/30">SESSION</div>
              <div>ID: {session?.id ? session.id.slice(0, 11).toUpperCase() : "—"}</div>
              <div>Started: {events[0]?.timestamp ? new Date(events[0].timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : (session?.created_at ? new Date(session.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "—")}</div>
            </div>
          </div>
        </div>

        {/* Center Column: Live Sourcing Activity Stream (6 Cols) */}
        <div className="lg:col-span-6">
          <div className="rounded-xl border border-white/[0.08] bg-[#141414] flex flex-col h-[650px] overflow-hidden">
            {/* Header: SOURCING ACTIVITY & Event Counter */}
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-[#161616]">
              <span className="text-xs font-semibold text-white/85 uppercase tracking-wider font-mono">
                SOURCING ACTIVITY
              </span>
              <span className="text-[10px] text-white/40 font-mono">
                {events.length > 0 ? `${events.length} event${events.length === 1 ? "" : "s"}` : "0 events"}
              </span>
            </div>

            {/* Simulated Browser URL Bar */}
            <div className="px-4 py-2 border-b border-white/[0.06] bg-[#111111] flex items-center gap-3 shrink-0">
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] inline-block shadow-sm" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] inline-block shadow-sm" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f] inline-block shadow-sm" />
              </div>
              <div className="flex-1 flex items-center gap-2 px-3 py-1 rounded-md bg-white/[0.025] border border-white/[0.07] text-[11px] font-mono text-white/50">
                <Globe className="h-3 w-3 text-white/30 shrink-0" />
                <span className="truncate">
                  {isRunning ? `${activeBrowserUrl || "Browsing talent network..."} |` : activeBrowserUrl || "Ready to browse"}
                </span>
              </div>
            </div>

            {/* Feed Scroll Area */}
            <div ref={feedRef} className="flex-1 overflow-y-auto p-4 space-y-2">
              {events.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                    <Search className="h-5 w-5 text-white/20" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white/60">No Autonomous Sourcing Activity Yet</p>
                    <p className="text-[11px] text-white/35 max-w-[280px] mt-1 leading-relaxed">
                      Click <span className="text-[#00D604] font-mono">⚡ Auto-Source</span> above to dispatch the candidate discovery engine.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    {events.map((ev, idx) => (
                      <TimelineEventItem
                        key={ev.id || idx}
                        ev={ev}
                        isLast={idx === events.length - 1}
                        agentRunning={isRunning}
                      />
                    ))}

                    {isRunning && (
                      <div className="flex items-center gap-2 px-3 py-2 text-xs font-mono text-[#00D604]/80">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>... Agent working...</span>
                      </div>
                    )}
                  </div>

                  {/* Actionable Error State if Attempt Failed */}
                  {hasFailed && (
                    <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 space-y-2.5 mt-4" data-testid="sourcing-failure-banner">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-xs font-semibold text-red-300">
                          <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                          <span>Sourcing Attempt Failed</span>
                        </div>
                        <span className="text-[10px] font-mono text-red-300/60">
                          {lastErrorEvent?.timestamp ? new Date(lastErrorEvent.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Recent attempt"}
                        </span>
                      </div>
                      <p className="text-xs text-red-200/90 leading-relaxed font-mono">
                        {lastErrorEvent?.description || lastErrorEvent?.title || "Sourcing execution encountered an error. Previous successful candidates are preserved."}
                      </p>
                      <div className="pt-1 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={handleAutoSource}
                          disabled={agentLoading}
                          className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-200 hover:bg-red-500/30 border border-red-500/30 text-xs font-medium transition-colors flex items-center gap-1.5"
                          data-testid="retry-auto-source-btn"
                        >
                          {agentLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                          Retry Sourcing
                        </button>
                        <span className="text-[11px] text-white/40">Safe to retry. Prior results preserved.</span>
                      </div>
                    </div>
                  )}

                  {/* Completion State */}
                  {isComplete && (
                    <div className="flex items-center gap-2.5 p-3 rounded-lg bg-[#00D604]/5 border border-[#00D604]/15 mt-3">
                      <CheckCircle className="h-4 w-4 text-[#00D604] shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-[#00D604]">Sourcing sequence complete</p>
                        <p className="text-[10px] text-white/40">
                          {stats.scanned} profiles evaluated · {stats.shortlisted} high-fit candidates shortlisted.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Sourced Candidates Stream (3 Cols) */}
        <div className="lg:col-span-3">
          <div className="rounded-xl border border-white/[0.08] bg-[#141414] flex flex-col h-[650px] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-[#161616]">
              <span className="text-xs font-semibold text-white/85 uppercase tracking-wider font-mono">CANDIDATES</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#00D604]/10 text-[#00D604] border border-[#00D604]/20">
                {data?.candidates?.length || 0} Shortlisted
              </span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
              {data?.candidates
                ?.sort((a, b) => (b.fit_score || 0) - (a.fit_score || 0))
                .map((c, i) => (
                  <div
                    key={c.id || i}
                    onClick={() => setSelectedCandidate(c)}
                    className="p-3.5 hover:bg-white/[0.03] transition-all cursor-pointer group space-y-2.5"
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-semibold text-white/95 truncate group-hover:text-[#00D604] transition-colors">
                          {c.candidate_profiles?.name || "Candidate"}
                        </p>
                        <p className="text-[11px] text-white/50 truncate mt-0.5">
                          {c.candidate_profiles?.headline || c.candidate_profiles?.bio || "Profile details pending"}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono text-[#00D604] font-medium shrink-0">
                        {c.status || "shortlisted"}
                      </span>
                    </div>

                    {/* Fit score display */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono text-white/40">
                        <span>Fit score</span>
                        {typeof c.fit_score === 'number' ? (
                          <span className="text-[#00D604] font-semibold">{c.fit_score.toFixed(2)}</span>
                        ) : (
                          <span className="text-white/40 italic">Evaluation pending</span>
                        )}
                      </div>
                      {typeof c.fit_score === 'number' && (
                        <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#00D604]"
                            style={{ width: `${Math.round(c.fit_score * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Tags: Skills and Context */}
                    {(() => {
                      const skills = Array.isArray(c.highlights) && c.highlights.length
                        ? c.highlights
                        : (Array.isArray(c.candidate_profiles?.skills) ? c.candidate_profiles.skills : []);
                      return skills.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {skills.slice(0, 3).map((tag, tIdx) => (
                            <span key={tIdx} className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] text-[10px] font-mono text-white/70">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null;
                    })()}
                  </div>
                ))}

              {!data?.candidates?.length && (
                <div className="p-6 text-center mt-16 space-y-2">
                  <div className="w-10 h-10 rounded-full bg-white/[0.02] border border-white/[0.05] flex items-center justify-center mx-auto">
                    <Users className="h-4 w-4 text-white/20" />
                  </div>
                  <p className="text-xs text-white/40 font-medium">No candidates yet</p>
                  <p className="text-[10px] text-white/25 max-w-[160px] mx-auto leading-relaxed">
                    Auto-sourcing sweeps talent sources and populates here automatically.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Candidate Profile Sheet with Role & Company Context Citations ── */}
      <Sheet open={!!selectedCandidate} onOpenChange={(open) => !open && setSelectedCandidate(null)}>
        <SheetContent side="right" className="bg-[#111111] border-l border-white/[0.08] w-full sm:max-w-xl text-white p-0 flex flex-col">
          <SheetHeader className="p-6 border-b border-white/[0.08] bg-[#141414] shrink-0">
            <div className="flex items-start justify-between">
              <div>
                <SheetTitle className="text-base font-semibold text-white flex items-center gap-2">
                  {selectedCandidate?.candidate_profiles?.name || "Candidate Profile"}
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#00D604]/10 text-[#00D604] border border-[#00D604]/30">
                    Shortlisted Candidate
                  </span>
                </SheetTitle>
                <SheetDescription className="text-xs text-white/50 mt-1">
                  {selectedCandidate?.candidate_profiles?.bio || "Discovered through autonomous multi-signal sourcing"}
                </SheetDescription>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-white/60 pt-3">
              {selectedCandidate?.candidate_profiles?.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-white/30" />
                  {selectedCandidate.candidate_profiles.location}
                </span>
              )}
              {selectedCandidate?.candidate_profiles?.resume_link && (
                <a
                  href={selectedCandidate.candidate_profiles.resume_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#0A66C2]/10 border border-[#0A66C2]/30 text-[#0A66C2] hover:bg-[#0A66C2]/20 transition-colors"
                  title="Open network profile"
                  aria-label="Open network profile"
                >
                  <LinkedInIcon className="h-3.5 w-3.5 fill-current" />
                  <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                </a>
              )}
            </div>
          </SheetHeader>

          {/* Profile Body with Context Citations */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Fit Score Card */}
            <div className="p-4 rounded-xl border border-white/[0.08] bg-white/[0.02] flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono text-white/40 uppercase tracking-wider">Evaluation Score</div>
                <div className="text-xl font-mono font-bold text-[#00D604]">
                  {selectedCandidate?.fit_score != null
                    ? `${(Number(selectedCandidate.fit_score) * 100).toFixed(0)}% Fit`
                    : "Unassessed"}
                </div>
              </div>
              <div className="text-right">
                <span className="px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-white/[0.06] text-white/80 border border-white/[0.12]">
                  {selectedCandidate?.decision_packet?.evaluation_metrics?.decision_readiness || "Unverified Provider Profile"}
                </span>
              </div>
            </div>

            {/* Grounded Evidence Citations */}
            <div className="rounded-xl border border-white/[0.08] bg-[#161616] p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#00D604]" />
                  <h4 className="text-xs font-semibold text-white uppercase tracking-wider">
                    Verified Evidence Citations
                  </h4>
                </div>
                <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-white/[0.06] text-white/70 border border-white/[0.12]">
                  {Array.isArray(selectedCandidate?.decision_packet?.evidence_refs)
                    ? `${selectedCandidate.decision_packet.evidence_refs.length} Span(s)`
                    : "0 Verified Citations"}
                </span>
              </div>

              {Array.isArray(selectedCandidate?.decision_packet?.evidence_refs) &&
              selectedCandidate.decision_packet.evidence_refs.length > 0 ? (
                <div className="space-y-2.5">
                  {selectedCandidate.decision_packet.evidence_refs.slice(0, 4).map((ev, idx) => (
                    <div key={ev.id || idx} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-[#00D604]">
                          [{ev.filename || "Candidate Document"} · {ev.locator || `Chars ${ev.source_offset?.start_offset ?? 0}-${ev.source_offset?.end_offset ?? 0}`}]
                        </span>
                        <span className="text-[9px] font-mono text-white/50">{ev.source_tier || "document"}</span>
                      </div>
                      {ev.excerpt && (
                        <blockquote className="border-l-2 border-[#00D604]/50 pl-2.5 text-[11px] text-white/60 italic">
                          &ldquo;{ev.excerpt}&rdquo;
                        </blockquote>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/50 leading-relaxed">
                  No verified evidence citations recorded yet. Open the Decision Packet to upload candidate documents and generate a grounded Claim-to-Proof evaluation.
                </p>
              )}
            </div>

            {/* View Full Decision Packet Button */}
            <div className="pt-2">
              <Button
                onClick={() => router.push(`/employer/packet/${selectedCandidate.id}`)}
                className="w-full bg-[#00D604] text-black hover:bg-[#00D604]/90 h-10 text-xs font-semibold rounded-xl flex items-center justify-center gap-2"
              >
                <span>View Full Decision Packet</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Manual Candidate Injection Modal */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-[#141414] border-white/[0.08] max-w-sm text-white rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold tracking-tight text-white/90">
              Inject Candidate Profile
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddCandidate} className="space-y-3 mt-1">
            {[
              { key: "candidate_name", label: "Full Name",    placeholder: "Elena Rostova",  required: true },
              { key: "current_role",   label: "Current Role", placeholder: "Staff Database Engineer" },
              { key: "current_company",label: "Company",      placeholder: "Distributed Labs"        },
              { key: "skills",         label: "Skills",       placeholder: "Postgres, Raft, Go, CockroachDB" },
              { key: "linkedin_url",   label: "Network Profile URL", placeholder: "https://linkedin.com/in/elena-rostova" },
            ].map(field => (
              <div key={field.key}>
                <Label className="text-[10px] uppercase tracking-wider text-white/40 font-mono flex items-center gap-1.5">
                  {field.key === "linkedin_url" && <LinkedInIcon className="h-3 w-3 fill-current text-[#0A66C2]" />}
                  {field.label}
                </Label>
                <Input
                  value={addForm[field.key]}
                  onChange={e => setAddForm(f => ({ ...f, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  required={field.required}
                  className="mt-1 bg-white/[0.04] border-white/[0.08] h-8 text-xs text-white rounded-lg focus:border-[#00D604]"
                />
              </div>
            ))}
            <Button
              type="submit"
              disabled={adding}
              className="w-full bg-[#00D604] text-black hover:bg-[#00D604]/90 h-8 text-xs font-semibold mt-2 rounded-lg"
            >
              {adding && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
              {adding ? "Injecting Profile..." : "Inject Profile"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
