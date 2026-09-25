"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { toast } from "sonner";
import NaiveShell from "@/components/NaiveShell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, ArrowRight, Briefcase, TrendingUp,
  Users, Clock, CheckCircle2, Zap, Target, BarChart3,
  Link2, Shield, FileText, Activity, Eye,
  CircleDot, Search, Filter, Brain, Loader2, ArrowUpRight,
  CheckSquare, AlertTriangle
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid
} from "recharts";
import { evaluateProofContractReadiness } from "@/lib/proofContractReadiness";

const STAGE_CONFIG = {
  sourcing:        { label: "Sourcing",    dotColor: "bg-white/40" },
  reviewing_proof: { label: "Proof",       dotColor: "bg-white/50" },
  shortlisted:     { label: "Shortlisted", dotColor: "bg-white/70" },
  hold:            { label: "On Hold",     dotColor: "bg-white/35" },
  rejected:        { label: "Rejected",    dotColor: "bg-white/20" },
};

export default function Dashboard() {
  const router      = useRouter();
  const { user, logout } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState("pipeline");
  const [showWelcome, setShowWelcome] = useState(false);
  const [tourStep, setTourStep] = useState(0); // 0 = inactive, 1 = start, 2 = intake, 3 = integrations

  useEffect(() => {
    // Check for fresh signup for the product tour
    if (typeof window !== 'undefined' && sessionStorage.getItem('isFreshSignUp') === 'true') {
      setShowWelcome(true);
      setTourStep(1);
    }
  }, []);

  const handleCloseWelcome = () => {
    setShowWelcome(false);
    if (typeof window !== 'undefined') sessionStorage.removeItem('isFreshSignUp');
  };

  const nextTourStep = () => {
    if (tourStep < 3) setTourStep(tourStep + 1);
    else setTourStep(0);
  };

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const res = await api.get("/employer/analytics");
        setAnalytics(res.data);
      } catch (err) {
        try {
          const res = await api.get("/employer/hiring-runs");
          setAnalytics({
            summary: { active_roles: res.data.length, total_candidates: 0, total_shortlisted: 0, screens_completed: 0, packets_generated: 0 },
            stage_counts: {},
            runs: res.data.map(r => ({ ...r, candidates_count: 0, shortlisted_count: 0, screens_completed: 0 })),
            recent_activity: []
          });
        } catch { 
           // Only toast if it's not a fresh init (avoid noise during dev)
           // toast.error("Failed to fetch data"); 
        }
      } finally { setLoading(false); }
    };
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 30000);
    return () => clearInterval(interval);
  }, []);

  const s = analytics?.summary || {};

  // Canonical dashboard stat cards — strictly mapped to API fields
  const statCards = [
    { label: "ACTIVE ROLES",     value: loading ? <Skeleton className="h-8 w-16 bg-white/[0.04]" /> : (s.active_roles != null ? s.active_roles : "Not available"),       sub: "hiring runs", testid: "stat-active-roles" },
    { label: "CANDIDATES",       value: loading ? <Skeleton className="h-8 w-16 bg-white/[0.04]" /> : (s.total_candidates != null ? s.total_candidates : "Not available"), sub: "cohort candidates", testid: "stat-candidates" },
    { label: "SHORTLISTED",      value: loading ? <Skeleton className="h-8 w-16 bg-white/[0.04]" /> : (s.total_shortlisted != null ? s.total_shortlisted : "Not available"), sub: "shortlisted total", testid: "stat-shortlisted" },
    { label: "PACKETS COMPILED", value: loading ? <Skeleton className="h-8 w-16 bg-white/[0.04]" /> : (s.packets_generated != null ? s.packets_generated : "Not available"), sub: "packets compiled", testid: "stat-packets-compiled" },
  ];

  return (
    <NaiveShell
      pageTitle={user?.name ? `${user.name.split(" ")[0]}'s Pipeline` : "Overview"}
      pageSubtitle="Hiring Intelligence Dashboard"
      showRightPanel={true}
      rightPanelTitle="Active Tasks"
      rightPanel={ <div className="flex-1 overflow-y-auto divide-y divide-white/[0.04]">
          {loading ? (
            <div className="px-4 py-8 text-center">
              <Loader2 className="h-4 w-4 text-white/15 animate-spin mx-auto" />
            </div>
          ) : (analytics?.runs?.length || 0) === 0 ? (
            <div className="px-4 py-6">
              <p className="text-[11px] text-white/20">No active pipelines</p>
            </div>
          ) : (
            analytics.runs.slice(0, 6).map(run => (
              <div key={run.id} className="px-4 py-3 hover:bg-white/[0.02] transition-colors cursor-pointer"
                onClick={() => router.push(`/employer/brief/${run.id}`)}>
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    run.status === "sourcing" ? "bg-green-400 animate-pulse" : "bg-white/20"
                  }`} />
                  <p className="text-[11px] font-medium text-white/80 truncate">{run.role_title}</p>
                </div>
                <div className="pl-3.5 mt-0.5">
                  <p className="text-[10px] text-white/40">
                    {run.status === "sourcing" ? "Sourcing candidates..." : run.status === "reviewing" ? "Ready for review" : "Inactive"}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-[9px] font-mono text-white/30 flex items-center gap-1">
                      <Users className="h-2.5 w-2.5" /> {run.candidates_count || 0}
                    </span>
                    <span className="text-[9px] font-mono text-white/30 flex items-center gap-1">
                      <CheckCircle2 className="h-2.5 w-2.5" /> {run.screens_completed || 0}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div> }
      topBar={
        <>
          <button
            onClick={() => router.push("/employer/integrations")}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-white/45 hover:text-white/75 hover:bg-white/[0.05] border border-white/[0.06] transition-all"
          >
            <Link2 className="h-3 w-3" /> Integrations
          </button>
          <button
            onClick={() => router.push("/employer/intake")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-white text-black hover:bg-white/90 transition-all"
          >
            <Plus className="h-3 w-3" /> New Role
          </button>
        </>
      }
    >
      {/* ── Welcome Banner ─────────────────────────── */}
      {showWelcome && (
        <div className="mx-6 mt-6 rounded-2xl border border-[#10D97A]/20 bg-[#10D97A]/[0.03] p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#10D97A]/[0.05] rounded-full blur-[80px] -mr-32 -mt-32" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <h2 className="text-xl font-semibold text-white mb-2">Welcome to CareerTW<span className="text-[#10D97A]">i</span>N!</h2>
              <p className="text-[14px] text-white/50 max-w-xl leading-relaxed">
                Your agency-grade AI hiring engine is ready. Let&apos;s get you started with your first verified sourcing run.
              </p>
            </div>
            <button 
              onClick={handleCloseWelcome}
              className="px-6 py-2.5 rounded-xl bg-[#10D97A] text-black font-semibold text-[13px] hover:bg-[#10D97A]/90 transition-all shadow-[0_0_20px_rgba(16,217,122,0.2)]">
              Skip Tour
            </button>
          </div>
        </div>
      )}

      {/* ── Product Tour Overlays — suppressed in private pilot ── */}

      <div className="px-6 py-5">

          {/* Company welcome card style */}
          <div className="mb-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
            <h2 className="text-[15px] font-semibold text-white/85 mb-1">CareerTWiN</h2>
            <p className="text-[12px] text-white/35 leading-relaxed">
              AI-powered hiring pipeline — source, screen, and shortlist verified candidates for every role.
            </p>
          </div>

          {/* STAT CARDS — Canonical stats mapped directly from API summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6" data-testid="dashboard-stat-cards">
            {statCards.map((card, i) => (
              <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4 hover:border-white/[0.10] transition-colors" data-testid={card.testid}>
                <p className="text-[9px] font-mono text-white/25 uppercase tracking-[0.18em] mb-2">{card.label}</p>
                <div className="text-[24px] font-mono font-semibold text-white leading-none mb-1" data-testid={`stat-val-${card.label.toLowerCase().replace(/\s+/g, '-')}`}>
                  {loading ? <Skeleton className="h-6 w-12 bg-white/10" /> : card.value}
                </div>
                <p className="text-[10px] text-white/25">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* Tab bar */}
          <div className="flex items-center gap-1 mb-5">
            {[
              { id: "pipeline", label: "Pipeline", icon: BarChart3 },
              { id: "kanban",   label: "Kanban",   icon: Activity  },
              { id: "activity", label: "Activity", icon: Eye       },
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-white/[0.08] text-white/85 border border-white/[0.08]"
                    : "text-white/35 hover:text-white/60 hover:bg-white/[0.04] border border-transparent"
                }`}>
                <tab.icon className="h-3 w-3" /> {tab.label}
              </button>
            ))}
          </div>

          {/* ── Pipeline View ── */}
          {activeTab === "pipeline" && (
            <>
              {loading ? (
                <div className="space-y-2.5">
                  {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-xl bg-white/[0.02] animate-pulse border border-white/[0.04]" />)}
                </div>
              ) : (analytics?.runs?.length || 0) === 0 ? (
                <div className="rounded-xl border border-dashed border-white/[0.07] p-14 text-center">
                  <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mx-auto mb-4">
                    <Briefcase className="h-5 w-5 text-white/20" />
                  </div>
                  <p className="text-[13px] font-medium text-white/40 mb-1.5">No active pipelines</p>
                  <p className="text-[11px] text-white/20 mb-5 max-w-xs mx-auto leading-relaxed">
                    Create your first AI-powered role intake to start building verified shortlists.
                  </p>
                  <button onClick={() => router.push("/employer/intake")}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-black text-[12px] font-medium hover:bg-white/90 transition-all mx-auto">
                    <Zap className="h-3.5 w-3.5" /> Start First Intake
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {analytics.runs.map(run => (
                    <div key={run.id}
                      className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:border-white/[0.10] hover:bg-white/[0.035] transition-all">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="text-[13px] font-medium text-white/80 truncate">{run.role_title}</h3>
                            <span className="shrink-0 text-[8px] font-mono tracking-wider px-1.5 py-0.5 rounded-full bg-white/[0.06] text-white/40 border border-white/[0.06]">
                              {run.status?.toUpperCase() || "ACTIVE"}
                            </span>
                          </div>
                          <p className="text-[10px] text-white/28">
                            {run.company}{run.company ? " · " : ""}{new Date(run.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </p>
                        </div>

                      {/* Mini stats — exact counts from API */}
                        <div className="flex items-center gap-5 shrink-0" data-testid={`run-stats-${run.id}`}>
                          {[
                            { label: "Cohort",      val: run.candidates_count != null ? run.candidates_count : "Not available" },
                            { label: "Shortlisted", val: run.shortlisted_count != null ? run.shortlisted_count : "Not available" },
                            { label: "Screened",    val: run.screens_completed != null ? run.screens_completed : "Not available" },
                          ].map((m, i) => (
                            <div key={i} className="text-center hidden sm:block">
                              <p className="text-[15px] font-mono font-semibold text-white/70">{m.val}</p>
                              <p className="text-[9px] text-white/25">{m.label}</p>
                            </div>
                          ))}
                          {/* Proof-contract readiness chip */}
                          {(() => {
                            const readiness = evaluateProofContractReadiness(run);
                            return (
                              <div
                                className={`hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-mono uppercase tracking-wider ${
                                  readiness.isComplete
                                    ? "border-[#10D97A]/30 bg-[#10D97A]/10 text-[#10D97A]"
                                    : "border-amber-500/40 bg-amber-500/10 text-amber-400"
                                }`}
                                data-testid={`proof-status-${run.id}`}
                              >
                                {readiness.isComplete
                                  ? <><CheckSquare className="h-2.5 w-2.5" /> Contract Ready</>
                                  : <><AlertTriangle className="h-2.5 w-2.5" /> Incomplete</>}
                              </div>
                            );
                          })()}
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => router.push(`/employer/shortlist/${run.id}`)}
                              className="px-2.5 py-1.5 rounded-lg border border-white/[0.07] text-[11px] text-white/45 hover:text-white/75 hover:border-white/[0.13] transition-all"
                              data-testid={`shortlist-btn-${run.id}`}
                            >
                              Pipeline
                            </button>
                            <button onClick={() => router.push(`/employer/brief/${run.id}`)}
                              className="px-2.5 py-1.5 rounded-lg border border-white/[0.07] text-[11px] text-white/45 hover:text-white/75 hover:border-white/[0.13] transition-all flex items-center gap-1"
                              data-testid={`brief-btn-${run.id}`}
                            >
                              Brief <ArrowRight className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Pipeline progress bar */}
                      {(run.candidates_count || 0) > 0 && (
                        <div className="mt-3 flex items-center gap-1 h-1 rounded-full overflow-hidden bg-white/[0.03]">
                          {(run.shortlisted_count || 0) > 0 && <div className="h-full bg-white/50 rounded-full" style={{ width: `${(run.shortlisted_count / run.candidates_count) * 100}%` }} />}
                          {(run.hold_count || 0) > 0 && <div className="h-full bg-white/20 rounded-full" style={{ width: `${(run.hold_count / run.candidates_count) * 100}%` }} />}
                          <div className="h-full bg-white/[0.05] rounded-full flex-1" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Charts section */}
              {!loading && (analytics?.runs?.length || 0) > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-5">
                  {/* Stage Distribution */}
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-[11px] font-medium text-white/50">Pipeline Health</p>
                      <span className="text-[9px] font-mono text-white/20 uppercase tracking-wider">Stage dist.</span>
                    </div>
                    <div className="h-[180px] w-full flex items-center justify-center">
                      {analytics?.stage_counts && Object.values(analytics.stage_counts).some(v => v > 0) ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={Object.entries(STAGE_CONFIG).map(([key, cfg]) => ({ name: cfg.label, value: analytics?.stage_counts?.[key] || 0 })).filter(d => d.value > 0)}
                              cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={4} dataKey="value">
                              {Object.entries(STAGE_CONFIG).map((_, index) => (
                                <Cell key={index} fill={index === 0 ? "rgba(255,255,255,0.7)" : index === 1 ? "rgba(255,255,255,0.5)" : index === 2 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.15)"} />
                              ))}
                            </Pie>
                            <RechartsTooltip contentStyle={{ backgroundColor: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "11px" }} itemStyle={{ color: "#fff" }} />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <p className="text-[10px] font-mono text-white/15 uppercase tracking-widest">Insufficient data</p>
                      )}
                    </div>
                    <div className="flex flex-wrap justify-center gap-3 mt-2">
                      {Object.entries(STAGE_CONFIG).map(([key, cfg]) => (
                        <div key={key} className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`} />
                          <span className="text-[9px] text-white/30">{cfg.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sourcing Velocity */}
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-[11px] font-medium text-white/50">Sourcing Velocity</p>
                      <span className="text-[9px] font-mono text-white/20 uppercase tracking-wider">Candidates/role</span>
                    </div>
                    <div className="h-[200px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={analytics?.runs?.slice(0, 7).reverse().map(r => ({ name: r.role_title.split(" ")[0], val: r.candidates_count || 0 })) || []}>
                          <defs>
                            <linearGradient id="colorVal2" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor="#fff" stopOpacity={0.08} />
                              <stop offset="95%" stopColor="#fff" stopOpacity={0}    />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: "rgba(255,255,255,0.2)", fontSize: 9 }} />
                          <RechartsTooltip contentStyle={{ backgroundColor: "#111", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", fontSize: "11px" }} />
                          <Area type="monotone" dataKey="val" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} fillOpacity={1} fill="url(#colorVal2)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Kanban View ── */}
          {activeTab === "kanban" && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {Object.entries(STAGE_CONFIG).map(([key, cfg]) => {
                const count = analytics?.stage_counts?.[key] || 0;
                return (
                  <div key={key} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor}`} />
                      <span className="text-[11px] font-medium text-white/55">{cfg.label}</span>
                    </div>
                    <p className="text-[28px] font-mono font-semibold text-white/80 leading-none mb-0.5">{count}</p>
                    <p className="text-[10px] text-white/25">candidates</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Activity Feed ── */}
          {activeTab === "activity" && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
              {(analytics?.recent_activity?.length || 0) === 0 ? (
                <div className="p-12 text-center">
                  <Activity className="h-6 w-6 text-white/15 mx-auto mb-3" />
                  <p className="text-[12px] text-white/30">No recent activity. Start a sourcing session to see events here.</p>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {analytics.recent_activity.map((event, i) => {
                    const iconMap = { init: Zap, search: Search, filter: Filter, extract: Brain, decision: CheckCircle2, note: CircleDot };
                    const Icon = iconMap[event.event_type] || CircleDot;
                    return (
                      <div key={event.id || i} className="flex items-start gap-3 px-5 py-3 hover:bg-white/[0.02] transition-colors">
                        <div className="mt-0.5 p-1 rounded-md bg-white/[0.04] shrink-0">
                          <Icon className="h-3 w-3 text-white/40" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-white/65">{event.title}</p>
                          {event.candidate_name && <span className="text-[10px] text-white/30"> [{event.candidate_name}]</span>}
                          <p className="text-[10px] text-white/25 mt-0.5 truncate">{event.description}</p>
                        </div>
                        <span className="text-[9px] font-mono text-white/20 shrink-0">
                          {new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
    </NaiveShell>
  );
}
