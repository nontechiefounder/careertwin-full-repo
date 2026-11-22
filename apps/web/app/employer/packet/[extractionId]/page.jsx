"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { toast } from "sonner";
import NaiveShell from "@/components/NaiveShell";
import {
  Frame,
  FramePanel,
  FrameHeader,
  FrameTitle,
  FrameDescription,
} from "@/components/ui/frame";
import { MessageSquare, Play, CheckCircle2, ArrowUpRight } from "lucide-react";

// Import modular Trust Packet & Review components
import DecisionBlockers from "@/components/packet/DecisionBlockers";
import ClaimLedger from "@/components/packet/ClaimLedger";
import HumanDecisionRail from "@/components/packet/HumanDecisionRail";
import ProductGovernanceNotice from "@/components/packet/ProductGovernanceNotice";
import AuditDetailsDrawer from "@/components/packet/AuditDetailsDrawer";
import EvidenceDrawer from "@/components/packet/EvidenceDrawer";
import PacketSkeleton from "@/components/packet/PacketSkeleton";
import PacketEmptyState from "@/components/packet/PacketEmptyState";
import PacketErrorState from "@/components/packet/PacketErrorState";
import FullCandidateReview from "@/components/packet/FullCandidateReview";
import CandidateBriefSidebar from "@/components/packet/CandidateBriefSidebar";

