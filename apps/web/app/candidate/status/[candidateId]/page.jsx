"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, CheckCircle, Clock, Circle, ArrowRight, User, Shield, FileText, Target } from "lucide-react";
import { CTLogo } from "@/components/NaiveShell";

function TimelineStep({ label, status, detail, icon: Icon }) {
  const isComplete = status === "completed";
  const isActive = status === "in_progress" || status === "active";
  const color = isComplete ? "text-green-400" : isActive ? "text-blue-400" : "text-white/40";

  return (
    <div className="flex gap-4 relative" data-testid={`timeline-${label}`}>
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${isComplete ? "border-green-500/30 bg-green-500/10" : isActive ? "border-blue-500/30 bg-blue-500/10" : "border-white/10 bg-white/5"}`}>
          {isComplete ? <CheckCircle className="h-4 w-4 text-green-400" /> : isActive ? <Clock className="h-4 w-4 text-blue-400" /> : <Circle className="h-4 w-4 text-white/30" />}
        </div>
        <div className="w-px h-8 bg-white/5" />
      </div>
      <div className="pb-6">
        <h4 className="text-sm font-medium text-white/85 flex items-center gap-2">
          {Icon && <Icon className={`h-3.5 w-3.5 ${color}`} />}
          {label}
        </h4>
        <p className="text-xs text-white/45 mt-0.5">{detail}</p>
      </div>
    </div>
  );
}

export default function CandidateStatusPage({ params }) {
  const { candidateId } = use(params);
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/candidate/status/${candidateId}`).then(res => {
      setData(res.data);
    }).catch(() => { toast.error("Failed to load status"); })
    .finally(() => setLoading(false));
  }, [candidateId]);

  if (loading) return (
    <div className="min-h-screen bg-[#030303] flex items-center justify-center">
      <Loader2 className="h-5 w-5 animate-spin text-white/45" />
    </div>
  );

  const cand = data?.candidate;
  const proof = data?.proof_profile;
  const extractions = data?.extractions || [];
  const screens = data?.screening_sessions || [];
  const onboardStatus = data?.onboarding_status || "not_started";
  const proofStatus = data?.proof_status || "not_started";
  const screenStatus = data?.screen_status || "not_started";

  return (
    <div className="min-h-screen bg-[#030303] text-[var(--text-primary)] font-sans" data-testid="status-page">
      <nav className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <CTLogo />
          <span className="text-[13px] font-semibold text-white/85 tracking-tight">workBYLiNE</span>
        </div>
        <span className="text-sm text-white/85">Candidate Status</span>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="font-mono text-xs text-white/45 tracking-wider uppercase mb-2">Candidate Status</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white/85 mb-1">{cand?.name || "Candidate"}</h1>
          <p className="text-sm text-white/45">{cand?.location || ""}{cand?.target_roles?.length > 0 ? ` · ${cand.target_roles.join(", ")}` : ""}</p>
        </div>

        {/* Progress timeline */}
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6 mb-6">
          <h2 className="text-base font-medium text-white/85 mb-5">Trust timeline</h2>
          <TimelineStep label="Onboarding" status={onboardStatus} detail={onboardStatus === "completed" ? "Profile created" : "Create your profile to begin"} icon={User} />
          <TimelineStep label="Proof profile" status={proofStatus} detail={proofStatus === "completed" ? `Proof strength: ${((proof?.proof_strength || 0) * 100).toFixed(0)}%` : "Generate proof from your data"} icon={Shield} />
          <TimelineStep label="Screening" status={screenStatus} detail={screenStatus === "completed" ? "All questions answered" : screenStatus === "active" || screenStatus === "in_progress" ? "In progress" : "Not started yet"} icon={FileText} />
          <TimelineStep label="Match readiness" status={screenStatus === "completed" && proofStatus === "completed" ? "completed" : "not_started"} detail={screenStatus === "completed" && proofStatus === "completed" ? "Ready for matching" : "Complete screening and proof"} icon={Target} />
        </div>

        {/* Extractions */}
        {extractions.length > 0 && (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6 mb-6">
            <h2 className="text-base font-medium text-white/85 mb-3">Sourced for</h2>
            {extractions.map((ext, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-white/[0.06] last:border-0">
                <div>
                  <span className="text-sm text-white/85">{ext.candidate_name}</span>
                  <span className="text-xs text-white/45 ml-2">for {ext.hiring_run_id?.slice(0, 8)}</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs ${ext.status === "shortlisted" ? "bg-green-500/15 text-green-400" : "bg-white/10 text-white/45"}`}>
                  {ext.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Screens */}
        {screens.length > 0 && (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6 mb-6">
            <h2 className="text-base font-medium text-white/85 mb-3">Screening sessions</h2>
            {screens.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  {s.session.status === "completed" ? <CheckCircle className="h-3.5 w-3.5 text-green-400" /> : <Clock className="h-3.5 w-3.5 text-white/45" />}
                  <span className="text-sm text-white/85">{s.session.status}</span>
                  {s.summary && <span className="text-xs text-white/45">Score: {((s.summary.overall_score || 0) * 100).toFixed(0)}%</span>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => router.push(`/candidate/screen/${s.session.id}`)} data-testid={`go-screen-${i}`}>
                  View <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {onboardStatus !== "completed" && (
            <Button className="bg-white text-black hover:bg-gray-200" onClick={() => router.push("/candidate/onboarding")} data-testid="go-onboarding-btn">
              Complete onboarding <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
          {onboardStatus === "completed" && proofStatus !== "completed" && cand && (
            <Button className="bg-white text-black hover:bg-gray-200" onClick={() => router.push(`/candidate/proof-profile/${cand.id}`)} data-testid="go-proof-btn">
              Generate proof profile <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
          <Button variant="outline" onClick={() => router.push("/")} data-testid="back-home-btn">
            Home
          </Button>
        </div>
      </div>
    </div>
  );
}
