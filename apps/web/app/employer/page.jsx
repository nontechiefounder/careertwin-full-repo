"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import NaiveShell from "@/components/NaiveShell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Frame,
  FramePanel,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FrameFooter,
  WorkforceKpiStrip,
} from "@/components/ui/frame";
import {
  Plus,
  ArrowRight,
  Briefcase,
  Search,
  Sparkles,
  Users,
  UserPlus,
  Download,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { evaluateProofContractReadiness } from "@/lib/proofContractReadiness";

export default function Dashboard() {
  const router = useRouter();
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await api.get("/employer/analytics");
        setAnalytics(res.data);
      } catch (err) {
        try {
          const res = await api.get("/employer/hiring-runs");
          setAnalytics({
            summary: {
              active_roles: res.data.length,
              total_candidates: 0,
              total_shortlisted: 0,
              screens_completed: 0,
              packets_generated: 0,
            },
            stage_counts: {},
            runs: res.data.map((r) => ({
              ...r,
              candidates_count: 0,
              shortlisted_count: 0,
              screens_completed: 0,
            })),
            recent_activity: [],
          });
        } catch {
          // Silent fallback in initial dev loading
        }
      } finally {
        setLoading(false);
      }
    };
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 30000);
    return () => clearInterval(interval);
  }, []);

  const s = analytics?.summary || {};

  // Canonical dashboard stat cards — strictly backed by API fields (preserves Vitest contract)
  const statCards = [
    {
      label: "ACTIVE ROLES",
      value: loading ? (
        <Skeleton className="h-8 w-16 bg-white/[0.04]" />
      ) : s.active_roles != null ? (
        s.active_roles
      ) : (
        "Not available"
      ),
      sub: "active hiring workflows",
      testid: "stat-active-roles",
    },
    {
      label: "CANDIDATES",
      value: loading ? (
        <Skeleton className="h-8 w-16 bg-white/[0.04]" />
      ) : s.total_candidates != null ? (
        s.total_candidates
      ) : (
        "Not available"
      ),
      sub: "pipeline cohort",
      testid: "stat-candidates",
    },
    {
      label: "SHORTLISTED",
      value: loading ? (
        <Skeleton className="h-8 w-16 bg-white/[0.04]" />
      ) : s.total_shortlisted != null ? (
        s.total_shortlisted
      ) : (
        "Not available"
      ),
      sub: "verified candidates",
      testid: "stat-shortlisted",
    },
    {
      label: "PACKETS COMPILED",
      value: loading ? (
        <Skeleton className="h-8 w-16 bg-white/[0.04]" />
      ) : s.packets_generated != null ? (
        s.packets_generated
      ) : (
        "Not available"
      ),
      sub: "evidence review packets",
      testid: "stat-packets-compiled",
    },
  ];

  // Hero `Workspace overview` 4-column metrics — strictly API-backed, never fabricated
  const kpiSparklineMetrics = [
    {
      icon: Briefcase,
      label: "Active roles",
      value: loading
        ? "…"
        : s.active_roles != null
        ? String(s.active_roles)
        : "Unavailable",
      disablePeriodScale: true,
      sparkline: null,
    },
    {
      icon: Users,
      label: "Pipeline candidates",
      value: loading
        ? "…"
        : s.total_candidates != null
        ? String(s.total_candidates)
        : "Unavailable",
      disablePeriodScale: true,
      sparkline: null,
    },
    {
      icon: UserPlus,
      label: "Shortlisted",
      value: loading
        ? "…"
        : s.total_shortlisted != null
        ? String(s.total_shortlisted)
        : "Unavailable",
      disablePeriodScale: true,
      sparkline: null,
    },
    {
      icon: FileText,
      label: "Packets compiled",
      value: loading
        ? "…"
        : s.packets_generated != null
        ? String(s.packets_generated)
        : "Unavailable",
      disablePeriodScale: true,
      sparkline: null,
    },
  ];

  // Filtered runs based on search and status
  const runs = analytics?.runs;
  const filteredRuns = useMemo(() => {
    if (!runs) return [];
    return runs.filter((run) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        run.role_title?.toLowerCase().includes(q) ||
        run.company?.toLowerCase().includes(q);
      if (!matchesSearch) return false;

      if (statusFilter === "all") return true;
      const statusLower = (run.status || "active").toLowerCase();
      if (statusFilter === "active")
        return statusLower === "active" || statusLower === "sourcing";
      if (statusFilter === "draft") return statusLower === "draft";
      if (statusFilter === "review")
        return (
          run.candidates_count > 0 &&
          run.screens_completed < run.candidates_count
        );
      if (statusFilter === "completed")
        return statusLower === "completed" || statusLower === "archived";
      return true;
    });
  }, [runs, searchQuery, statusFilter]);

  const handleExportCsv = () => {
    try {
      const rows = [
        ["Metric", "Value"],
        ["Active Roles", s.active_roles != null ? String(s.active_roles) : "Unavailable"],
        ["Candidates", s.total_candidates != null ? String(s.total_candidates) : "Unavailable"],
        ["Shortlisted", s.total_shortlisted != null ? String(s.total_shortlisted) : "Unavailable"],
        ["Screens Completed", s.screens_completed != null ? String(s.screens_completed) : "Unavailable"],
        ["Packets Compiled", s.packets_generated != null ? String(s.packets_generated) : "Unavailable"],
      ];
      const csv = rows.map((r) => r.join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "workbyline-workspace-metrics.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Ignore in non-DOM test environments
    }
  };

  const totalCandidates = typeof s.total_candidates === "number" ? s.total_candidates : 0;
  const screensCompleted = typeof s.screens_completed === "number" ? s.screens_completed : 0;
  const totalShortlisted = typeof s.total_shortlisted === "number" ? s.total_shortlisted : 0;
  const packetsCompiled = typeof s.packets_generated === "number" ? s.packets_generated : 0;
  const pipelinePct =
    totalCandidates > 0
      ? Math.min(100, Math.round((packetsCompiled / totalCandidates) * 100))
      : 0;
  const recentActivity = Array.isArray(analytics?.recent_activity)
    ? analytics.recent_activity
    : [];

  return (
    <NaiveShell
      pageTitle="Dashboard"
      pageSubtitle="Workforce & Hiring Proof Overview"
      showRightPanel={false}
      topBar={
        <div className="flex items-center gap-2">
          {/* Export Button (`↓ Export`) */}
          <button
            type="button"
            onClick={handleExportCsv}
            style={{
              backgroundColor: "var(--wbl-primary-bg)",
              color: "var(--wbl-primary-fg)",
            }}
            className="h-8 px-3 rounded-lg text-[11.5px] font-semibold inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity shadow-xs"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export</span>
          </button>

          {/* Create Role Button (`data-testid="new-role-top-btn"`) */}
          <button
            type="button"
            onClick={() => router.push("/employer/intake")}
            className="btn-ghost !h-8 !px-3 !text-[11.5px]"
            data-testid="new-role-top-btn"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create Role</span>
          </button>
        </div>
      }
    >
      <div className="px-6 py-5 space-y-4">
        {/* 1. HERO `Workspace overview` FRAME */}
        <WorkforceKpiStrip
          title="Workspace overview"
          subtitle="Organization-scoped hiring metrics from your connected database."
          metrics={kpiSparklineMetrics}
          footerLeft={
            analytics
              ? `${s.active_roles ?? 0} active roles, ${s.total_candidates ?? 0} candidates in pipeline.`
              : "Loading connected workspace records."
          }
          footerRight="View active roles"
          onFooterAction={() => {
            if (typeof document !== "undefined") {
              const el = document.getElementById("roles-directory-card");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }
          }}
        />

        {/* 2. 2-COLUMN BENTO GRID: LEFT 2/3 WORKSPACE ACTIVITY + RIGHT 1/3 PROOF PIPELINE & HRIS STATUS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* LEFT 8 COLUMNS: RECENT WORKSPACE ACTIVITY & HIRING RUNS */}
          <div id="schedule-calendar-card" className="lg:col-span-8 flex flex-col">
            <Frame className="flex-1 flex flex-col">
              <FrameHeader className="px-3.5 py-2.5 flex-wrap gap-2">
                <div>
                  <FrameTitle className="text-[13.5px]">
                    Workspace Activity & Review Queue
                  </FrameTitle>
                  <FrameDescription>
                    Recent events recorded across active hiring runs.
                  </FrameDescription>
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/employer/intake")}
                  style={{
                    backgroundColor: "var(--wbl-panel-bg)",
                    borderColor: "var(--wbl-frame-border)",
                    color: "var(--wbl-text-main)",
                  }}
                  className="h-7 px-2.5 rounded-lg border text-[11.5px] font-medium hover:opacity-90 transition-opacity"
                >
                  New Role
                </button>
              </FrameHeader>

              <FramePanel className="!p-4 flex-1 flex flex-col justify-between">
                {recentActivity.length > 0 ? (
                  <div className="divide-y" style={{ borderColor: "var(--wbl-frame-border)" }}>
                    {recentActivity.slice(0, 6).map((item, idx) => (
                      <div
                        key={item.id || idx}
                        className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                        style={{ borderColor: "var(--wbl-frame-border)" }}
                      >
                        <div className="min-w-0">
                          <p
                            className="text-[12px] font-medium truncate"
                            style={{ color: "var(--wbl-text-main)" }}
                          >
                            {item.title || item.event_type || "Workspace update"}
                          </p>
                          {item.detail && (
                            <p
                              className="text-[11px] truncate"
                              style={{ color: "var(--wbl-text-muted)" }}
                            >
                              {item.detail}
                            </p>
                          )}
                        </div>
                        {item.created_at && (
                          <span
                            className="text-[10.5px] font-mono shrink-0"
                            style={{ color: "var(--wbl-text-muted)" }}
                          >
                            {new Date(item.created_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center space-y-2">
                    <CheckCircle2
                      className="h-5 w-5"
                      style={{ color: "var(--wbl-text-muted)" }}
                    />
                    <p
                      className="text-[12.5px] font-medium"
                      style={{ color: "var(--wbl-text-main)" }}
                    >
                      No recent workspace activity
                    </p>
                    <p
                      className="text-[11px] max-w-sm"
                      style={{ color: "var(--wbl-text-muted)" }}
                    >
                      Events appear here when candidates are screened, shortlisted, or evaluated in an active hiring run.
                    </p>
                  </div>
                )}
              </FramePanel>
            </Frame>
          </div>

          {/* RIGHT 4 COLUMNS: PROOF PIPELINE PROGRESS + HRIS INTEGRATION STATUS */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            {/* CARD 1: PROOF REVIEW PIPELINE */}
            <Frame id="review-cycle-card">
              <FrameHeader className="px-3.5 py-2">
                <div>
                  <FrameTitle className="text-[13.5px]">
                    Proof review pipeline
                  </FrameTitle>
                  <FrameDescription>
                    Verified API counts across your organization.
                  </FrameDescription>
                </div>
              </FrameHeader>

              <FramePanel className="!p-4 space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span style={{ color: "var(--wbl-text-muted)" }}>
                      Packets compiled
                    </span>
                    <span
                      className="font-mono font-semibold tabular-nums"
                      style={{ color: "var(--wbl-text-main)" }}
                    >
                      {packetsCompiled} / {totalCandidates}
                    </span>
                  </div>
                  <div
                    className="h-1.5 w-full rounded-full overflow-hidden"
                    style={{ backgroundColor: "var(--wbl-input-bg)" }}
                  >
                    <div
                      className="h-full rounded-full bg-[#00D604] transition-all duration-300"
                      style={{ width: `${pipelinePct}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div
                    className="rounded-xl p-3 text-center border"
                    style={{
                      backgroundColor: "var(--wbl-input-bg)",
                      borderColor: "var(--wbl-frame-border)",
                    }}
                  >
                    <div className="text-[15px] font-bold text-[#00D604] tabular-nums">
                      {screensCompleted}
                    </div>
                    <div
                      className="text-[10.5px] mt-1"
                      style={{ color: "var(--wbl-text-muted)" }}
                    >
                      Screened
                    </div>
                  </div>

                  <div
                    className="rounded-xl p-3 text-center border"
                    style={{
                      backgroundColor: "var(--wbl-input-bg)",
                      borderColor: "var(--wbl-frame-border)",
                    }}
                  >
                    <div className="text-[15px] font-bold text-[#F59E0B] tabular-nums">
                      {totalShortlisted}
                    </div>
                    <div
                      className="text-[10.5px] mt-1"
                      style={{ color: "var(--wbl-text-muted)" }}
                    >
                      Shortlisted
                    </div>
                  </div>

                  <div
                    className="rounded-xl p-3 text-center border"
                    style={{
                      backgroundColor: "var(--wbl-input-bg)",
                      borderColor: "var(--wbl-frame-border)",
                    }}
                  >
                    <div className="text-[15px] font-bold text-[#6366F1] tabular-nums">
                      {packetsCompiled}
                    </div>
                    <div
                      className="text-[10.5px] mt-1"
                      style={{ color: "var(--wbl-text-muted)" }}
                    >
                      Packets
                    </div>
                  </div>
                </div>
              </FramePanel>
            </Frame>

            {/* CARD 2: ORGANIZATION HRIS TELEMETRY */}
            <Frame className="flex-1 flex flex-col">
              <FrameHeader className="px-3.5 py-2">
                <div>
                  <FrameTitle className="text-[13.5px]">
                    Organization headcount
                  </FrameTitle>
                  <FrameDescription>HRIS directory sync status.</FrameDescription>
                </div>
              </FrameHeader>

              <FramePanel className="!p-4 flex-1 flex flex-col justify-between gap-2">
                <div>
                  <div
                    className="text-[18px] font-semibold leading-tight"
                    style={{ color: "var(--wbl-text-main)" }}
                  >
                    Not configured
                  </div>
                  <p
                    className="text-[11.5px] mt-2 leading-relaxed"
                    style={{ color: "var(--wbl-text-muted)" }}
                  >
                    External HRIS headcount, attrition, and calendar integrations are not connected to this workspace.
                  </p>
                </div>
              </FramePanel>
            </Frame>
          </div>
        </div>

        {/* 3. CANONICAL STAT CARDS INSIDE RECESSED FRAME (Preserves Vitest data-testids) */}
        <Frame>
          <FrameHeader>
            <FrameTitle>Pipeline Telemetry Summary</FrameTitle>
            <FrameDescription>
              Live organization-scoped counts across active hiring runs
            </FrameDescription>
          </FrameHeader>
          <div
            className="grid grid-cols-2 sm:grid-cols-4 gap-2"
            data-testid="dashboard-stat-cards"
          >
            {statCards.map((card, i) => (
              <FramePanel key={i} className="!p-4" data-testid={card.testid}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="mono-label">{card.label}</p>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00D604]" />
                </div>
                <div
                  className="text-2xl font-mono font-semibold leading-none mb-1 tabular-nums"
                  style={{ color: "var(--wbl-text-main)" }}
                  data-testid={`stat-val-${card.label
                    .toLowerCase()
                    .replace(/\s+/g, "-")}`}
                >
                  {loading ? (
                    <Skeleton
                      className="h-6 w-12"
                      style={{ backgroundColor: "var(--wbl-input-bg)" }}
                    />
                  ) : (
                    card.value
                  )}
                </div>
                <p
                  className="text-[10px]"
                  style={{ color: "var(--wbl-text-muted)" }}
                >
                  {card.sub}
                </p>
              </FramePanel>
            ))}
          </div>
        </Frame>

        {/* 4. ROLES DIRECTORY & PIPELINE QUEUE INSIDE RECESSED FRAME */}
        <Frame id="roles-directory-card">
          <FrameHeader className="flex-wrap gap-3">
            <div>
              <FrameTitle>Active Role Cohorts & Proof Contracts</FrameTitle>
              <FrameDescription>
                Filter by workflow stage, approve rubrics, or jump into
                candidate shortlists
              </FrameDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Search Input */}
              <div className="relative w-60">
                <Search
                  className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--wbl-text-muted)" }}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search roles or company..."
                  className="naive-input w-full h-8 pl-8 pr-3 text-xs"
                  data-testid="roles-search-input"
                />
              </div>

              {/* Status Filter Pills */}
              <div
                className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border"
                style={{
                  backgroundColor: "var(--wbl-input-bg)",
                  borderColor: "var(--wbl-frame-border)",
                }}
              >
                {[
                  { id: "all", label: "All Roles" },
                  { id: "active", label: "Active" },
                  { id: "draft", label: "Drafts" },
                  { id: "review", label: "Needs Review" },
                  { id: "completed", label: "Completed" },
                ].map((pill) => {
                  const active = statusFilter === pill.id;
                  return (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => setStatusFilter(pill.id)}
                      style={
                        active
                          ? {
                              backgroundColor: "var(--nav-selected-bg)",
                              color: "var(--nav-selected-fg)",
                              borderColor: "var(--wbl-frame-border)",
                            }
                          : {
                              color: "var(--wbl-text-muted)",
                            }
                      }
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all shrink-0 flex items-center gap-1.5 ${
                        active ? "font-semibold shadow-xs border" : ""
                      }`}
                      data-testid={`filter-${pill.id}`}
                    >
                      {active && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00D604]" />
                      )}
                      {pill.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </FrameHeader>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <FramePanel key={i} className="h-24 animate-pulse" />
              ))}
            </div>
          ) : filteredRuns.length === 0 ? (
            <FramePanel className="py-10 text-center">
              <Briefcase
                className="h-6 w-6 mx-auto mb-2.5 opacity-40"
                style={{ color: "var(--wbl-text-muted)" }}
              />
              <p
                className="text-sm font-medium mb-1"
                style={{ color: "var(--wbl-text-main)" }}
              >
                {searchQuery
                  ? "No matching roles found"
                  : "No roles in this view"}
              </p>
              <p
                className="text-xs mb-4 max-w-sm mx-auto"
                style={{ color: "var(--wbl-text-muted)" }}
              >
                {searchQuery
                  ? `Clear search query "${searchQuery}" or switch filters.`
                  : "Create a new role to start building evidence-governed candidate review packets."}
              </p>
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="btn-ghost mx-auto"
                >
                  Clear Search
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => router.push("/employer/intake")}
                  className="btn-white mx-auto"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create Role</span>
                </button>
              )}
            </FramePanel>
          ) : (
            <div className="space-y-2">
              {filteredRuns.map((run) => {
                const readiness = evaluateProofContractReadiness(run);
                const briefJson = run.brief_json || {};
                const isRubricApproved = briefJson.contract_approved === true;
                const unreviewedCandidates =
                  (run.candidates_count || 0) - (run.screens_completed || 0);

                let taskLabel = "Candidate Sourcing Ready";
                let taskCta = "Find Candidates";
                let taskHref = `/employer/sourcing/${run.id}`;
                let taskColor =
                  "text-[var(--wbl-emerald-text)] border-[#00D604]/30 bg-[#00D604]/10";

                if (!readiness.isComplete) {
                  taskLabel = "Role Intake Incomplete";
                  taskCta = "Complete Intake";
                  taskHref = `/employer/intake?id=${run.id}`;
                  taskColor =
                    "text-amber-400 border-amber-500/30 bg-amber-500/12";
                } else if (!isRubricApproved) {
                  taskLabel = "Criteria Approval Required";
                  taskCta = "Approve Criteria";
                  taskHref = `/employer/brief/${run.id}`;
                  taskColor =
                    "text-amber-300 border-amber-500/30 bg-amber-500/12";
                } else if (unreviewedCandidates > 0) {
                  taskLabel = `${unreviewedCandidates} unreviewed candidate${
                    unreviewedCandidates === 1 ? "" : "s"
                  }`;
                  taskCta = "Review Next";
                  taskHref = `/employer/shortlist/${run.id}`;
                  taskColor = "text-blue-400 border-blue-500/30 bg-blue-500/12";
                }

                return (
                  <FramePanel
                    key={run.id}
                    className="!p-4 hover:border-[#484848] transition-all"
                    data-testid={`role-card-${run.id}`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Role Title & Metadata */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                          <h3
                            className="text-sm font-semibold hover:text-[var(--wbl-emerald-text)] transition-colors cursor-pointer truncate"
                            style={{ color: "var(--wbl-text-main)" }}
                            onClick={() =>
                              router.push(`/employer/brief/${run.id}`)
                            }
                          >
                            {run.role_title}
                          </h3>
                          <span
                            className="text-[9px] font-mono uppercase px-2 py-0.5 rounded-md border"
                            style={{
                              backgroundColor: "var(--wbl-input-bg)",
                              color: "var(--wbl-text-muted)",
                              borderColor: "var(--wbl-frame-border)",
                            }}
                          >
                            {run.status?.toUpperCase() || "ACTIVE"}
                          </span>
                          <span
                            className={`text-[9px] font-mono px-2 py-0.5 rounded-md border ${taskColor}`}
                          >
                            {taskLabel}
                          </span>
                        </div>

                        <div
                          className="flex items-center gap-3 text-xs"
                          style={{ color: "var(--wbl-text-muted)" }}
                        >
                          {run.company && <span>{run.company}</span>}
                          {run.location && <span>· {run.location}</span>}
                          <span>
                            · Created{" "}
                            {new Date(run.created_at).toLocaleDateString(
                              "en-US",
                              { month: "short", day: "numeric" }
                            )}
                          </span>
                        </div>
                      </div>

                      {/* Scoped Role Metrics */}
                      <div className="flex items-center gap-4 sm:gap-6 shrink-0">
                        <div className="text-center">
                          <div
                            className="text-sm font-mono font-semibold tabular-nums"
                            style={{ color: "var(--wbl-text-main)" }}
                          >
                            {run.candidates_count != null
                              ? run.candidates_count
                              : 0}
                          </div>
                          <div
                            className="text-[10px] uppercase tracking-wider"
                            style={{ color: "var(--wbl-text-muted)" }}
                          >
                            Cohort
                          </div>
                        </div>
                        <div className="text-center">
                          <div
                            className="text-sm font-mono font-semibold tabular-nums"
                            style={{ color: "var(--wbl-text-main)" }}
                          >
                            {run.screens_completed != null
                              ? run.screens_completed
                              : 0}
                          </div>
                          <div
                            className="text-[10px] uppercase tracking-wider"
                            style={{ color: "var(--wbl-text-muted)" }}
                          >
                            Reviewed
                          </div>
                        </div>
                        <div className="text-center">
                          <div
                            className="text-sm font-mono font-semibold tabular-nums"
                            style={{ color: "var(--wbl-emerald-text)" }}
                          >
                            {run.shortlisted_count != null
                              ? run.shortlisted_count
                              : 0}
                          </div>
                          <div
                            className="text-[10px] uppercase tracking-wider"
                            style={{ color: "var(--wbl-text-muted)" }}
                          >
                            Shortlisted
                          </div>
                        </div>

                        {/* Action CTA Buttons */}
                        <div
                          className="flex items-center gap-2 border-l pl-4"
                          style={{ borderColor: "var(--wbl-frame-border)" }}
                        >
                          <button
                            type="button"
                            onClick={() => router.push(taskHref)}
                            className="btn-white !py-1.5 !px-3 !text-xs"
                            data-testid={`role-primary-cta-${run.id}`}
                          >
                            <span>{taskCta}</span>
                            <ArrowRight className="h-3 w-3" />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/employer/sourcing/${run.id}`)
                            }
                            className="btn-ghost hidden sm:inline-flex"
                            data-testid={`source-btn-${run.id}`}
                          >
                            Find Candidates
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              router.push(`/employer/brief/${run.id}`)
                            }
                            className="btn-ghost"
                            title="Open Role Workspace"
                            data-testid={`brief-btn-${run.id}`}
                          >
                            Workspace
                          </button>
                        </div>
                      </div>
                    </div>
                  </FramePanel>
                );
              })}
            </div>
          )}

          <FrameFooter>
            <span>Showing {filteredRuns.length} role cohort(s)</span>
            <button
              type="button"
              onClick={() => router.push("/employer/chat")}
              className="text-[var(--wbl-emerald-text)] hover:underline font-mono text-[10px] inline-flex items-center gap-1"
            >
              <Sparkles className="h-3 w-3" />
              <span>Ask AI Hiring Assistant across all roles</span>
            </button>
          </FrameFooter>
        </Frame>
      </div>
    </NaiveShell>
  );
}