export default function PacketPage({ params }) {
  const routeParams = useParams();
  const router = useRouter();
  const extractionId = routeParams?.extractionId || params?.extractionId;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [screeningLoading, setScreeningLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [notFound, setNotFound] = useState(false);

  // Drawer states & explicit trigger element refs for focus restoration
  const [isAuditDrawerOpen, setIsAuditDrawerOpen] = useState(false);
  const [auditTriggerElement, setAuditTriggerElement] = useState(null);
  const [selectedEvidenceRef, setSelectedEvidenceRef] = useState(null);
  const [evidenceTriggerElement, setEvidenceTriggerElement] = useState(null);

  const executeFetch = useCallback(async () => {
    if (!extractionId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.get(`/employer/packets/${extractionId}?t=${Date.now()}`);
      setData(res.data);
      setNotFound(false);
    } catch (err) {
      console.error("[PacketPage executeFetch] Error:", err.response?.status, err.message);
      if (err.response?.status === 404) {
        setNotFound(true);
      } else {
        const msg = err.response?.data?.error || err.response?.data?.detail || "Failed to load candidate trust packet.";
        setErrorMessage(msg);
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [extractionId]);

  useEffect(() => {
    if (!extractionId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/employer/packets/${extractionId}?t=${Date.now()}`);
        if (!cancelled) {
          setData(res.data);
          setNotFound(false);
          setErrorMessage(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[PacketPage executeFetch] Error:", err.response?.status, err.message);
          if (err.response?.status === 404) {
            setNotFound(true);
          } else {
            const msg = err.response?.data?.error || err.response?.data?.detail || "Failed to load candidate trust packet.";
            setErrorMessage(msg);
            toast.error(msg);
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [extractionId]);

  useEffect(() => {
    if (data?.extraction && typeof window !== "undefined") {
      try {
        const extObj = data.extraction;
        const runObj = data.hiring_run;
        const ctxPayload = JSON.stringify({
          extractionId: extObj.id || extractionId,
          candidateProfileId: extObj.candidate_id || null,
          roleId: runObj?.id || extObj.hiring_run_id || null,
          candidateName: extObj.candidate_name || extObj.candidate_profiles?.name || "Candidate",
          roleTitle: runObj?.role_title || "Active Role",
          updatedAt: new Date().toISOString()
        });
        window.sessionStorage.setItem("workbyline_active_packet_context", ctxPayload);
        window.sessionStorage.setItem("wbl_last_viewed_packet", ctxPayload);
      } catch (_) {}
    }
  }, [data, extractionId]);

  const handleGenerateEvaluation = async () => {
    setGenerating(true);
    try {
      await api.post(`/employer/packets/${extractionId}/generate`);
      toast.success("Comprehensive decision packet generated");
      await executeFetch();
    } catch (err) {
      const msg = err.response?.data?.details || err.response?.data?.error || "Evaluation generation failed";
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const handleAction = async (action, rationale) => {
    setActionLoading(true);
    try {
      const rev = Number(packet?.ledger_revision);
      const rubric = (packet?.rubric_version || packet?.role_version || "").trim();
      const hasVersionedPacket = Boolean(packet && Number.isInteger(rev) && rev > 0 && rubric.length > 0);
      let payload;
      if (hasVersionedPacket) {
        payload = {
          action,
          rationale,
          expected_ledger_revision: rev,
          expected_rubric_version: rubric
        };
      } else {
        const preStatus =
          typeof data?.extraction?.status === "string" && data.extraction.status.trim().length > 0
            ? data.extraction.status.trim()
            : "";
        if (!preStatus) {
          toast.error("Candidate state is missing or stale; refreshing packet...");
          await executeFetch();
          return;
        }
        const preRev = Number.isInteger(Number(data?.extraction?.pre_evaluation_revision))
          ? Number(data.extraction.pre_evaluation_revision)
          : 0;
        payload = {
          action,
          rationale,
          pre_evaluation_disposition: true,
          expected_evaluation_phase: "pre_evaluation",
          expected_status: preStatus,
          expected_pre_eval_revision: preRev
        };
      }
      await api.post(`/employer/packets/${extractionId}/action`, payload);
      toast.success(`Candidate ${action === "advance" ? "advanced" : action === "hold" ? "put on hold" : "rejected"} successfully`);
      await executeFetch();
    } catch (err) {
      if (err.response?.status === 409 || err.response?.data?.error === "REVIEW_REVISION_CONFLICT") {
        toast.error("Evaluation revised or concurrent review occurred. Refreshing packet for fresh review...");
        await executeFetch();
      } else {
        toast.error(err.response?.data?.details || err.response?.data?.error || `Failed to ${action} candidate`);
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleLaunchScreening = async () => {
    const ext = data?.extraction;
    const run = data?.hiring_run;
    const packet = data?.packet;
    const hiring_run_id = run?.id || ext?.hiring_run_id;
    const candidate_id = ext?.candidate_id || ext?.id;
    if (!hiring_run_id || !candidate_id) {
      toast.error("Missing role or candidate identifier to launch screening.");
      return;
    }
    setScreeningLoading(true);
    try {
      const questions = Array.isArray(packet?.recommended_questions)
        ? packet.recommended_questions
        : (Array.isArray(packet?.follow_up_questions) ? packet.follow_up_questions : []);
      const res = await api.post("/employer/screening-sessions", {
        hiring_run_id,
        candidate_id,
        questions
      });
      const sessionId = res.data?.session_id || res.data?.session?.id || res.data?.id;
      toast.success("Async screening session created");
      if (sessionId) {
        router.push(`/candidate/screen/${sessionId}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to launch async screening session");
    } finally {
      setScreeningLoading(false);
    }
  };

  const handleCloseAudit = () => {
    const trigger = auditTriggerElement;
    setIsAuditDrawerOpen(false);
    if (trigger && typeof trigger.focus === "function") {
      trigger.focus();
    }
  };

  const handleSelectEvidence = (ref, btn) => {
    setEvidenceTriggerElement(btn);
    setSelectedEvidenceRef(ref);
  };

  const handleCloseEvidence = () => {
    const trigger = evidenceTriggerElement;
    setSelectedEvidenceRef(null);
    if (trigger && typeof trigger.focus === "function") {
      trigger.focus();
    }
  };

  const packet = data?.packet;
  const ext = data?.extraction;
  const run = data?.hiring_run;
  const shortlistUrl = `/employer/shortlist/${run?.id || ""}`;

  // 1. Loading State
  if (loading) {
    return (
      <NaiveShell pageTitle="Candidate Trust Packet" pageSubtitle="Loading evidence packet..." goBack={shortlistUrl}>
        <PacketSkeleton />
      </NaiveShell>
    );
  }

  // 2. Error State
  if (errorMessage && !data) {
    return (
      <NaiveShell pageTitle="Candidate Trust Packet" pageSubtitle="Packet loading error" goBack={shortlistUrl}>
        <PacketErrorState errorMessage={errorMessage} onRetry={executeFetch} shortlistUrl={shortlistUrl} />
      </NaiveShell>
    );
  }

  // 3. Candidate Not Found (Absolute 404)
  if (notFound || !ext) {
    return (
      <NaiveShell pageTitle="Candidate Trust Packet" pageSubtitle="Candidate Not Found" goBack={shortlistUrl}>
        <PacketEmptyState onRetry={executeFetch} shortlistUrl={shortlistUrl} />
      </NaiveShell>
    );
  }

  const candidateDisposition =
    packet?.human_decision?.action || ext?.status || "pending_review";
  const isAdvanced =
    String(candidateDisposition).toLowerCase() === "advance" ||
    String(candidateDisposition).toLowerCase() === "advanced" ||
    String(candidateDisposition).toLowerCase() === "shortlisted";

  const briefSidebar = (
    <CandidateBriefSidebar
      candidate={ext}
      packet={packet}
      hiringRun={run}
      onAction={handleAction}
      actionLoading={actionLoading}
      onLaunchScreening={handleLaunchScreening}
      screeningLoading={screeningLoading}
      emails={data?.emails || []}
      shortlistUrl={shortlistUrl}
    />
  );

  return (
    <NaiveShell
      pageTitle={ext?.candidate_name ? `Review: ${ext.candidate_name}` : "Candidate Review"}
      pageSubtitle={run?.role_title ? `${run.role_title}${run.company ? ` @ ${run.company}` : ""}` : "Evidence & Trust Verification"}
      rightPanel={briefSidebar}
      rightPanelTitle="Candidate Brief"
      showRightPanel={true}
      goBack={shortlistUrl}
      topBar={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              router.push(
                `/employer/chat?role_id=${run?.id || ext?.hiring_run_id || ""}&candidate_id=${ext?.id || extractionId || ""}`
              )
            }
            className="btn-ghost"
            data-testid="packet-continue-chat-btn"
          >
            <MessageSquare className="h-3 w-3 text-[var(--wbl-emerald-text)]" />
            <span>Continue in AI Chat →</span>
          </button>
          <button
            type="button"
            onClick={handleLaunchScreening}
            disabled={screeningLoading}
            className="btn-white disabled:opacity-50"
            data-testid="packet-launch-screen-top-btn"
          >
            <Play className="h-3 w-3 fill-current" />
            <span>{screeningLoading ? "Launching..." : "Launch Async Screening"}</span>
          </button>
        </div>
      }
    >
      <div className="p-6 max-w-4xl mx-auto space-y-5 pb-20">
        {/* Post-Decision Workflow Progression Banner */}
        {isAdvanced && (
          <Frame data-testid="post-advance-workflow-banner">
            <FrameHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[var(--wbl-emerald-text)]" />
                <FrameTitle>
                  Candidate Advanced · Next Workflow Actions Ready
                </FrameTitle>
              </div>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-[#00D604]/12 text-[var(--wbl-emerald-text)] border border-[#00D604]/30">
                STAGE: ADVANCED
              </span>
            </FrameHeader>
            <FramePanel className="flex flex-wrap items-center justify-between gap-3">
              <FrameDescription className="max-w-lg">
                Launch a targeted async screening room for missing-proof blockers or continue analyzing this Decision Packet in AI Chat.
              </FrameDescription>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleLaunchScreening}
                  disabled={screeningLoading}
                  className="btn-white"
                >
                  <Play className="h-3 w-3 fill-current" />
                  <span>
                    {screeningLoading
                      ? "Launching Room..."
                      : "1. Launch Async Screening Room"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/employer/chat?role_id=${run?.id || ext?.hiring_run_id || ""}&candidate_id=${ext?.id || extractionId || ""}`
                    )
                  }
                  className="btn-ghost"
                >
                  <MessageSquare className="h-3 w-3 text-[var(--wbl-emerald-text)]" />
                  <span>2. Deep-Dive Packet in AI Chat</span>
                </button>
                <button
                  type="button"
                  onClick={() => router.push(shortlistUrl)}
                  className="btn-ghost"
                >
                  <span>3. Cohort Kanban</span>
                  <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            </FramePanel>
          </Frame>
        )}

        {/* Full-Page Candidate Review Workspace */}
        <Frame>
          <FramePanel className="!p-5">
            <FullCandidateReview
              candidate={ext}
              packet={packet}
              hiringRun={run}
              onGenerateEvaluation={handleGenerateEvaluation}
              generating={generating}
            />
          </FramePanel>
        </Frame>

        {/* Human Decision & Action Rail */}
        <Frame>
          <FramePanel className="!p-4">
            <HumanDecisionRail
              extraction={ext}
              onAction={handleAction}
              actionLoading={actionLoading}
            />
          </FramePanel>
        </Frame>

        {/* Claim-to-Proof Ledger & Detailed Evidence Inspection */}
        {packet && (
          <div className="space-y-5 pt-2">
            <Frame>
              <FramePanel className="!p-4">
                <DecisionBlockers packet={packet} missingProof={packet.missing_proof} />
              </FramePanel>
            </Frame>

            <Frame>
              <FramePanel className="!p-4">
                <ClaimLedger
                  packet={packet}
                  claims={packet.claim_ledger || packet.claims}
                  evidenceRefs={packet.evidence_refs}
                  onSelectEvidence={handleSelectEvidence}
                />
              </FramePanel>
            </Frame>

            <ProductGovernanceNotice />
          </div>
        )}

        {/* Drawers */}
        {packet && (
          <>
            <AuditDetailsDrawer
              isOpen={isAuditDrawerOpen}
              onClose={handleCloseAudit}
              packet={packet}
              extraction={ext}
              hiringRun={run}
              triggerElement={auditTriggerElement}
            />

            <EvidenceDrawer
              isOpen={!!selectedEvidenceRef}
              onClose={handleCloseEvidence}
              evidenceRef={selectedEvidenceRef}
              triggerElement={evidenceTriggerElement}
            />
          </>
        )}
      </div>
    </NaiveShell>
  );
}
