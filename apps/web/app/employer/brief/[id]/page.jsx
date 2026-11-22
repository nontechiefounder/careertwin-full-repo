"use client";

import { useState, useEffect, use, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { toast } from "sonner";
import { Loader2, ArrowRight, AlertTriangle, FileEdit, ShieldCheck, AlertCircle, Activity, FileText, Database, Users } from "lucide-react";
import Link from "next/link";
import NaiveShell from "@/components/NaiveShell";
import { Skeleton } from "@/components/ui/skeleton";
import ProofContractHeader from "@/components/brief/ProofContractHeader";
import RoleDefinitionPanel from "@/components/brief/RoleDefinitionPanel";
import RequirementGroup from "@/components/brief/RequirementGroup";
import ProofContractEmptyState from "@/components/brief/ProofContractEmptyState";
import ProofContractErrorState from "@/components/brief/ProofContractErrorState";
import ProductGovernanceNotice from "@/components/packet/ProductGovernanceNotice";
import ResearchQAPanel from "@/components/research/ResearchQAPanel";
import ContextEvidencePanel from "@/components/context/ContextEvidencePanel";
import AiTaskList from "@/components/ai-chat/AiTaskList";
import { MessageSquare } from "lucide-react";

export function evaluateBriefCompleteness(run, brief) {
  const hasTitle = Boolean(run?.role_title && typeof run.role_title === "string" && run.role_title.trim().length > 0);
  const hasSummaryOrDesc = Boolean(
    (brief?.role_summary && typeof brief.role_summary === "string" && brief.role_summary.trim().length >= 10) ||
    (run?.job_description && typeof run.job_description === "string" && run.job_description.trim().length >= 10)
  );
  const mustReqs = brief?.explicit_requirements || brief?.must_haves || run?.must_haves || [];
  const hasMustHaves = Array.isArray(mustReqs) && mustReqs.length > 0;

  const missingFields = [];
  if (!hasTitle) missingFields.push("role_title");
  if (!hasSummaryOrDesc) missingFields.push("job_description");
  if (!hasMustHaves) missingFields.push("must_haves");

  // Proof-contract readiness is purely input-driven, independent of persisted lifecycle status
  const isComplete = missingFields.length === 0;

  return { isComplete, missingFields };
}

export default function BriefPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") || "overview";

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [regenerating, setRegenerating] = useState(false);
  const [approving, setApproving] = useState(false);

  const fetchBrief = useCallback(async (isRegeneration = false) => {
    if (isRegeneration) setRegenerating(true);
    setError(null);
    try {
      const res = await api.get(`/employer/brief/${id}${isRegeneration ? "?force=true" : ""}`);
      setData(res.data);
      if (isRegeneration) toast.success("Brief refreshed with fresh synthesis");
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.detail || "Failed to load brief";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
  }, [id]);

  const handleApproveRubric = async () => {
    setApproving(true);
    try {
      const res = await api.post(`/employer/brief/${id}/approve`);
      if (res.data?.success) {
        toast.success(`Rubric version ${res.data.approved_rubric_version} approved successfully`);
        await fetchBrief();
      }
    } catch (err) {
      const msg = err.response?.data?.details || err.response?.data?.error || err.message || "Failed to approve rubric";
      toast.error(msg);
    } finally {
      setApproving(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/employer/brief/${id}`);
        if (!cancelled) {
          setData(res.data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err.response?.data?.error || err.response?.data?.detail || "Failed to load brief";
          setError(msg);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRegenerating(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const viewCandidatePipeline = () => {
    router.push(`/employer/shortlist/${id}`);
  };

  if (loading) {
    return (
      <NaiveShell
        pageTitle="Role Workspace"
        pageSubtitle="Loading evidence & verification contract..."
        activeNav="hiring"
        goBack="/employer"
      >
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
          <div className="p-6 rounded-2xl border border-white/[0.08] bg-[#0A0A0A] space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-7 w-64 bg-white/[0.06]" />
                <Skeleton className="h-4 w-40 bg-white/[0.04]" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-28 rounded-xl bg-white/[0.06]" />
                <Skeleton className="h-9 w-32 rounded-xl bg-white/[0.06]" />
              </div>
            </div>
            <div className="flex gap-3 border-t border-white/[0.06] pt-4">
              <Skeleton className="h-6 w-20 bg-white/[0.04]" />
              <Skeleton className="h-6 w-24 bg-white/[0.04]" />
              <Skeleton className="h-6 w-20 bg-white/[0.04]" />
            </div>
          </div>
          <Skeleton className="h-20 w-full rounded-2xl bg-white/[0.04]" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-64 rounded-2xl bg-white/[0.04]" />
            <Skeleton className="h-64 rounded-2xl bg-white/[0.04]" />
          </div>
        </div>
      </NaiveShell>
    );
  }

  if (error) {
    return (
      <NaiveShell
        pageTitle="Role Workspace"
        pageSubtitle="Error loading role brief"
        activeNav="hiring"
        goBack="/employer"
      >
        <ProofContractHeader
          roleTitle="Error"
          id={id}
          onRegenerate={() => fetchBrief(true)}
          regenerating={regenerating}
          onStartSourcing={viewCandidatePipeline}
          starting={false}
        />
        <main className="flex-1 p-6">
          <ProofContractErrorState error={error} onRetry={() => fetchBrief()} />
        </main>
      </NaiveShell>
    );
  }

  const brief = data?.brief;
  const run = data?.hiring_run;

  if (!run || !brief) {
    return (
      <NaiveShell
        pageTitle="Role Workspace"
        pageSubtitle="Hiring brief empty state"
        activeNav="hiring"
        goBack="/employer"
      >
        <ProofContractHeader
          roleTitle="Hiring Brief"
          id={id}
          onRegenerate={() => fetchBrief(true)}
          regenerating={regenerating}
          onStartSourcing={viewCandidatePipeline}
          starting={false}
        />
        <main className="flex-1 p-6">
          <ProofContractEmptyState />
        </main>
      </NaiveShell>
    );
  }

  const { isComplete, missingFields } = evaluateBriefCompleteness(run, brief);
  const statusLower = run.status ? String(run.status).toLowerCase() : "";

  const briefJson = run.brief_json || {};
  const currentRubricVersion = run.rubric_version || briefJson.contract_version || run.contract_version || "1.0.0";
  const isApproved = briefJson.contract_approved === true;
  const hasApprover = Boolean(briefJson.approved_by && briefJson.approved_at);
  const isStale = isApproved && briefJson.approved_rubric_version && briefJson.approved_rubric_version !== currentRubricVersion;
  const isValidApproval = isApproved && hasApprover && !isStale;

  const candidatesCount = run.candidates_count || 0;
  const unreviewedCount = Math.max(0, candidatesCount - (run.screens_completed || 0));

  return (
    <NaiveShell
      pageTitle={`Role: ${run.role_title || "Role Workspace"}`}
      pageSubtitle={run.company ? `${run.company} · Evidence-Governed Verification` : "Role Workspace & Verification Contract"}
      activeNav="hiring"
      goBack="/employer"
    >
      <div className="min-h-full flex flex-col" data-testid="brief-page">
        <ProofContractHeader
          id={id}
          roleTitle={run.role_title}
          company={run.company}
          status={run.status}
          isComplete={isComplete}
          missingFields={missingFields}
          rubricVersion={currentRubricVersion}
          isRubricApproved={isValidApproval}
          approvedRubricVersion={briefJson.approved_rubric_version}
          onApproveRubric={handleApproveRubric}
          approvingRubric={approving}
          onRegenerate={() => fetchBrief(true)}
          regenerating={regenerating}
          onStartSourcing={viewCandidatePipeline}
          starting={false}
          candidatesCount={candidatesCount}
          unreviewedCount={unreviewedCount}
          activeTab={currentTab}
        />

        <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8 space-y-6">
        {/* Incomplete Contract Warning Banner (Part 1 Truthful Copy) */}
        {!isComplete && (
          <div
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200 flex items-start gap-3"
            data-testid="contract-incomplete-banner"
          >
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-amber-300">Proof Contract Incomplete</h3>
              <p className="text-xs text-amber-200/80 leading-relaxed font-sans" data-testid="contract-incomplete-copy">
                {statusLower === "active"
                  ? "This active hiring run is missing required proof-contract inputs. Complete the missing inputs before starting candidate sourcing."
                  : statusLower === "draft"
                  ? "This draft hiring run is missing required proof-contract inputs. Complete the missing inputs before starting candidate sourcing."
                  : "This hiring run is missing required proof-contract inputs. Complete the missing inputs before starting candidate sourcing."}
              </p>
              {missingFields.length > 0 && (
                <p className="text-[11px] font-mono text-amber-300/90" data-testid="contract-missing-fields">
                  Missing required inputs: {missingFields.join(", ")}
                </p>
              )}
              <div className="pt-2">
                <Link
                  href={`/employer/intake?id=${id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500 text-[#0E0E0E] text-xs font-semibold hover:bg-amber-400 transition-colors"
                  data-testid="complete-intake-banner-btn"
                >
                  <FileEdit className="h-3.5 w-3.5" />
                  Complete Role Intake Inputs
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Product Governance Notice */}
        <ProductGovernanceNotice />

        {/* Explicit Rubric Version Approval Banner */}
        {isValidApproval ? (
          <div
            className={`rounded-xl border ${
              isComplete
                ? "border-[#00D604]/40 bg-[#00D604]/10 text-[#F2F2F2]"
                : "border-amber-500/30 bg-amber-500/5 text-[#F2F2F2]"
            } p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4`}
            data-testid="rubric-approved-banner"
          >
            <div className="flex items-center gap-3">
              <ShieldCheck className={`h-5 w-5 ${isComplete ? "text-[#00D604]" : "text-amber-400"} shrink-0`} />
              <div>
                <h3 className={`text-xs font-semibold ${isComplete ? "text-[#00D604]" : "text-amber-300"} flex items-center gap-2`}>
                  ProofContract Rubric Approved
                  <span className={`px-2 py-0.5 rounded ${isComplete ? "bg-[#00D604]/20 text-[#00D604]" : "bg-amber-500/20 text-amber-300"} font-mono text-[10px]`}>
                    v{briefJson.approved_rubric_version || currentRubricVersion}
                  </span>
                </h3>
                <p className="text-[11px] text-[#A3A3A3] mt-0.5">
                  Explicitly approved by <span className="font-mono text-[#F2F2F2]">{briefJson.approved_by}</span> on{" "}
                  {new Date(briefJson.approved_at).toLocaleString()}.{" "}
                  {isComplete ? (
                    <span className="text-[#00D604]/90 font-medium">Authoritative evaluation unblocked.</span>
                  ) : (
                    <span className="text-amber-300/90 font-medium">Authoritative evaluation blocked until required role inputs above are completed.</span>
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleApproveRubric}
              disabled={approving}
              className="px-3 py-1.5 rounded-lg border border-[#343434] bg-[#1A1A1A] text-xs font-medium text-[#A3A3A3] hover:text-[#F2F2F2] hover:border-[#00D604]/40 transition-colors shrink-0"
              data-testid="reapprove-rubric-btn"
            >
              {approving ? "Re-approving..." : "Re-approve Rubric"}
            </button>
          </div>
        ) : (
          <div
            className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            data-testid="rubric-approval-required-banner"
          >
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-400 shrink-0" />
              <div>
                <h3 className="text-xs font-semibold text-amber-300 flex items-center gap-2">
                  {isStale ? "ProofContract Rubric Approval Stale" : "Explicit Rubric Approval Required"}
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px]">
                    v{currentRubricVersion}
                  </span>
                </h3>
                <p className="text-[11px] text-amber-200/80 mt-0.5">
                  {isStale
                    ? `Role rubric updated to v${currentRubricVersion} (approved was v${briefJson.approved_rubric_version}). Re-approval required before packet generation.`
                    : "Packet generation strictly requires explicit persisted approval of this rubric version. Inferred approval is disallowed."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleApproveRubric}
              disabled={approving}
              className="px-4 py-2 rounded-lg border border-[#00D604]/50 bg-[#00D604] text-xs font-semibold text-[#0E0E0E] hover:bg-[#00D604]/90 transition-all shrink-0 flex items-center gap-1.5"
              data-testid="approve-rubric-btn"
            >
              <ShieldCheck className="h-4 w-4" />
              {approving ? "Approving Rubric..." : `Approve Rubric (v${currentRubricVersion})`}
            </button>
          </div>
        )}

        {/* ── TAB 1: OVERVIEW ── */}
        {currentTab === "overview" && (
          <div className="space-y-6">
            {/* Role Definition */}
            <RoleDefinitionPanel
              summary={brief.role_summary}
              location={run.location}
              stage={run.company_stage}
              company={run.company}
            />

            {/* Requirements Grid */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[#F2F2F2]">Requirements & Evidence Expectations</h2>
                <span className="text-[10px] font-mono text-[#A3A3A3]">
                  Insufficient evidence is not an automatic rejection.
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RequirementGroup
                  title="Must-Have Requirements"
                  type="must"
                  items={brief.explicit_requirements || brief.must_haves || run.must_haves || []}
                />
                <RequirementGroup
                  title="Inferred / Evidence Requirements"
                  type="inferred"
                  items={brief.inferred_requirements || brief.nice_to_haves || run.nice_to_haves || []}
                />
                <RequirementGroup
                  title="Disqualifier Conditions"
                  type="disqualifier"
                  items={brief.disqualifiers || run.disqualifiers || []}
                  emptyText="No explicit disqualifiers defined"
                />
                <RequirementGroup
                  title="Human Review & Verification Focus"
                  type="verification"
                  items={brief.verification_focus || []}
                />
              </div>
            </div>

            {/* AI Task List Telemetry */}
            <div className="pt-2">
              <AiTaskList
                title="Unified Role Intelligence Pipeline"
                tasks={[
                  { id: "t1", label: "Multi-Intake Parsing (JD & Rubric Extraction)", status: isComplete ? "completed" : "in_progress", intake: "Role Brief" },
                  { id: "t2", label: "Semantic Knowledge Graph Synthesis", status: "completed", intake: "Evidence Engine" },
                  { id: "t3", label: "Verified Candidate Sourcing & Enrichment", status: "completed", intake: "Global Talent Graph" },
                  { id: "t4", label: "Proof Contract Verification & Shortlist", status: "completed", intake: "Shortlist Pipeline" }
                ]}
              />
            </div>

            {/* Context Evidence Panel Summary */}
            <div className="pt-2">
              <ContextEvidencePanel
                hiringRunId={id}
                orgId={run?.org_id || data?.run?.org_id}
                userRole={data?.membership_role || "recruiter"}
              />
            </div>
          </div>
        )}

        {/* ── TAB 2: EVIDENCE WORKSPACE ── */}
        {currentTab === "evidence" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-white/[0.08] bg-[#141414] p-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white/95">Role Evidence & Material Repository</h2>
                <p className="text-xs text-white/40 mt-0.5">
                  Inspect raw documents, upload revisions, and trace parsed passages to verified claims.
                </p>
              </div>
            </div>
            <ContextEvidencePanel
              hiringRunId={id}
              orgId={run?.org_id || data?.run?.org_id}
              userRole={data?.membership_role || "recruiter"}
            />
          </div>
        )}

        {/* ── TAB 3: ACTIVITY WORKSPACE ── */}
        {currentTab === "activity" && (
          <div className="rounded-xl border border-white/[0.08] bg-[#141414] p-6 space-y-4">
            <div className="border-b border-white/[0.08] pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white/95">Hiring Workflow Activity Log</h2>
                <p className="text-xs text-white/40 mt-0.5">
                  Chronological record of rubric approvals, document ingestion, and candidate review decisions.
                </p>
              </div>
              <span className="text-[10px] font-mono text-[#00D604] uppercase bg-[#00D604]/10 px-2.5 py-1 rounded-full border border-[#00D604]/20">
                Audited Timeline
              </span>
            </div>

            <div className="space-y-3 pt-2">
              {/* Approval Event */}
              {isApproved && (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <div className="p-2 rounded-lg bg-[#00D604]/10 text-[#00D604] shrink-0">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-white/90">
                        Rubric v{briefJson.approved_rubric_version || currentRubricVersion} Formally Approved
                      </p>
                      <span className="text-[10px] font-mono text-white/40">
                        {briefJson.approved_at ? new Date(briefJson.approved_at).toLocaleDateString() : "Approved"}
                      </span>
                    </div>
                    <p className="text-[11px] text-white/50 mt-0.5">
                      Approved by {briefJson.approved_by || "Recruiter"}. Proof evaluation contract unblocked.
                    </p>
                  </div>
                </div>
              )}

              {/* Role Creation Event */}
              <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 shrink-0">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-white/90">Role Created: {run.role_title}</p>
                    <span className="text-[10px] font-mono text-white/40">
                      {new Date(run.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-[11px] text-white/50 mt-0.5">
                    Initial intake parameters and criteria draft generated.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bottom Actions */}
        <div className="pt-4 border-t border-[#343434] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Link
              href={`/employer/chat?roleId=${id}`}
              className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.10] text-xs font-mono text-white/90 hover:text-white transition-all flex items-center gap-2"
            >
              <MessageSquare className="h-3.5 w-3.5 text-[#00D604]" />
              Role Copilot Chat
            </Link>
            {isComplete && (
              <button
                type="button"
                onClick={() => fetchBrief(true)}
                disabled={regenerating}
                className="text-xs text-[#A3A3A3] hover:text-[#F2F2F2] transition-colors font-mono hidden md:inline"
              >
                {regenerating ? "Synthesizing..." : "Refresh synthesis"}
              </button>
            )}
          </div>

          {isComplete ? (
            <button
              type="button"
              onClick={viewCandidatePipeline}
              className="px-5 py-2.5 rounded-xl border border-[#00D604]/40 bg-[#00D604] text-xs font-semibold text-[#0E0E0E] hover:bg-[#00D604]/90 transition-all flex items-center gap-2"
              data-testid="proceed-pipeline-btn"
            >
              <ArrowRight className="h-4 w-4" />
              View Candidate Pipeline
            </button>
          ) : (
            <Link
              href={`/employer/intake?id=${id}`}
              className="px-5 py-2.5 rounded-xl border border-amber-500/50 bg-amber-500 text-xs font-semibold text-[#0E0E0E] hover:bg-amber-400 transition-all flex items-center gap-2 ml-auto"
              data-testid="bottom-complete-intake-btn"
            >
              <FileEdit className="h-4 w-4" />
              Complete Role Intake
            </Link>
          )}
        </div>
      </main>
    </div>
  </NaiveShell>
);
}
