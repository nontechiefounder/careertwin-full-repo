"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  ArrowRight, Loader2, Users, CheckCircle, ChevronRight,
  Copy, Zap, Filter, Circle
} from "lucide-react";
import TechIcon from "@/components/TechIcon";
import NaiveShell from "@/components/NaiveShell";
import { Skeleton } from "@/components/ui/skeleton";

function ScoreBadge({ score }) {
  if (score == null) return <span className="text-[20px] font-mono font-semibold text-white/20">—</span>;
  const color = score >= 0.8 ? "text-green-400" : score >= 0.5 ? "text-amber-400" : "text-red-400";
  return <span className={`text-[20px] font-mono font-semibold ${color}`}>{Math.round(score * 100)}%</span>;
}

function StatusPill({ status }) {
  const map = {
    shortlisted: "bg-white/[0.06] text-white/60 border-white/[0.08]",
    hold:        "bg-amber-500/[0.08] text-amber-400/70 border-amber-500/[0.15]",
    rejected:    "bg-red-500/[0.08] text-red-400/60 border-red-500/[0.15]",
  };
  return (
    <span className={`text-[8px] font-mono tracking-[0.18em] uppercase px-1.5 py-0.5 rounded-full border ${map[status] || map.shortlisted}`}>
      {status}
    </span>
  );
}

