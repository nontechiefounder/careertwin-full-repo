"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { resolveAuthoritativeFitScore } from "@/lib/scoreUtils";
import { toast } from "sonner";
import NaiveShell from "@/components/NaiveShell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  AlertCircle,
  FileEdit,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  MessageSquare,
  ArrowUpRight,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import ShortlistHeader from "@/components/shortlist/ShortlistHeader";
import ShortlistFilters from "@/components/shortlist/ShortlistFilters";
import CandidateEvidenceCard from "@/components/shortlist/CandidateEvidenceCard";
import ShortlistEmptyState from "@/components/shortlist/ShortlistEmptyState";
import ShortlistErrorState from "@/components/shortlist/ShortlistErrorState";
import ProductGovernanceNotice from "@/components/packet/ProductGovernanceNotice";
import CandidateShortlistSidebar from "@/components/shortlist/CandidateShortlistSidebar";
import {
  Frame,
  FramePanel,
  FrameHeader,
  FrameTitle,
  FrameFooter,
} from "@/components/ui/frame";

/**
 * 4-Column Kanban Pipeline View
 */
function KanbanPipelineBoard({ extractions = [], roleId, onSelectCandidate, onNavigate }) {
  const columns = [
    {
      id: "sourced",
      title: "Sourced & Extracted",
      dotClass: "bg-blue-400",
      match: (ext) => {
        const st = String(ext.decision_packet?.human_decision?.action || ext.status || "").toLowerCase();
        return !st || st === "extracted" || st === "pending" || st === "pending_review";
      },
    },
    {
      id: "ready",
      title: "Proof Evaluated",
      dotClass: "bg-purple-400",
      match: (ext) => {
        const st = String(ext.decision_packet?.human_decision?.action || ext.status || "").toLowerCase();
        return st === "in_review" || st === "evaluated" || st === "ready_for_screen";
      },
    },
    {
      id: "advanced",
      title: "Screening & Advanced",
      dotClass: "bg-[#00D604]",
      match: (ext) => {
        const st = String(ext.decision_packet?.human_decision?.action || ext.status || "").toLowerCase();
        return st === "advance" || st === "advanced" || st === "shortlisted" || st === "screening";
      },
    },
    {
      id: "hold_reject",
      title: "On Hold / Archived",
      dotClass: "bg-amber-400",
      match: (ext) => {
        const st = String(ext.decision_packet?.human_decision?.action || ext.status || "").toLowerCase();
        return st === "hold" || st === "reject" || st === "rejected";
      },
    },
  ];

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-start"
      data-testid="kanban-pipeline-board"
    >
      {columns.map((col) => {
        const cards = extractions.filter(col.match);
        return (
          <Frame key={col.id} className="w-full">
            <FrameHeader className="px-2.5 py-1.5">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${col.dotClass}`} />
                <FrameTitle className="text-xs">{col.title}</FrameTitle>
              </div>
              <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono bg-[#222222] text-[#8D8D8D] border border-[#303030]">
                {cards.length}
              </span>
            </FrameHeader>

            <div className="flex flex-col gap-2">
              {cards.length === 0 ? (
                <FramePanel className="!p-4 text-center">
                  <p className="text-[11px] text-[#8D8D8D]">No candidates in stage</p>
                </FramePanel>
              ) : (
                cards.map((ext) => {
                  const profile = ext.candidate_profiles || {};
                  const pkt = ext.decision_packet || {};
                  const name = profile.name || ext.candidate_name || "Candidate";
                  const role = profile.bio || ext.current_role || "Role details unrecorded";
                  const hasEvaluation = Boolean(pkt && (pkt.evaluation_timestamp || pkt.id || pkt.ledger_id || ext.fit_score != null));
                  const canonicalFit = hasEvaluation
                    ? resolveAuthoritativeFitScore(pkt, ext)
                    : null;
                  const fitPct = canonicalFit != null ? Math.round(canonicalFit * 100) : null;
                  const missingCount = Array.isArray(pkt.missing_proof)
                    ? pkt.missing_proof.length
                    : 0;

                  return (
                    <FramePanel
                      key={ext.id}
                      onClick={() => onSelectCandidate && onSelectCandidate(ext.id)}
                      className="!p-3.5 space-y-3 cursor-pointer hover:border-[#484848] transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-[#00D604]/12 border border-[#00D604]/30 flex items-center justify-center text-[11px] font-mono font-bold text-[var(--wbl-emerald-text)] shrink-0">
                            {name[0] || "C"}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-[#E1E1E5] truncate">
                              {name}
                            </p>
                            <p className="text-[10px] text-[#8D8D8D] truncate">
                              {role}
                            </p>
                          </div>
                        </div>

                        {missingCount > 0 && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/12 text-amber-300 border border-amber-500/25 shrink-0">
                            <AlertTriangle className="h-2.5 w-2.5 text-amber-400" />
                            {missingCount} gap
                          </span>
                        )}
                      </div>

                      {/* Match Score Bar */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-[#8D8D8D]">Match score</span>
                          <span className="font-mono font-semibold text-[#E1E1E5] tabular-nums">
                            {fitPct != null ? `${fitPct}%` : hasEvaluation ? "Unverified" : "Pending"}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-[#222222] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${fitPct ?? 0}%`,
                              backgroundColor: fitPct == null ? "#52525B" : fitPct >= 80 ? "#00D604" : "#F59E0B",
                            }}
                          />
                        </div>
                      </div>

                      {/* Footer Pills: Packet + AI Chat */}
                      <div className="flex items-center justify-between gap-1.5 pt-2 border-t border-[#303030]">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigate(`/employer/packet/${ext.id}`);
                          }}
                          className="px-2 py-1 rounded-md bg-[#222222] hover:bg-[#292929] border border-[#303030] text-[10px] font-mono text-[#E1E1E5] inline-flex items-center gap-1"
                        >
                          <span>Decision Packet</span>
                          <ArrowUpRight className="h-2.5 w-2.5" />
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            try {
                              sessionStorage.setItem(
                                "wbl_last_viewed_packet",
                                JSON.stringify({ extractionId: ext.id, roleId })
                              );
                            } catch {}
                            onNavigate(
                              `/employer/chat?candidate_id=${ext.id}&roleId=${roleId}`
                            );
                          }}
                          className="px-2 py-1 rounded-md bg-[#00D604]/10 hover:bg-[#00D604]/20 border border-[#00D604]/30 text-[10px] font-mono text-[var(--wbl-emerald-text)] inline-flex items-center gap-1"
                        >
                          <MessageSquare className="h-2.5 w-2.5" />
                          <span>Ask AI</span>
                        </button>
                      </div>
                    </FramePanel>
                  );
                })
              )}
            </div>
          </Frame>
        );
      })}
    </div>
  );
}

