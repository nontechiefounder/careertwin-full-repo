"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { toast } from "sonner";
import { Loader2, AlertCircle, FileEdit, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import ShortlistHeader from "@/components/shortlist/ShortlistHeader";
import ShortlistFilters from "@/components/shortlist/ShortlistFilters";
import CandidateEvidenceCard from "@/components/shortlist/CandidateEvidenceCard";
import ShortlistEmptyState from "@/components/shortlist/ShortlistEmptyState";
import ShortlistErrorState from "@/components/shortlist/ShortlistErrorState";
import ProductGovernanceNotice from "@/components/packet/ProductGovernanceNotice";

export default function ShortlistPage({ params }) {
  const { roleId } = use(params);
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

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
      const msg = err.response?.data?.error || err.response?.data?.detail || "Failed to load candidate shortlist";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [roleId]);

  useEffect(() => {
    fetchShortlist();
  }, [fetchShortlist]);

  // Reset pagination on filter or search changes
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
      <div className="min-h-screen bg-[#0E0E0E] flex flex-col items-center justify-center text-[#F2F2F2]">
        <Loader2 className="h-6 w-6 text-[#10D97A] animate-spin mb-2" />
        <p className="text-xs font-mono text-[#A3A3A3]">Loading Candidate Shortlist & Trust Packets...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0E0E0E] text-[#F2F2F2] flex flex-col">
        <ShortlistHeader roleTitle="Error" roleId={roleId} />
        <main className="flex-1 p-6">
          <ShortlistErrorState error={error} onRetry={fetchShortlist} />
        </main>
      </div>
    );
  }

  const run = data?.hiring_run;
  const allExtractions = data?.extractions || [];
  const counts = data?.counts || {
    cohort_candidates: allExtractions.length,
    documents_received: 0,
    evaluations_completed: allExtractions.filter(e => Boolean(e.decision_packet)).length,
  };

  // Filter extractions based on readiness state and search query
  const filteredExtractions = allExtractions.filter((ext) => {
    const profile = ext.candidate_profiles || {};
    const packet = ext.decision_packet || {};
    const metrics = packet.evaluation_metrics || {};

    const readiness = (metrics.decision_readiness || ext.readiness_state || "READINESS UNAVAILABLE").toUpperCase().trim();

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

  // Truthful pagination counter text
  let countLabelText = `Showing ${startIndex + 1}–${endIndex} of ${totalFiltered} cohort candidates`;
  if (readinessFilter !== "ALL") {
    countLabelText = `Showing ${startIndex + 1}–${endIndex} of ${totalFiltered} candidates matching ${readinessFilter}`;
  } else if (searchQuery && searchQuery.trim() !== "") {
    countLabelText = `Showing ${startIndex + 1}–${endIndex} of ${totalFiltered} matching candidates`;
  }

  return (
    <div className="min-h-screen bg-[#0E0E0E] text-[#F2F2F2] flex flex-col" data-testid="shortlist-page">
      <ShortlistHeader
        roleTitle={run?.role_title}
        company={run?.company}
        roleId={roleId}
        counts={counts}
      />

      <ShortlistFilters
        readinessFilter={readinessFilter}
        onReadinessChange={handleReadinessChange}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        totalResults={totalFiltered}
        onClearFilters={handleClearFilters}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-6 space-y-6">
        {/* Zero-Evaluations Truthful Banner (Part 2) */}
        {allExtractions.length > 0 && counts.evaluations_completed === 0 && (
          <div
            className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5 text-amber-200 flex items-start gap-3"
            data-testid="no-evaluations-banner"
          >
            <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-amber-300">0 Evaluations Completed</h3>
              <p className="text-xs text-amber-200/80 leading-relaxed font-sans">
                {counts.cohort_candidates} candidates are associated with this role cohort, but 0 candidate evaluations are available yet for this hiring run.
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
            {/* Top Bounded Dynamic Pagination Controls Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-[#343434] bg-[#111111]" data-testid="shortlist-pagination-top">
              <span className="text-xs font-mono text-[#A3A3A3]" data-testid="pagination-count-label">
                {countLabelText}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-[#A3A3A3] mr-2" data-testid="pagination-page-indicator">
                  Page {validPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={validPage <= 1}
                  className="px-2.5 py-1 rounded-md border border-[#343434] bg-[#1A1A1A] text-xs font-medium text-[#F2F2F2] hover:border-[#10D97A]/40 transition-all disabled:opacity-40 flex items-center gap-1"
                  data-testid="prev-page-btn"
                  aria-label="Previous Page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Prev
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={validPage >= totalPages}
                  className="px-2.5 py-1 rounded-md border border-[#343434] bg-[#1A1A1A] text-xs font-medium text-[#F2F2F2] hover:border-[#10D97A]/40 transition-all disabled:opacity-40 flex items-center gap-1"
                  data-testid="next-page-btn"
                  aria-label="Next Page"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Candidate Card Stream */}
            <div className="space-y-4">
              {displayExtractions.map((ext) => (
                <CandidateEvidenceCard
                  key={ext.id}
                  extraction={ext}
                  isSelected={selectedId === ext.id}
                  onSelect={() => setSelectedId(selectedId === ext.id ? null : ext.id)}
                />
              ))}
            </div>

            {/* Bottom Bounded Dynamic Pagination Controls Bar */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-[#343434] bg-[#111111]" data-testid="shortlist-pagination-bottom">
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
                    className="px-2.5 py-1 rounded-md border border-[#343434] bg-[#1A1A1A] text-xs font-medium text-[#F2F2F2] hover:border-[#10D97A]/40 transition-all disabled:opacity-40 flex items-center gap-1"
                    data-testid="prev-page-btn-bottom"
                    aria-label="Previous Page Bottom"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={validPage >= totalPages}
                    className="px-2.5 py-1 rounded-md border border-[#343434] bg-[#1A1A1A] text-xs font-medium text-[#F2F2F2] hover:border-[#10D97A]/40 transition-all disabled:opacity-40 flex items-center gap-1"
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
    </div>
  );
}