export default function ShortlistPage({ params }) {
  const { roleId } = use(params);
  const router   = useRouter();
  const [data, setData]                     = useState(null);
  const [loading, setLoading]               = useState(true);
  const [creatingScreen, setCreatingScreen] = useState(null);
  const [selected, setSelected]             = useState(null);
  const [filterStatus, setFilterStatus]     = useState("all");

  useEffect(() => {
    api.get(`/employer/shortlist/${roleId}`)
      .then(res => setData(res.data))
      .catch(() => toast.error("Failed to load shortlist"))
      .finally(() => setLoading(false));
  }, [roleId]);

  const startScreen = async (extId, candidateName) => {
    setCreatingScreen(extId);
    try {
      const res = await api.post("/employer/screening-sessions", {
        candidate_id: extId,
        hiring_run_id: roleId
      });
      if (typeof window !== 'undefined') {
        const link = `${window.location.origin}/candidate/screen/${res.data.session_id}`;
        await navigator.clipboard.writeText(link);
        toast.success(`Screening link copied! Share with ${candidateName || "candidate"}.`);
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create screening session");
    } finally {
      setCreatingScreen(null);
    }
  };

  const run              = data?.hiring_run;
  const allExtractions   = data?.extractions || [];
  const totalScanned     = data?.total_scanned || 0;
  const shortlistedCount = allExtractions.filter(e => e.status === "shortlisted").length;
  const holdCount        = allExtractions.filter(e => e.status === "hold").length;
  const extractions      = filterStatus === "all" ? allExtractions : allExtractions.filter(e => e.status === filterStatus);

  const selectedExt = selected ? allExtractions.find(e => e.id === selected) : null;
  const selectedProfile = selectedExt?.candidate_profiles || {};

  if (loading) return (
    <NaiveShell
      pageTitle="Shortlist"
      pageSubtitle="Loading candidates..."
      goBack="/employer"
    >
      <div className="p-6 h-full flex flex-col gap-6 w-full max-w-7xl mx-auto">
        <div className="flex gap-3 pb-2 border-b border-white/[0.06]">
          <Skeleton className="h-8 w-20 rounded-full bg-white/[0.04]" />
          <Skeleton className="h-8 w-20 rounded-full bg-white/[0.04]" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1,2,3,4,5,6].map(i => (
            <Skeleton key={i} className="h-[280px] w-full rounded-2xl bg-white/[0.03] border border-white/[0.06]" />
          ))}
        </div>
      </div>
    </NaiveShell>
  );

  /* ── Right panel: candidate detail */
  const rightPanel = selectedExt ? (
    <div className="p-4 space-y-4 animate-fade-in" key={selectedExt.id}>
      {/* Name + score */}
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="text-[13px] font-semibold text-white/85 truncate pr-2">{selectedProfile.name || "Candidate"}</h2>
          <ScoreBadge score={selectedExt.fit_score} />
        </div>
        <p className="text-[10px] text-white/28 leading-relaxed">
          {[selectedProfile.bio, selectedProfile.location].filter(Boolean).join(" · ")}
        </p>
      </div>
      <StatusPill status={selectedExt.status} />

      {/* Summary */}
      {selectedExt.fit_summary && (
        <div className="pt-1">
          <p className="mono-label mb-1">Fit Summary</p>
          <p className="text-[11px] text-white/45 leading-relaxed">{selectedExt.fit_summary}</p>
        </div>
      )}

      {/* Metrics */}
      <div className="space-y-2 pt-1">
        <p className="mono-label">Proof Strength</p>
        <div className="flex items-center gap-2">
          <div className="h-1 flex-1 bg-white/[0.05] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${(selectedExt.proof_strength || 0) >= 0.8 ? "bg-green-400/70" : "bg-amber-400/70"}`}
              style={{ width: `${(selectedExt.proof_strength || 0) * 100}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-white/30">{(selectedExt.proof_strength || 0).toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <CheckCircle className={`h-3 w-3 ${selectedExt.screen_status === "completed" ? "text-green-400/70" : "text-white/15"}`} />
          <span className="text-[10px] text-white/35">{selectedExt.screen_status === "completed" ? "Screen Complete" : "Screen not started"}</span>
        </div>
      </div>

      {/* Skills */}
      {(selectedExt.skills?.length || 0) > 0 && (
        <div className="pt-1">
          <p className="mono-label mb-2">Skills</p>
          <div className="flex flex-wrap gap-1">
            {selectedExt.skills.slice(0, 8).map((s, i) => (
              <div key={i} className="flex items-center gap-1 px-1.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.05] text-[9px] text-white/40">
                <TechIcon name={s.toLowerCase()} className="h-2 w-2" />
                {s}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="pt-2 space-y-1.5 border-t border-white/[0.06]">
        <button
          onClick={() => router.push(`/employer/packet/${selectedExt.id}`)}
          className="btn-white w-full justify-center text-[11px]"
          data-testid={`view-packet-${selectedExt.id}`}
        >
          View Packet <ArrowRight className="h-3 w-3" />
        </button>
        <button
          onClick={() => startScreen(selectedExt.id, selectedExt.candidate_name)}
          disabled={creatingScreen === selectedExt.id}
          className="btn-ghost w-full justify-center text-[11px]"
          data-testid={`start-screen-${selectedExt.id}`}
        >
          {creatingScreen === selectedExt.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
          Copy Screen Link
        </button>
      </div>
    </div>
  ) : (
    <div className="px-4 py-8 text-center">
      <p className="text-[11px] text-white/18">Select a candidate to see details</p>
    </div>
  );

  return (
    <NaiveShell
      pageTitle={run?.role_title || "Shortlist"}
      pageSubtitle={run?.company ? `${run.company} · ${extractions.length} candidates` : `${extractions.length} candidates`}
      backTo={{ label: "Role Brief", href: `/employer/brief/${roleId}` }}
      rightPanelTitle="Candidate Detail"
      rightPanel={rightPanel}
      showRightPanel={true}
      topBar={
        <button
          onClick={() => router.push(`/employer/brief/${roleId}`)}
          className="btn-ghost"
        >
          <Zap className="h-3.5 w-3.5" /> New Sourcing Run
        </button>
      }
      data-testid="shortlist-page"
    >
      {/* Filter bar */}
      <div className="px-6 py-2.5 border-b border-white/[0.04] flex items-center gap-2 shrink-0">
        <Filter className="h-3 w-3 text-white/20" />
        {["all", "shortlisted", "hold", "rejected"].map(f => (
          <button
            key={f}
            onClick={() => setFilterStatus(f)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-mono transition-all ${
              filterStatus === f ? "bg-white/[0.07] text-white/75" : "text-white/25 hover:text-white/50"
            }`}
          >
            {f === "all" ? `All (${allExtractions.length})` : f === "shortlisted" ? `Shortlisted (${shortlistedCount})` : f === "hold" ? `Hold (${holdCount})` : "Rejected"}
          </button>
        ))}

        <div className="ml-auto grid grid-cols-3 gap-4">
          {[
            { label: "SCANNED",     value: totalScanned },
            { label: "SHORTLISTED", value: shortlistedCount, green: true },
            { label: "ON HOLD",     value: holdCount },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className="mono-label">{s.label}</p>
              <p className={`text-[16px] font-mono font-semibold leading-none mt-0.5 ${s.green ? "text-green-400" : "text-white/60"}`}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Candidate list */}
      <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-hide">
        {extractions.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center py-24">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
              <Users className="h-6 w-6 text-white/15" />
            </div>
            <div>
              <p className="text-[13px] font-medium text-white/35 mb-1">No candidates shortlisted yet</p>
              <p className="text-[11px] text-white/18 max-w-[260px] leading-relaxed">
                Run sourcing for this role to start populating the shortlist.
              </p>
            </div>
            <button
              onClick={() => router.push(`/employer/brief/${roleId}`)}
              className="btn-white"
              data-testid="go-brief-btn"
            >
              Go to Brief <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {extractions.map((ext, idx) => {
              const profile = ext.candidate_profiles || {};
              const verifyTag = [ext.screen_status === "completed" ? "async-screen" : "", "github-deep-dive"].filter(Boolean).join(" + ");
              return (
              <div
                key={ext.id}
                onClick={() => setSelected(ext.id === selected ? null : ext.id)}
                className={`rounded-xl border transition-all p-5 cursor-pointer group animate-fade-in ${
                  selected === ext.id
                    ? "border-white/[0.18] bg-white/[0.04]"
                    : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.10] hover:bg-white/[0.03]"
                }`}
                data-testid={`shortlist-card-${ext.id}`}
              >
                {/* Row 1: Name + score */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <h3 className="text-[13px] font-semibold text-white/85">{profile.name || "Anonymous Candidate"}</h3>
                      <StatusPill status={ext.status} />
                      {(ext.fit_score || 0) >= 0.85 && (
                        <span className="text-[8px] font-mono bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded-full text-green-400">STRONG YES</span>
                      )}
                    </div>
                    <p className="text-[11px] text-white/35">
                      {[profile.bio, profile.location].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <ScoreBadge score={ext.fit_score} />
                    <p className="text-[8px] font-mono text-white/20 mt-0.5">fit score</p>
                  </div>
                </div>

                {/* Row 2: AI one-liner reasoning */}
                {ext.fit_summary && (
                  <p className="text-[11px] text-white/40 leading-relaxed mb-3 line-clamp-2">{ext.fit_summary}</p>
                )}

                {/* Row 3: Proof + screen + verification tag */}
                <div className="flex items-center gap-4 flex-wrap mb-3">
                  {/* Proof strength bar */}
                  {ext.proof_strength != null && (
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono text-white/25 uppercase tracking-wider">Proof</span>
                      <div className="h-1 w-20 bg-white/[0.05] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            ext.proof_strength >= 0.8 ? "bg-green-400/70" : ext.proof_strength >= 0.5 ? "bg-amber-400/70" : "bg-red-400/70"
                          }`}
                          style={{ width: `${ext.proof_strength * 100}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-mono text-white/30">{ext.proof_strength.toFixed(2)}</span>
                    </div>
                  )}

                  {/* Screen status */}
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className={`h-3 w-3 shrink-0 ${
                      ext.screen_status === "completed" ? "text-green-400" : "text-white/20"
                    }`} />
                    <span className="text-[10px] text-white/35">
                      {ext.screen_status === "completed" ? "complete" : "not started"}
                    </span>
                  </div>

                  {/* Verification method */}
                  {verifyTag && (
                    <span className="text-[9px] font-mono text-white/25 border border-white/[0.06] px-1.5 py-0.5 rounded">
                      {verifyTag}
                    </span>
                  )}
                </div>

                {/* Row 4: Skill chips + packet button */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex flex-wrap gap-1">
                    {(ext.skills || []).slice(0, 5).map((s, i) => (
                      <div key={i} className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.05] text-[9px] text-white/40">
                        <TechIcon name={s.toLowerCase()} className="h-2 w-2" />
                        {s}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); router.push(`/employer/packet/${ext.id}`); }}
                    className="flex items-center gap-1.5 text-[10px] font-medium text-white/50 hover:text-white/80 border border-white/[0.07] hover:border-white/[0.15] px-3 py-1.5 rounded-lg transition-all shrink-0"
                    data-testid={`view-packet-${ext.id}`}
                  >
                    <Circle className="h-2.5 w-2.5" />
                    View decision packet <ArrowRight className="h-2.5 w-2.5" />
                  </button>
                </div>
              </div>
            )})}
          </div>
        )}
      </div>
    </NaiveShell>
  );
}