export default function ShortlistPage({ params }) {
  const { roleId } = use(params);
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [viewMode, setViewMode] = useState("list"); // "list" (default for test compatibility) | "kanban"

  // Filters & Bounded Dynamic Pagination
  const [readinessFilter, setReadinessFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const fetchShortlist = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/employer/shortlist/${roleId}`);
      setData(res.data);
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        "Failed to load candidate shortlist";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [roleId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/employer/shortlist/${roleId}`);
        if (!cancelled) {
          setData(res.data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const msg =
            err.response?.data?.error ||
            err.response?.data?.detail ||
            "Failed to load candidate shortlist";
          setError(msg);
          toast.error(msg);
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
  }, [roleId]);

  const handleReadinessChange = (val) => {
    setReadinessFilter(val);
    setCurrentPage(1);
  };

  const handleSearchChange = (val) => {
    setSearchQuery(val);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setReadinessFilter("ALL");
    setSearchQuery("");
    setCurrentPage(1);
  };

  if (loading) {
    return (
      <NaiveShell
        pageTitle="Cohort Candidates"
        pageSubtitle="Loading candidate trust packets & evaluation matrix..."
        activeNav="people"
        goBack="/employer"
      >
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">
          <div className="p-5 rounded-2xl border border-white/[0.08] bg-[#0A0A0A] flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-6 w-56 bg-white/[0.06]" />
              <Skeleton className="h-4 w-36 bg-white/[0.04]" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-28 rounded-xl bg-white/[0.06]" />
              <Skeleton className="h-9 w-28 rounded-xl bg-white/[0.06]" />
            </div>
          </div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-lg bg-white/[0.04]" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-28 rounded-2xl bg-white/[0.04]" />
              ))}
            </div>
            <Skeleton className="h-96 rounded-2xl bg-white/[0.04]" />
          </div>
        </div>
      </NaiveShell>
    );
  }

  if (error) {
    return (
      <NaiveShell
        pageTitle="Cohort Candidates"
        pageSubtitle="Error loading candidate shortlist"
        activeNav="people"
        goBack="/employer"
      >
        <ShortlistHeader roleTitle="Error" roleId={roleId} />
        <main className="flex-1 p-6">
          <ShortlistErrorState error={error} onRetry={fetchShortlist} />
        </main>
      </NaiveShell>
    );
  }

  const run = data?.hiring_run;
  const allExtractions = data?.extractions || [];
  const counts = data?.counts || {
    cohort_candidates: allExtractions.length,
    documents_received: 0,
    evaluations_completed: allExtractions.filter((e) =>
      Boolean(e.decision_packet)
    ).length,
  };

  // Filter extractions based on readiness state and search query
  const filteredExtractions = allExtractions.filter((ext) => {
    const profile = ext.candidate_profiles || {};
    const packet = ext.decision_packet || {};
    const metrics = packet.evaluation_metrics || {};

    const readiness = (
      metrics.decision_readiness ||
      ext.readiness_state ||
      "READINESS UNAVAILABLE"
    )
      .toUpperCase()
      .trim();

    if (readinessFilter !== "ALL" && readiness !== readinessFilter) {
      return false;
    }

    if (searchQuery && searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase().trim();
      const name = (profile.name || ext.candidate_name || "").toLowerCase();
      const role = (profile.bio || ext.current_role || "").toLowerCase();
      if (!name.includes(q) && !role.includes(q)) {
        return false;
      }
    }

    return true;
  });

  const totalFiltered = filteredExtractions.length;
  const totalPages = Math.ceil(totalFiltered / pageSize) || 1;
  const validPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = totalFiltered > 0 ? (validPage - 1) * pageSize : 0;
  const endIndex = Math.min(startIndex + pageSize, totalFiltered);
  const displayExtractions = filteredExtractions.slice(startIndex, endIndex);

  let countLabelText = `Showing ${startIndex + 1}–${endIndex} of ${totalFiltered} cohort candidates`;
  if (readinessFilter !== "ALL") {
    countLabelText = `Showing ${startIndex + 1}–${endIndex} of ${totalFiltered} candidates matching ${readinessFilter}`;
  } else if (searchQuery && searchQuery.trim() !== "") {
    countLabelText = `Showing ${startIndex + 1}–${endIndex} of ${totalFiltered} matching candidates`;
  }

  const selectedExtraction =
    allExtractions.find((e) => e.id === selectedId) ||
    displayExtractions[0] ||
    null;

  const handleCandidateAction = async (candId, action, rationale) => {
    try {
      const targetExt = allExtractions.find((e) => e.id === candId);
      const pkt = targetExt?.decision_packet;
      const rev = Number(pkt?.ledger_revision);
      const rubric = (pkt?.rubric_version || pkt?.role_version || "").trim();
      const hasVersionedPacket = Boolean(
        pkt && Number.isInteger(rev) && rev > 0 && rubric.length > 0
      );
      const effectiveRationale =
        rationale && rationale.trim()
          ? rationale.trim()
          : action === "advance"
          ? "Advanced to next stage after candidate shortlist review."
          : `Candidate placed on ${action} during shortlist review.`;
      if (!hasVersionedPacket) {
        const preStatus =
          typeof targetExt?.status === "string" && targetExt.status.trim().length > 0
            ? targetExt.status.trim()
            : "";
        if (!preStatus) {
          toast.error("Candidate state is missing or stale; refreshing shortlist...");
          await fetchShortlist();
          return;
        }
        const preRev = Number.isInteger(Number(targetExt?.pre_evaluation_revision))
          ? Number(targetExt.pre_evaluation_revision)
          : 0;
        const payload = {
          action,
          rationale: effectiveRationale,
          pre_evaluation_disposition: true,
          expected_evaluation_phase: "pre_evaluation",
          expected_status: preStatus,
          expected_pre_eval_revision: preRev,
        };
        await api.post(`/employer/packets/${candId}/action`, payload);
      } else {
        const payload = {
          action,
          rationale: effectiveRationale,
          expected_ledger_revision: rev,
          expected_rubric_version: rubric,
        };
        await api.post(`/employer/packets/${candId}/action`, payload);
      }
      toast.success(
        `Candidate ${
          action === "advance"
            ? "advanced"
            : action === "hold"
            ? "put on hold"
            : "rejected"
        } successfully`
      );
      await fetchShortlist();
    } catch (err) {
      if (err.response?.status === 409 || err.response?.data?.error === "REVIEW_REVISION_CONFLICT") {
        toast.error("Candidate state changed concurrently. Refreshing shortlist for fresh review...");
        await fetchShortlist();
      } else {
        toast.error(
          err.response?.data?.details ||
            err.response?.data?.error ||
            `Failed to ${action} candidate`
        );
      }
    }
  };

  return (
    <NaiveShell
      pageTitle={`Cohort Candidates: ${run?.role_title || "Shortlist"}`}
      pageSubtitle={run?.company ? `${run.company} · ${counts.cohort_candidates} candidates` : "Candidate Evaluation Matrix"}
      activeNav="people"
      goBack={`/employer/brief/${roleId}`}
    >
      <div
        className="wbl-app-shell min-h-full flex flex-col"
        data-testid="shortlist-page"
      >
        <ShortlistHeader
        roleTitle={run?.role_title}
        company={run?.company}
        roleId={roleId}
        counts={counts}
        onUploadSuccess={fetchShortlist}
      />

      <ShortlistFilters
        readinessFilter={readinessFilter}
        onReadinessChange={handleReadinessChange}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        totalResults={totalFiltered}
        onClearFilters={handleClearFilters}
      />

      <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-6 flex flex-col lg:flex-row gap-6">
        <main className="flex-1 min-w-0 space-y-5">
          {/* Zero-Evaluations Truthful Banner */}
          {allExtractions.length > 0 && counts.evaluations_completed === 0 && (
            <div
              className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-amber-200 flex items-start gap-3"
              data-testid="no-evaluations-banner"
            >
              <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-amber-300">
                  0 Evaluations Completed
                </h3>
                <p className="text-xs text-amber-200/80 leading-relaxed font-sans">
                  {counts.cohort_candidates} candidates are associated with this
                  role cohort, but 0 candidate evaluations are available yet for
                  this hiring run.
                </p>
                <div>
                  <Link
                    href={`/employer/intake?id=${roleId}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-amber-500/50 bg-amber-500 text-[#0E0E0E] text-xs font-semibold hover:bg-amber-400 transition-colors"
                    data-testid="review-intake-banner-btn"
                  >
                    <FileEdit className="h-4 w-4" />
                    Review Candidate Intake Options
                  </Link>
                </div>
              </div>
            </div>
          )}

          <ProductGovernanceNotice />

          {allExtractions.length === 0 ? (
            <ShortlistEmptyState roleId={roleId} />
          ) : totalFiltered === 0 ? (
            <ShortlistEmptyState
              roleId={roleId}
              isFiltered={true}
              onClearFilters={handleClearFilters}
            />
          ) : (
            <div className="space-y-4">
              {/* Top Pagination + List <-> Kanban View Switcher inside Frame */}
              <Frame>
                <FramePanel
                  className="!p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  data-testid="shortlist-pagination-top"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <span
                      className="text-xs font-mono text-[#A3A3A3]"
                      data-testid="pagination-count-label"
                    >
                      {countLabelText}
                    </span>

                    {/* View Mode Toggle: List vs. 4-Column Kanban */}
                    <div className="inline-flex items-center p-0.5 rounded-lg border border-white/[0.08] bg-black/30">
                      <button
                        type="button"
                        onClick={() => setViewMode("list")}
                        data-testid="toggle-list-view"
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-all ${
                          viewMode === "list"
                            ? "bg-white text-black font-semibold shadow-xs"
                            : "text-white/55 hover:text-white"
                        }`}
                      >
                        <List className="h-3 w-3" />
                        <span>List</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("kanban")}
                        data-testid="toggle-kanban-view"
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-all ${
                          viewMode === "kanban"
                            ? "bg-white text-black font-semibold shadow-xs"
                            : "text-white/55 hover:text-white"
                        }`}
                      >
                        <LayoutGrid className="h-3 w-3" />
                        <span>Kanban Board</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-mono text-[#A3A3A3] mr-2"
                      data-testid="pagination-page-indicator"
                    >
                      Page {validPage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={validPage <= 1}
                      className="btn-ghost !py-1 !px-2.5 disabled:opacity-60"
                      data-testid="prev-page-btn"
                      aria-label="Previous Page"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" /> Prev
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={validPage >= totalPages}
                      className="btn-ghost !py-1 !px-2.5 disabled:opacity-60"
                      data-testid="next-page-btn"
                      aria-label="Next Page"
                    >
                      Next <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </FramePanel>
              </Frame>

              {/* Either 4-Column Kanban Pipeline OR Evidence Card Stream */}
              {viewMode === "kanban" ? (
                <KanbanPipelineBoard
                  extractions={displayExtractions}
                  roleId={roleId}
                  onSelectCandidate={(id) => setSelectedId(id)}
                  onNavigate={(href) => router.push(href)}
                />
              ) : (
                <div className="space-y-3">
                  {displayExtractions.map((ext) => (
                    <CandidateEvidenceCard
                      key={ext.id}
                      extraction={ext}
                      isSelected={
                        selectedId === ext.id ||
                        (!selectedId && selectedExtraction?.id === ext.id)
                      }
                      onSelect={() => setSelectedId(ext.id)}
                    />
                  ))}
                </div>
              )}

              {/* Bottom Bounded Dynamic Pagination Controls Bar */}
              {totalPages > 1 && (
                <div
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-[#343434] bg-[#111111]"
                  data-testid="shortlist-pagination-bottom"
                >
                  <span className="text-xs font-mono text-[#A3A3A3]">
                    {countLabelText}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-[#A3A3A3] mr-2">
                      Page {validPage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={validPage <= 1}
                      className="px-2.5 py-1 rounded-md border border-[#343434] bg-[#1A1A1A] text-xs font-medium text-[#F2F2F2] hover:border-[#00D604]/40 transition-all disabled:opacity-60 flex items-center gap-1"
                      data-testid="prev-page-btn-bottom"
                      aria-label="Previous Page Bottom"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" /> Prev
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={validPage >= totalPages}
                      className="px-2.5 py-1 rounded-md border border-[#343434] bg-[#1A1A1A] text-xs font-medium text-[#F2F2F2] hover:border-[#00D604]/40 transition-all disabled:opacity-60 flex items-center gap-1"
                      data-testid="next-page-btn-bottom"
                      aria-label="Next Page Bottom"
                    >
                      Next <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Right Candidate Context Sidebar wrapped in Frame */}
        {allExtractions.length > 0 && (
          <aside className="w-full lg:w-[328px] shrink-0 lg:sticky lg:top-6 lg:h-[calc(100vh-140px)] wbl-frame !p-1 overflow-hidden">
            <div className="wbl-frame-panel !p-0 h-full overflow-hidden">
              <CandidateShortlistSidebar
                extraction={selectedExtraction}
                hiringRun={run}
                onAction={handleCandidateAction}
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  </NaiveShell>
);
}
