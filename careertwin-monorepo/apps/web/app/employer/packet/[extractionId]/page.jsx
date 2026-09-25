"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { toast } from "sonner";
import NaiveShell from "@/components/NaiveShell";

// Import modular Trust Packet components
import CandidateHeader from "@/components/packet/CandidateHeader";
import DecisionOverview from "@/components/packet/DecisionOverview";
import DecisionBlockers from "@/components/packet/DecisionBlockers";
import WhatWeKnow from "@/components/packet/WhatWeKnow";
import ClaimLedger from "@/components/packet/ClaimLedger";
import HumanDecisionRail from "@/components/packet/HumanDecisionRail";
import ProductGovernanceNotice from "@/components/packet/ProductGovernanceNotice";
import AuditDetailsDrawer from "@/components/packet/AuditDetailsDrawer";
import EvidenceDrawer from "@/components/packet/EvidenceDrawer";
import PacketSkeleton from "@/components/packet/PacketSkeleton";
import PacketEmptyState from "@/components/packet/PacketEmptyState";
import PacketErrorState from "@/components/packet/PacketErrorState";

export default function PacketPage({ params }) {
  const routeParams = useParams();
  const extractionId = routeParams?.extractionId || params?.extractionId;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
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
        try {
          const extRes = await api.get(`/employer/candidate-extractions/${extractionId}`);
          setData({ extraction: extRes.data });
        } catch (e) {}
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
    executeFetch();
  }, [executeFetch]);

  const handleAction = async (action) => {
    setActionLoading(true);
    try {
      await api.post(`/employer/packets/${extractionId}/action`, { action });
      toast.success(`Candidate ${action}ed successfully`);
      await executeFetch();
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed to ${action} candidate`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenAudit = (btn) => {
    setAuditTriggerElement(btn);
    setIsAuditDrawerOpen(true);
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

  // 3. Packet Unavailable / Empty State
  if (notFound || !packet) {
    return (
      <NaiveShell pageTitle="Candidate Trust Packet" pageSubtitle="Packet unavailable" goBack={shortlistUrl}>
        <PacketEmptyState onRetry={executeFetch} shortlistUrl={shortlistUrl} />
      </NaiveShell>
    );
  }

  // Extract evaluations metrics and canonical readiness state
  const metrics = packet.evaluation_metrics || {};
  const readinessState = metrics.decision_readiness || null;

  return (
    <NaiveShell
      pageTitle={ext?.candidate_name ? `Packet: ${ext.candidate_name}` : "Candidate Trust Packet"}
      pageSubtitle={run?.role_title ? `Role: ${run.role_title}` : "Evidence & Trust Verification"}
      goBack={shortlistUrl}
    >
      <div className="p-6 max-w-4xl mx-auto space-y-6 pb-16">
        {/* 1. Candidate Header (Exactly ONE canonical readiness badge) */}
        <CandidateHeader
          candidateName={ext?.candidate_name}
          targetRole={run?.role_title}
          currentRole={ext?.current_role}
          location={ext?.location}
          readinessState={readinessState}
          revision={packet.ledger_revision}
          evaluatedTimestamp={packet.evaluation_timestamp}
          onOpenAuditDetails={handleOpenAudit}
        />

        {/* 2. Decision Overview & Proof Metrics */}
        <DecisionOverview
          evaluationMetrics={metrics}
          fitScore={ext?.fit_score}
          proofStrength={ext?.proof_strength}
        />

        {/* 3. Decision Blockers & Minimum Missing Proof */}
        <DecisionBlockers packet={packet} missingProof={packet.missing_proof} />

        {/* 4. Evidence Categorization: What We Know */}
        <WhatWeKnow packet={packet} />

        {/* 5. Claim-to-Proof Ledger */}
        <ClaimLedger
          packet={packet}
          claims={packet.claim_ledger || packet.claims}
          evidenceRefs={packet.evidence_refs}
          onSelectEvidence={handleSelectEvidence}
        />

        {/* 6. Human Reviewer Decision & Action Rail */}
        <HumanDecisionRail extraction={ext} onAction={handleAction} actionLoading={actionLoading} />

        {/* 7. Product Governance Notice Footer */}
        <ProductGovernanceNotice />

        {/* Drawers */}
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
      </div>
    </NaiveShell>
  );
}
