"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Loader2, CheckCircle, AlertCircle, HelpCircle,
  ArrowRight, Shield, Sparkles
} from "lucide-react";
import TechIcon from "@/components/TechIcon";
import NaiveShell from "@/components/NaiveShell";
import { Skeleton } from "@/components/ui/skeleton";

/* ── helpers ─────────────────────────────────────────────────────── */
function Sparkles2(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}

function Plus2(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M12 5v14M5 12h14" /></svg>;
}
function Minus2(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M5 12h14" /></svg>;
}

/* ── sub-components ──────────────────────────────────────────────── */
function TrustGrid({ title, items, color, icon }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-3">
      <h4 className={`text-[9px] uppercase font-mono tracking-[0.2em] flex items-center gap-2 ${color}`}>
        {icon} {title}
      </h4>
      <ul className="space-y-2">
        {items?.map((item, i) => (
          <li key={i} className="text-[11px] text-white/50 flex items-start gap-2 leading-snug">
            <span className="w-1 h-1 rounded-full bg-white/20 mt-1.5 shrink-0" /> {item}
          </li>
        ))}
        {(!items || items.length === 0) && <li className="text-[11px] text-white/18">None recorded</li>}
      </ul>
    </div>
  );
}

function ListSection({ title, items, color, icon }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-3">
      <h4 className={`text-[9px] uppercase font-mono tracking-[0.2em] flex items-center gap-2 ${color}`}>
        {icon} {title}
      </h4>
      <ul className="space-y-2">
        {items?.map((item, i) => (
          <li key={i} className="text-[12px] text-white/55 flex items-start gap-2 leading-relaxed">
            <span className={`mt-0.5 shrink-0 ${color}`}>•</span> {item}
          </li>
        ))}
        {(!items || items.length === 0) && <li className="text-[11px] text-white/18">None recorded</li>}
      </ul>
    </div>
  );
}

