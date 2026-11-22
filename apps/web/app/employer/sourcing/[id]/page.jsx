"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { toast } from "sonner";
import NaiveShell from "@/components/NaiveShell";
import { Skeleton } from "@/components/ui/skeleton";
import SourcingPanel from "@/components/sourcing/SourcingPanel";
import AutonomousAgentSourcingView from "@/components/sourcing/AutonomousAgentSourcingView";
import { Loader2, ArrowLeft, Briefcase, Users, FileText, ChevronRight, Zap, Search, Sparkles } from "lucide-react";
import Link from "next/link";

export default function SourcingHubPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const initialTab = searchParams.get("tab") === "direct" ? "direct" : "agents";
  const [activeTab, setActiveTab] = useState(initialTab);

  const [brief, setBrief] = useState(null);
  const [hiringRun, setHiringRun] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRoleContext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // First try fetching directly as hiring run brief
      const res = await api.get(`/employer/brief/${id}`);
      if (res.data?.brief) {
        setBrief(res.data.brief);
      }
      if (res.data?.hiring_run) {
        setHiringRun(res.data.hiring_run);
      }
    } catch (err) {
      // If id was a sourcing session ID, attempt resolving via session endpoint
      try {
        const sessionRes = await api.get(`/employer/sourcing-sessions/${id}`);
        const runId = sessionRes.data?.session?.hiring_run_id || sessionRes.data?.hiring_run?.id;
        if (sessionRes.data?.hiring_run) {
          setHiringRun(sessionRes.data.hiring_run);
        }
        if (runId) {
          const runBriefRes = await api.get(`/employer/brief/${runId}`);
          setBrief(runBriefRes.data?.brief || null);
          if (runBriefRes.data?.hiring_run) {
            setHiringRun(runBriefRes.data.hiring_run);
          }
        }
      } catch (innerErr) {
        const msg = err.response?.data?.error || err.message || "Failed to load role details for sourcing.";
        setError(msg);
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) fetchRoleContext();
    });
    return () => { cancelled = true; };
  }, [fetchRoleContext]);

  const hiringRunId = hiringRun?.id || brief?.hiring_run_id || id;
  const rawRoleTitle = hiringRun?.role_title || brief?.role_title || "Database Architect";
  const roleTitle = rawRoleTitle.length > 35 ? rawRoleTitle.slice(0, 32) + "..." : rawRoleTitle;

  if (loading) {
    return (
      <NaiveShell
        user={user}
        activeSection="sourcing"
        pageTitle="Candidate Sourcing Hub"
        pageSubtitle="Initializing sourcing intelligence & talent graph..."
        goBack="/employer"
      >
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
          <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
            <Skeleton className="h-5 w-48 bg-white/[0.04]" />
            <Skeleton className="h-8 w-32 rounded-lg bg-white/[0.04]" />
          </div>
          <div className="p-4 rounded-xl border border-white/[0.08] bg-[#0A0A0A] flex items-center justify-between">
            <Skeleton className="h-6 w-64 bg-white/[0.04]" />
            <Skeleton className="h-6 w-32 bg-white/[0.04]" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-96 rounded-xl bg-white/[0.04]" />
            <div className="lg:col-span-2 space-y-4">
              <Skeleton className="h-44 rounded-xl bg-white/[0.04]" />
              <Skeleton className="h-44 rounded-xl bg-white/[0.04]" />
            </div>
          </div>
        </div>
      </NaiveShell>
    );
  }

  return (
    <NaiveShell
      user={user}
      activeSection="sourcing"
      title="Candidate Sourcing Hub"
      breadcrumbs={[
        { label: "Dashboard", href: "/employer" },
        { label: roleTitle, href: `/employer/brief/${hiringRunId}` },
        { label: activeTab === "direct" ? "Global Talent Search" : "Autonomous Sourcing" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Link
            href={`/employer/shortlist/${hiringRunId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-white/[0.04] text-white/80 hover:bg-white/[0.08] border border-white/10 transition-colors"
          >
            <Users className="h-3.5 w-3.5 text-[#00D604]" />
            Shortlist
          </Link>
          <Link
            href={`/employer/brief/${hiringRunId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-white/[0.04] text-white/80 hover:bg-white/[0.08] border border-white/10 transition-colors"
          >
            <FileText className="h-3.5 w-3.5 text-white/50" />
            Role Brief
          </Link>
        </div>
      }
    >
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6" data-testid="sourcing-hub-page">
        {/* Navigation Breadcrumb & Header Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 text-xs text-white/40 font-mono">
            <Link href="/employer" className="hover:text-white transition-colors">Dashboard</Link>
            <span>/</span>
            <Link href={`/employer/brief/${hiringRunId}`} className="hover:text-white transition-colors text-white/80 font-medium">
              {roleTitle}
            </Link>
            <span>/</span>
            <span className="text-[#00D604] font-medium">
              {activeTab === "direct" ? "Global Talent Search" : "Autonomous Sourcing"}
            </span>
          </div>

          {/* Sourcing Mode Segmented Control */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.08] w-fit">
            <button
              type="button"
              onClick={() => setActiveTab("agents")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === "agents"
                  ? "bg-[#E1E1E5] text-[#030303] font-semibold shadow-xs"
                  : "text-white/60 hover:text-white hover:bg-white/[0.04]"
              }`}
              data-testid="tab-agents"
            >
              <Zap className="h-3.5 w-3.5" />
              Autonomous Agents
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("direct")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === "direct"
                  ? "bg-[#E1E1E5] text-[#030303] font-semibold shadow-xs"
                  : "text-white/60 hover:text-white hover:bg-white/[0.04]"
              }`}
              data-testid="tab-direct"
            >
              <Search className="h-3.5 w-3.5" />
              Global Talent Search (800M+)
            </button>
          </div>
        </div>

        {/* Dynamic Sourcing Mode View */}
        {activeTab === "agents" ? (
          <AutonomousAgentSourcingView
            hiringRunId={hiringRunId}
            roleTitle={roleTitle}
            initialBrief={brief}
          />
        ) : (
          <SourcingPanel
            hiringRunId={hiringRunId}
            orgId={hiringRun?.org_id || brief?.org_id}
            userRole={user?.role || "recruiter"}
            roleTitle={hiringRun?.role_title || brief?.role_title || ""}
            initialLocation={brief?.location || ""}
            initialMustHaves={brief?.must_haves || brief?.explicit_requirements || []}
          />
        )}
      </div>
    </NaiveShell>
  );
}
