"use client";

import { useState, useEffect, useRef, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Loader2, Shield, CheckCircle, AlertCircle, ArrowRight, RefreshCw } from "lucide-react";
import { CTLogo } from "@/components/NaiveShell";

export default function ProofProfilePage({ params }) {
  const { candidateId } = use(params);
  const router = useRouter();
  const { logout } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get(`/candidate/proof-profile/${candidateId}`);
      setData(res.data);
    } catch { toast.error("Failed to load"); }
    finally { setLoading(false); }
  }, [candidateId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      await api.post(`/candidate/proof-profile/${candidateId}/generate`);
      toast.success("Proof profile generated");
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to generate");
    } finally { setGenerating(false); }
  }, [candidateId, fetchData]);

  const hasTriggered = useRef(false);

  // Auto-generate if not exists
  useEffect(() => {
    if (!loading && !generating && !data?.proof_profile && data?.candidate && !hasTriggered.current) {
      hasTriggered.current = true;
      generate();
    }
  }, [loading, generating, data?.proof_profile, data?.candidate, generate]);

  if (loading || generating) return (
    <div className="min-h-screen bg-[#0d0d0d] p-10 max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-4 mb-10 mt-10">
        <Loader2 className="h-5 w-5 animate-spin text-white/45 mx-auto" />
        <p className="text-sm text-white/45">{generating ? "AI is analyzing candidate data to generate proof profile..." : "Loading proof profile..."}</p>
      </div>
      <div className="h-32 w-full bg-white/5 rounded animate-pulse"></div>
      <div className="flex gap-4">
        <div className="h-24 w-1/2 bg-white/5 rounded animate-pulse"></div>
        <div className="h-24 w-1/2 bg-white/5 rounded animate-pulse"></div>
      </div>
      <div className="h-40 w-full bg-white/5 rounded animate-pulse"></div>
    </div>
  );

  const proof = data?.proof_profile;
  const cand = data?.candidate;

  return (
    <div className="min-h-screen bg-[#0d0d0d]" style={{ fontFamily: "'Inter', system-ui, sans-serif" }} data-testid="proof-profile-page">
      <nav className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <CTLogo />
          <span className="text-[13px] font-semibold text-white/85 tracking-tight">CareerTWiN</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-white/45">
          <span className="text-white/85">Proof Profile</span>
          <Button variant="ghost" size="sm" onClick={logout} data-testid="logout-btn">Sign out</Button>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="font-mono text-xs text-white/45 tracking-wider uppercase mb-2">Proof-first Profile</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white/85 mb-1">{cand?.name}</h1>
          <p className="text-sm text-white/45">{cand?.location}{cand?.target_roles?.length > 0 ? ` · ${cand.target_roles.join(", ")}` : ""}</p>
        </div>

        {!proof ? (
          <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-12 text-center">
            <Shield className="h-8 w-8 text-white/30 mx-auto mb-3" />
            <p className="text-sm text-white/45 mb-4">No proof profile yet. Generate one from your data.</p>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button className="bg-white text-black hover:bg-gray-200" onClick={generate} disabled={generating} data-testid="generate-proof-btn">
                    {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Generate proof profile
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>AI will evaluate your provided resume and links to establish baseline proof.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        ) : (
          <div className="space-y-6 animate-fade-in">
            {/* Summary */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6">
              <h2 className="text-base font-medium text-white/85 mb-3">Summary</h2>
              <p className="text-sm text-white/45 leading-relaxed">{proof.summary}</p>
            </div>

            {/* Scores */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-xs text-white/45 mb-2 cursor-help border-b border-dashed border-muted-foreground/50 pb-0.5 inline-block">Proof completeness</div>
                    </TooltipTrigger>
                    <TooltipContent><p>AI-calculated score based on how much verifiable evidence was found.</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <div className="flex items-center gap-3">
                  <div className="fit-score-bar flex-1"><div className="fit-score-fill bg-blue-400" style={{ width: `${(proof.proof_completeness || 0) * 100}%` }} /></div>
                  <span className="text-lg font-mono font-semibold text-white/85">{((proof.proof_completeness || 0) * 100).toFixed(0)}%</span>
                </div>
              </div>
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
                <div className="text-xs text-white/45 mb-2">Proof strength</div>
                <div className="flex items-center gap-3">
                  <div className="fit-score-bar flex-1"><div className="fit-score-fill bg-green-400" style={{ width: `${(proof.proof_strength || 0) * 100}%` }} /></div>
                  <span className="text-lg font-mono font-semibold text-white/85">{((proof.proof_strength || 0) * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>

            {/* Capabilities */}
            {proof.inferred_capabilities?.length > 0 && (
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6">
                <h2 className="text-base font-medium text-white/85 mb-3">Inferred capabilities</h2>
                <div className="flex flex-wrap gap-2">
                  {proof.inferred_capabilities.map((c, i) => (
                    <span key={i} className="px-3 py-1 rounded-full bg-white/5 text-sm text-white/45 border border-white/[0.06]">{c}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Work examples */}
            {proof.top_work_examples?.length > 0 && (
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6">
                <h2 className="text-base font-medium text-white/85 mb-3">Top work examples</h2>
                <div className="space-y-3">
                  {proof.top_work_examples.map((ex, i) => (
                    <div key={i} className="rounded-md border border-white/[0.06] p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-medium text-white/85">{ex.title}</h4>
                        {ex.proof_type && <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] text-white/45 font-mono">{ex.proof_type}</span>}
                      </div>
                      <p className="text-xs text-white/45">{ex.description}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Readiness */}
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-6">
              <h2 className="text-base font-medium text-white/85 mb-3">Verification readiness</h2>
              <div className="flex items-center gap-2 mb-3">
                {proof.verification_readiness === "ready" ? (
                  <CheckCircle className="h-4 w-4 text-green-400" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-400" />
                )}
                <span className="text-sm text-white/85 capitalize">{proof.verification_readiness}</span>
              </div>
              {proof.recommended_next_action && (
                <p className="text-sm text-white/45">{proof.recommended_next_action}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button className="flex-1 bg-white text-black hover:bg-gray-200" onClick={() => router.push(`/candidate/status/${candidateId}`)} data-testid="view-status-btn">
                View status <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={generate} disabled={generating} data-testid="regenerate-proof-btn">
                <RefreshCw className="mr-2 h-4 w-4" /> Regenerate
              </Button>
              <Button variant="outline" onClick={() => router.push("/candidate/onboarding")} data-testid="edit-profile-btn">
                Edit profile
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