/* ── main ────────────────────────────────────────────────────────── */
export default function PacketPage({ params }) {
  const { extractionId } = use(params);
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const fetchPacket = async () => {
    try {
      const res = await api.get(`/employer/packets/${extractionId}?t=${Date.now()}`);

      setData(res.data);
      setNotFound(false);
    } catch (err) {
      if (err.response?.status === 404) {
        setNotFound(true);
        try {
          const extRes = await api.get(`/employer/candidate-extractions/${extractionId}`);
          setData({ extraction: extRes.data });
        } catch (e) {}
      } else {
        toast.error("Failed to load packet");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPacket(); }, [extractionId]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await api.post(`/employer/packets/${extractionId}/generate`);
      toast.success("Decision packet generated");
      // Immediate UI update from the response
      setData(prev => ({ ...prev, packet: res.data }));
      await fetchPacket();

    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to generate packet");
    } finally {
      setGenerating(false);
    }
  };

  const handleAction = async (action) => {
    try {
      const res = await api.post(`/employer/packets/${extractionId}/action`, { action });
      toast.success(`Candidate ${action}ed successfully`);
      if (action === 'advance') {
        toast.info("Outreach sequence started (Day 0 Email sent)");
      }
      // Refresh data to show new status
      await fetchPacket();
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed to ${action} candidate`);
    }
  };

  if (loading) return (
    <NaiveShell
      pageTitle="Decision Packet"
      pageSubtitle="Loading packet..."
      goBack={`/employer/shortlist/${data?.hiring_run?.id || ""}`}
    >
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4 mb-8">
          <Skeleton className="h-16 w-16 rounded-2xl bg-white/[0.04]" />
          <div className="space-y-3 flex-1">
            <Skeleton className="h-6 w-1/3 bg-white/[0.04]" />
            <Skeleton className="h-4 w-1/4 bg-white/[0.03]" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <Skeleton className="h-40 w-full rounded-xl bg-white/[0.03]" />
          <Skeleton className="h-40 w-full rounded-xl bg-white/[0.03]" />
          <Skeleton className="h-40 w-full rounded-xl bg-white/[0.03]" />
        </div>
      </div>
    </NaiveShell>
  );

  const packet = data?.packet;
  const ext = data?.extraction;
  const run = data?.hiring_run;

  const score      = ext?.fit_score ?? null;
  const scoreColor = score >= 0.8 ? "text-green-400" : score >= 0.5 ? "text-amber-400" : "text-red-400";
  const statusLabel = score >= 0.85 ? "STRONG YES" : score >= 0.7 ? "YES" : score >= 0.5 ? "MAYBE" : score != null ? "NO" : "PENDING";
  const statusCls   = score >= 0.85 ? "bg-green-500/15 text-green-400 border-green-500/20"
                     : score >= 0.5  ? "bg-amber-500/15 text-amber-400 border-amber-500/20"
                     : "bg-red-500/15 text-red-500 border-red-500/20";

  /* Right panel: candidate quick facts */
  const rightPanel = ext ? (
    <div className="p-4 space-y-4" key={ext.id}>
      <div>
        <p className="mono-label mb-1">Candidate</p>
        <p className="text-[12px] font-semibold text-white/75">{ext.candidate_name}</p>
        <p className="text-[10px] text-white/28 mt-0.5 leading-snug">
          {[ext.current_role, ext.current_company, ext.location].filter(Boolean).join(" · ")}
        </p>
      </div>

      <div>
        <p className="mono-label mb-1">Fit Score</p>
        <div className="flex items-baseline gap-2">
          <span className={`text-[28px] font-mono font-bold ${scoreColor} leading-none`}>
            {score != null ? score.toFixed(2) : "—"}
          </span>
          <span className={`text-[9px] font-mono border px-1.5 py-0.5 rounded-full ${statusCls}`}>{statusLabel}</span>
        </div>
      </div>

      <div>
        <p className="mono-label mb-1">Proof Strength</p>
        <div className="flex items-center gap-2">
          <div className="h-1 flex-1 bg-white/[0.05] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${(ext.proof_strength || 0) >= 0.8 ? "bg-green-400/70" : "bg-amber-400/70"}`}
              style={{ width: `${(ext.proof_strength || 0) * 100}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-white/30">{(ext.proof_strength || 0).toFixed(2)}</span>
        </div>
      </div>

      {(ext.skills?.length > 0) && (
        <div>
          <p className="mono-label mb-2">Key Skills</p>
          <div className="flex flex-wrap gap-1">
            {ext.skills.slice(0, 8).map((s, i) => (
              <div key={i} className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.05] text-[9px] text-white/40">
                <TechIcon name={s.toLowerCase()} className="h-2 w-2" />
                {s}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
        {!packet && (
          <button onClick={handleGenerate} disabled={generating} className="btn-white w-full justify-center text-[11px]" data-testid="generate-packet-btn">
            {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles2 className="h-3 w-3" />}
            Generate Packet
          </button>
        )}
        
        {packet && (
          <div className="pt-2 border-t border-white/[0.06] space-y-2">
            {(['hold', 'rejected'].includes(ext.status)) || (ext.status === 'shortlisted' && data?.emails?.length > 0) ? (
              <div className={`flex flex-col items-center gap-2 p-4 rounded-xl border ${
                ext.status === 'shortlisted' ? 'bg-green-500/10 border-green-500/20 text-green-400' :
                ext.status === 'hold' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                'bg-red-500/10 border-red-500/20 text-red-400'
              }`}>
                <CheckCircle className="h-5 w-5" />
                <span className="text-[11px] font-mono uppercase tracking-[0.2em] font-bold">
                  Candidate {ext.status === 'shortlisted' ? 'Advanced' : ext.status}
                </span>
                <p className="text-[9px] opacity-60 text-center leading-tight">
                  {ext.status === 'shortlisted' ? 'Outreach sequence is active.' : 'No further actions scheduled.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-1.5">
                <button 
                  onClick={() => handleAction('advance')} 
                  className="btn-white w-full justify-center text-[11px] bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20"
                >
                  <CheckCircle className="h-3 w-3" /> Advance Candidate
                </button>
                <div className="grid grid-cols-2 gap-1.5">
                  <button 
                    onClick={() => handleAction('hold')} 
                    className="btn-ghost w-full justify-center text-[11px] border-amber-500/10 text-amber-500/70 hover:bg-amber-500/10"
                  >
                    Put on Hold
                  </button>
                  <button 
                    onClick={() => handleAction('reject')} 
                    className="btn-ghost w-full justify-center text-[11px] border-red-500/10 text-red-500/70 hover:bg-red-500/10"
                  >
                    Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {run && (
          <button onClick={() => router.push(`/employer/shortlist/${run.id}`)} className="btn-ghost w-full justify-center text-[11px]">
            ← Back to Shortlist
          </button>
        )}
      </div>
    </div>
  ) : null;

  return (
    <NaiveShell
      pageTitle={ext?.candidate_name || "Decision Packet"}
      pageSubtitle={run?.role_title ? `${run.role_title}${run.company ? ` · ${run.company}` : ""}` : "Candidate Assessment"}
      backTo={run ? { label: "Shortlist", href: `/employer/shortlist/${run.id}` } : undefined}
      rightPanelTitle="Candidate Brief"
      rightPanel={rightPanel}
      showRightPanel={true}
      data-testid="packet-page"
    >
      <div className="px-6 py-6 max-w-4xl">
        {notFound || !packet ? (
          <div className="flex flex-col items-center justify-center py-24 gap-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
              <Shield className="h-7 w-7 text-white/15" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-white/60 mb-2">Synthesis Required</h2>
              <p className="text-[12px] text-white/30 max-w-sm leading-relaxed">
                {ext?.candidate_name
                  ? `Generate a decision packet for ${ext.candidate_name} to see the full AI analysis.`
                  : "Initialize AI synthesis for this candidate profile."}
              </p>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="btn-white"
              data-testid="generate-packet-btn"
            >
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles2 className="h-4 w-4" />}
              Generate Decision Packet
            </button>
          </div>
        ) : (
          <div className="space-y-6 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-2">
                <h3 className="text-[9px] uppercase font-mono tracking-[0.2em] text-blue-400">Why Sourced</h3>
                <p className="text-[12px] text-white/60 leading-relaxed">{packet.why_sourced}</p>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-2">
                <h3 className="text-[9px] uppercase font-mono tracking-[0.2em] text-green-400">Why Matched</h3>
                <p className="text-[12px] text-white/60 leading-relaxed">{packet.why_matched}</p>
              </div>
            </div>

            {packet.strongest_evidence?.length > 0 && (
              <div className="space-y-3">
                <p className="mono-label">Strongest Evidence</p>
                <div className="space-y-2">
                  {packet.strongest_evidence.map((ev, i) => {
                    const parts = ev.split(" [");
                    const text = parts[0];
                    const badgeRaw = parts[1];
                    const badge = badgeRaw ? badgeRaw.replace("]", "") : "";
                    const badgeCls = badge === "very high" ? "bg-green-500/15 text-green-400 border-green-500/20" : "bg-blue-500/15 text-blue-400 border-blue-500/20";
                    return (
                      <div key={i} className="flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-colors group">
                        <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-white/30 group-hover:text-white/55 transition-colors shrink-0">
                          <TechIcon name={text.toLowerCase().includes("github") ? "github" : "verified"} className="h-4 w-4" />
                        </div>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-[12px] font-medium text-white/75 truncate">{text}</span>
                          {badge && <span className={`text-[8px] font-mono border px-1.5 py-0.5 rounded-full shrink-0 ${badgeCls}`}>{badge}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="mono-label">Verification Route</p>
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { label: "github-deep-dive", done: true },
                  { label: "async-screen",     done: ext?.screen_status === "completed" },
                  { label: "linkedin-parse",   done: true },
                ].map((r, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1.5 text-[9px] font-mono px-2.5 py-1 rounded-full border ${
                      r.done
                        ? "border-green-500/20 bg-green-500/[0.06] text-green-400"
                        : "border-white/[0.08] bg-white/[0.02] text-white/30"
                    }`}
                  >
                    <span className={`w-1 h-1 rounded-full ${ r.done ? "bg-green-400" : "bg-white/20" }`} />
                    {r.label}
                    {r.done ? " (complete)" : " (pending)"}
                  </span>
                ))}
              </div>
            </div>

            {packet.extracted_capabilities?.length > 0 && (
              <div className="space-y-3">
                <p className="mono-label">Extracted Capabilities</p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {packet.extracted_capabilities.map((cap, i) => {
                    const [nameFull, status] = cap.split(" - ");
                    const [name, years] = nameFull.split(" (");
                    const sCls = status === "verified" ? "text-green-400" : status === "high" ? "text-blue-400" : status === "inferred" ? "text-amber-400" : "text-white/30";
                    return (
                      <div key={i} className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-3.5 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <TechIcon name={name?.toLowerCase().trim()} className="h-3.5 w-3.5 text-white/30" />
                          <span className="text-[9px] font-mono text-white/20">{years?.replace(")", "") || ""}</span>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-white/75 truncate">{name}</div>
                          <div className={`text-[9px] font-mono uppercase tracking-widest ${sCls}`}>{status}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {packet.screen_summary && (
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[9px] uppercase font-mono tracking-[0.2em] text-white/35">Async Screen Summary</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-green-400">Excellent</span>
                    <span className="text-[9px] font-mono text-white/20">·</span>
                    <span className="text-[9px] font-mono text-white/30">confidence: {ext?.proof_strength != null ? ext.proof_strength.toFixed(2) : "0.94"}</span>
                  </div>
                </div>
                {packet.screen_summary.includes("Q:") ? (
                  <div className="space-y-4">
                    {packet.screen_summary.split(/(?=Q:)/).filter(Boolean).map((block, i) => {
                      const lines = block.trim().split(/\n+/);
                      const q = lines.find(l => l.startsWith("Q:"))?.replace("Q:","").trim();
                      const a = lines.find(l => l.startsWith("A:"))?.replace("A:","").trim();
                      const qual = lines.find(l => l.startsWith("Quality:"))?.replace("Quality:","").trim();
                      return (
                        <div key={i} className="space-y-1.5">
                          <p className="text-[10px] text-white/30 font-mono">Q{i+1}. {q}</p>
                          <p className="text-[12px] text-white/65 leading-relaxed">{a}</p>
                          {qual && (
                            <span className={`inline-flex text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${
                              qual.toLowerCase().includes("excellent") ? "border-green-500/20 text-green-400 bg-green-500/[0.06]"
                              : qual.toLowerCase().includes("strong") ? "border-blue-500/20 text-blue-400 bg-blue-500/[0.06]"
                              : "border-white/[0.08] text-white/30 bg-white/[0.02]"
                            }`}>{qual}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[12px] text-white/55 leading-relaxed whitespace-pre-line">{packet.screen_summary}</p>
                )}
              </div>
            )}

            <div>
              <p className="mono-label mb-3">Trust Matrix</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <TrustGrid title="Verified"  items={packet.what_is_verified}       color="text-green-400" icon={<CheckCircle className="h-3 w-3" />} />
                <TrustGrid title="Inferred"  items={packet.what_is_inferred}       color="text-amber-400" icon={<HelpCircle className="h-3 w-3" />} />
                <TrustGrid title="Uncertain" items={packet.what_remains_uncertain} color="text-red-400"   icon={<AlertCircle className="h-3 w-3" />} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ListSection title="Strengths" items={packet.strengths} color="text-green-400" icon={<Plus2 className="h-3.5 w-3.5" />} />
              <ListSection title="Concerns"  items={packet.concerns}  color="text-amber-400" icon={<Minus2 className="h-3.5 w-3.5" />} />
            </div>

            {packet.recommended_next_step && (
              <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-5 space-y-2">
                <h3 className="text-[9px] uppercase font-mono tracking-[0.2em] text-white/35">Recommended Next Step</h3>
                <p className="text-[14px] font-medium text-white/75 leading-snug">{packet.recommended_next_step}</p>
              </div>
            )}

            {/* Communication History */}
            <div className="space-y-3">
              <p className="mono-label">Communication History</p>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                {!data?.emails || data.emails.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-[11px] text-white/20">No outreach history yet.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.04]">
                    {data.emails.map((email, i) => (
                      <div key={i} className="p-4 flex flex-col gap-2">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                email.status.includes('sent') ? 'bg-green-400' : 
                                email.status === 'failed' ? 'bg-red-400' : 'bg-amber-400'
                              }`} />
                              <p className="text-[12px] font-medium text-white/70">{email.subject}</p>
                            </div>
                            <p className="text-[10px] text-white/25">
                              {email.status.includes('sent') ? `Sent on ${new Date(email.sent_at || email.scheduled_for).toLocaleDateString()}` : `Scheduled for ${new Date(email.scheduled_for).toLocaleDateString()}`} 
                              {' · '} Day {email.sequence_day}
                            </p>
                          </div>
                          <span className={`text-[9px] font-mono border px-1.5 py-0.5 rounded-full uppercase tracking-widest ${
                            email.status.includes('sent') ? 'border-green-500/20 text-green-400 bg-green-500/5' : 
                            email.status === 'failed' ? 'border-red-500/20 text-red-400 bg-red-500/5' : 
                            'border-amber-500/20 text-amber-400 bg-amber-500/5'
                          }`}>
                            {email.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        {email.error_details && (
                          <div className="p-2 rounded-lg bg-red-500/5 border border-red-500/10 flex items-center gap-2">
                            <AlertCircle className="h-3 w-3 text-red-400 shrink-0" />
                            <p className="text-[10px] text-red-400/80 leading-snug">{email.error_details}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </NaiveShell>
  );
}
