"use client";

import { useState, useEffect, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  CheckCircle, AlertCircle, Search, Shield, Loader2, Zap, Sparkles
} from "lucide-react";
import NaiveShell from "@/components/NaiveShell";

// ── Outline section definitions ───────────────────────────────────
const OUTLINE_SECTIONS = [
  { id: "summary",      label: "Role Summary"         },
  { id: "requirements", label: "Requirements"         },
  { id: "screening",    label: "Screening Dimensions" },
  { id: "verification", label: "Verification Focus"   },
  { id: "missing",      label: "Missing Info"         },
];

export default function BriefPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [starting, setStarting]   = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [activeSection, setActive] = useState("summary");

  const fetchBrief = useCallback(async (isRegeneration = false) => {
    if (isRegeneration) setRegenerating(true);
    try {
      const res = await api.get(`/employer/brief/${id}${isRegeneration ? "?force=true" : ""}`);
      setData(res.data);
      if (isRegeneration) toast.success("Brief refreshed with fresh AI synthesis");
    } catch {
      toast.error("Failed to load brief");
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
  }, [id]);

  useEffect(() => {
    fetchBrief();
  }, [fetchBrief]);

  const startSourcing = async () => {
    setStarting(true);
    try {
      const res = await api.post("/employer/sourcing-sessions", { hiring_run_id: id });
      router.push(`/employer/sourcing-session/${res.data.session_id}`);
    } catch { toast.error("Failed to start sourcing"); }
    finally { setStarting(false); }
  };

  if (loading) return (
    <div className="h-screen bg-[#0d0d0d] flex items-center justify-center">
      <Loader2 className="h-5 w-5 text-white/20 animate-spin" />
    </div>
  );

  const brief = data?.brief;
  const run   = data?.hiring_run;

  /* ── Right Panel: agent tasks ─────────────────────────────────── */
  const rightPanel = (
    <div className="p-4 space-y-3">
      {[
        { icon: "⚡", name: "Sourcing Agent",    task: `Source for ${run?.role_title || "this role"}` },
        { icon: "◎", name: "Profile Extractor", task: "Awaiting sourcing run" },
        { icon: "≡", name: "Fit Scorer",         task: "Awaiting profiles" },
      ].map((agent, i) => (
        <div key={i}>
          <div className="flex items-center gap-2 mb-0.5">
            <div className="w-5 h-5 rounded-full bg-white/[0.05] border border-white/[0.07] flex items-center justify-center text-[10px] shrink-0">
              {agent.icon}
            </div>
            <p className="text-[11px] font-medium text-white/45 truncate">{agent.name}</p>
          </div>
          <p className="text-[10px] text-white/22 pl-7 leading-snug">{agent.task}</p>
        </div>
      ))}
    </div>
  );

  /* ── Outline nav (injected as extraNavItems) ─────────────────── */
  const outlineItems = OUTLINE_SECTIONS.filter(s =>
    s.id !== "missing" || (brief?.missing_info?.length || 0) > 0
  ).map(section => ({
    label: section.label,
    active: activeSection === section.id,
    action: () => {
      setActive(section.id);
      document.getElementById(`section-${section.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
  }));

  return (
    <NaiveShell
      pageTitle={run?.role_title || "Hiring Brief"}
      pageSubtitle={run?.company}
      backTo={{ label: "Dashboard", href: "/employer" }}
      extraNavItems={outlineItems}
      rightPanelTitle="Active Agents"
      rightPanel={rightPanel}
      showRightPanel={true}
      topBar={
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono bg-amber-500/15 border border-amber-500/25 text-amber-400/80 px-1.5 py-0.5 rounded-full">
            Review
          </span>
          <button
            onClick={() => router.push(`/employer/intake?id=${id}`)}
            className="btn-ghost"
            data-testid="edit-intake-btn"
          >
            <Search className="h-3.5 w-3.5" />
            Edit Intake
          </button>
          <button
            onClick={() => fetchBrief(true)}
            disabled={regenerating || starting}
            className="btn-ghost text-white/70"
            data-testid="regenerate-brief-btn"
          >
            {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {regenerating ? "Regenerating…" : "Regenerate Brief"}
          </button>
          <button
            onClick={startSourcing}
            disabled={starting || regenerating}
            className="btn-white"
            data-testid="start-sourcing-btn"
          >
            {starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            {starting ? "Starting…" : "Start Sourcing →"}
          </button>
        </div>
      }
      data-testid="brief-page"
    >
      {/* Artifact tab bar */}
      <div className="px-6 py-2 border-b border-white/[0.05] flex items-center gap-1 shrink-0">
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.05] border border-white/[0.07] text-[11px] text-white/55">
          <span className="text-white/30">📄</span> brief.md
        </span>
        <span className="text-[9px] text-white/18 ml-2 font-mono">Markdown · UTF-8</span>
      </div>

      {/* Scrollable brief content */}
      <div className="flex-1 overflow-y-auto px-8 py-6 scrollbar-hide">
        {/* Role Summary */}
        <section id="section-summary" className="mb-8 animate-fade-in">
          <p className="text-[9px] font-mono text-white/20 uppercase tracking-[0.2em] mb-3">01</p>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-white/80">Role Summary</h2>
            {run?.location && (
              <span className="text-[11px] font-mono bg-white/[0.04] border border-white/[0.08] text-white/40 px-2 py-1 rounded-md flex items-center gap-1.5 grayscale opacity-70">
                📍 {run.location}
              </span>
            )}
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <p className="text-[13px] text-white/55 leading-relaxed">
              {brief?.role_summary || "No summary generated."}
            </p>
          </div>
        </section>

        {/* Requirements */}
        <section id="section-requirements" className="mb-8 animate-fade-in stagger-1">
          <p className="text-[9px] font-mono text-white/20 uppercase tracking-[0.2em] mb-3">02</p>
          <h2 className="text-[15px] font-semibold text-white/80 mb-3">Requirements</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle className="h-3.5 w-3.5 text-white/35 shrink-0" />
                <p className="text-[11px] font-semibold text-white/50">Explicit</p>
              </div>
              <ul className="space-y-2">
                {(brief?.explicit_requirements || []).map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-white/50">
                    <span className="text-white/30 mt-0.5 shrink-0">·</span> {r}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div className="flex items-center gap-2 mb-3">
                <Search className="h-3.5 w-3.5 text-white/35 shrink-0" />
                <p className="text-[11px] font-semibold text-white/50">Inferred</p>
              </div>
              <ul className="space-y-2">
                {(brief?.inferred_requirements || []).map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] text-white/50">
                    <span className="text-white/20 mt-0.5 shrink-0">~</span> {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Screening Dimensions */}
        <section id="section-screening" className="mb-8 animate-fade-in stagger-2">
          <p className="text-[9px] font-mono text-white/20 uppercase tracking-[0.2em] mb-3">03</p>
          <h2 className="text-[15px] font-semibold text-white/80 mb-3">Screening Dimensions</h2>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <div className="flex flex-wrap gap-2">
              {(brief?.screening_dimensions || []).map((d, i) => (
                <span key={i} className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[11px] text-white/50">
                  {d}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Verification Focus */}
        <section id="section-verification" className="mb-8 animate-fade-in stagger-3">
          <p className="text-[9px] font-mono text-white/20 uppercase tracking-[0.2em] mb-3">04</p>
          <h2 className="text-[15px] font-semibold text-white/80 mb-3">Verification Focus</h2>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <ul className="space-y-2.5">
              {(brief?.verification_focus || []).map((v, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[12px] text-white/50">
                  <Shield className="h-3.5 w-3.5 text-white/25 mt-0.5 shrink-0" />
                  {v}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Missing Info */}
        {(brief?.missing_info?.length || 0) > 0 && (
          <section id="section-missing" className="mb-8 animate-fade-in stagger-4">
            <p className="text-[9px] font-mono text-white/20 uppercase tracking-[0.2em] mb-3">05</p>
            <h2 className="text-[15px] font-semibold text-white/80 mb-3">Missing Information</h2>
            <div className="rounded-xl border border-amber-500/[0.15] bg-amber-500/[0.04] p-5">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="h-3.5 w-3.5 text-amber-400/60 shrink-0" />
                <p className="text-[11px] text-amber-400/60">These items may reduce sourcing accuracy</p>
              </div>
              <ul className="space-y-2">
                {brief.missing_info.map((m, i) => (
                  <li key={i} className="text-[12px] text-white/45 flex items-start gap-2">
                    <span className="text-amber-400/40 shrink-0 mt-0.5">·</span> {m}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* Bottom action row */}
        <div className="flex items-center gap-2 pt-2 pb-8">
          <button
            onClick={startSourcing}
            disabled={starting}
            className="btn-white"
            data-testid="start-sourcing-btn-2"
          >
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {starting ? "Starting…" : "Start Sourcing Session"}
          </button>
          <button
            onClick={() => router.push(`/employer/shortlist/${id}`)}
            className="btn-ghost"
            data-testid="view-shortlist-btn"
          >
            View Shortlist
          </button>
        </div>
      </div>
    </NaiveShell>
  );
}
