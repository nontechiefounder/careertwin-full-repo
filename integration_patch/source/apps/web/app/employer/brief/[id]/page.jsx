"use client";

import { useState, useEffect, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { toast } from "sonner";
import { Loader2, ArrowRight, AlertTriangle, FileEdit, ShieldCheck, AlertCircle } from "lucide-react";
import Link from "next/link";
import ProofContractHeader from "@/components/brief/ProofContractHeader";
import RoleDefinitionPanel from "@/components/brief/RoleDefinitionPanel";
import RequirementGroup from "@/components/brief/RequirementGroup";
import ProofContractEmptyState from "@/components/brief/ProofContractEmptyState";
import ProofContractErrorState from "@/components/brief/ProofContractErrorState";
import ProductGovernanceNotice from "@/components/packet/ProductGovernanceNotice";
import ResearchQAPanel from "@/components/research/ResearchQAPanel";
import ContextEvidencePanel from "@/components/context/ContextEvidencePanel";

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
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [regenerating, setRegenerating] = useState(false);
  const [approving, setApproving] = useState(false);

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

  useEffect(() => {
    fetchBrief();
  }, [fetchBrief]);

  // Private-pilot operating model: sourcing sessions depend on an external API not
  // available in the current pilot. Navigation goes directly to the shortlist page
  // where the handoff guidance panel is displayed.
  const viewCandidatePipeline = () => {
    router.push(`/employer/shortlist/${id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0E0E0E] flex flex-col items-center justify-center text-[#F2F2F2]">
        <Loader2 className="h-6 w-6 text-[#10D97A] animate-spin mb-2" />
        <p className="text-xs font-mono text-[#A3A3A3]">Loading Proof Contract & Candidate Pipeline...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0E0E0E] text-[#F2F2F2] flex flex-col">
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
      </div>
    );
  }

  const brief = data?.brief;
  const run = data?.hiring_run;

  if (!run || !brief) {
    return (
      <div className="min-h-screen bg-[#0E0E0E] text-[#F2F2F2] flex flex-col">
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
      </div>
    );
  }

  const { isComplete, missingFields } = evaluateBriefCompleteness(run, brief);
  const statusLower = run.status ? String(run.status).toLowerCase() : "";

  return (
    <div className="min-h-screen bg-[#0E0E0E] text-[#F2F2F2] flex flex-col" data-testid="brief-page">
      <ProofContractHeader
        roleTitle={run.role_title}
        company={run.company}
        status={run.status}
        id={id}
        isComplete={isComplete}
        missingFields={missingFields}
        onRegenerate={() => fetchBrief(true)}
        regenerating={regenerating}
        onStartSourcing={viewCandidatePipeline}
        starting={false}
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

        {/* Explicit Rubric Version Approval Banner (RC-C1.2 Condition 1) */}
        {(() => {
          const briefJson = run.brief_json || {};
          const currentRubricVersion = run.rubric_version || briefJson.contract_version || run.contract_version || "1.0.0";
          const isApproved = briefJson.contract_approved === true;
          const hasApprover = Boolean(briefJson.approved_by && briefJson.approved_at);
          const isStale = isApproved && briefJson.approved_rubric_version && briefJson.approved_rubric_version !== currentRubricVersion;
          const isValidApproval = isApproved && hasApprover && !isStale;

          if (isValidApproval) {
            return (
              <div
                className="rounded-xl border border-[#10D97A]/40 bg-[#10D97A]/10 p-4 text-[#F2F2F2] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                data-testid="rubric-approved-banner"
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-[#10D97A] shrink-0" />
                  <div>
                    <h3 className="text-xs font-semibold text-[#10D97A] flex items-center gap-2">
                      ProofContract Rubric Approved
                      <span className="px-2 py-0.5 rounded bg-[#10D97A]/20 text-[#10D97A] font-mono text-[10px]">
                        v{briefJson.approved_rubric_version || currentRubricVersion}
                      </span>
                    </h3>
                    <p className="text-[11px] text-[#A3A3A3] mt-0.5">
                      Explicitly approved by <span className="font-mono text-[#F2F2F2]">{briefJson.approved_by}</span> on{" "}
                      {new Date(briefJson.approved_at).toLocaleString()}. Authoritative evaluation unblocked.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleApproveRubric}
                  disabled={approving}
                  className="px-3 py-1.5 rounded-lg border border-[#343434] bg-[#1A1A1A] text-xs font-medium text-[#A3A3A3] hover:text-[#F2F2F2] hover:border-[#10D97A]/40 transition-colors shrink-0"
                  data-testid="reapprove-rubric-btn"
                >
                  {approving ? "Re-approving..." : "Re-approve Rubric"}
                </button>
              </div>
            );
          }

          return (
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
                className="px-4 py-2 rounded-lg border border-[#10D97A]/50 bg-[#10D97A] text-xs font-semibold text-[#0E0E0E] hover:bg-[#10D97A]/90 transition-all shrink-0 flex items-center gap-1.5"
                data-testid="approve-rubric-btn"
              >
                <ShieldCheck className="h-4 w-4" />
                {approving ? "Approving Rubric..." : `Approve Rubric (v${currentRubricVersion})`}
              </button>
            </div>
          );
        })()}

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

        {/* Public Research QA Integration (Feature Gated) */}
        {process.env.NEXT_PUBLIC_ENABLE_RESEARCH_QA === "true" && (
          <div className="pt-2">
            <ResearchQAPanel hiringRunId={id} roleId={data?.role_id || data?.brief?.role_id} />
          </div>
        )}

        {/* Context Evidence Foundation Panel */}
        <div className="pt-2">
          <ContextEvidencePanel hiringRunId={id} orgId={data?.run?.org_id} />
        </div>

        {/* Bottom Actions */}
        <div className="pt-4 border-t border-[#343434] flex items-center justify-between">
          {isComplete ? (
            <>
              <button
                type="button"
                onClick={() => fetchBrief(true)}
                disabled={regenerating}
                className="text-xs text-[#A3A3A3] hover:text-[#F2F2F2] transition-colors font-mono"
              >
                {regenerating ? "Synthesizing..." : "Refresh synthesis with updated model routing"}
              </button>

              <button
                type="button"
                onClick={viewCandidatePipeline}
                className="px-5 py-2.5 rounded-xl border border-[#10D97A]/40 bg-[#10D97A] text-xs font-semibold text-[#0E0E0E] hover:bg-[#10D97A]/90 transition-all flex items-center gap-2"
                data-testid="proceed-pipeline-btn"
              >
                <ArrowRight className="h-4 w-4" />
                View Candidate Pipeline
              </button>
            </>
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
  );
}
