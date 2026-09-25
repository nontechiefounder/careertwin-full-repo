"use client";

import { Users, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function ShortlistEmptyState({ roleId, isFiltered = false, onClearFilters }) {
  if (isFiltered) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border border-[#343434] bg-[#111111] rounded-2xl my-8 max-w-lg mx-auto">
        <div className="w-12 h-12 rounded-full border border-[#343434] bg-[#1A1A1A] flex items-center justify-center mb-4 text-[#4A4A4A]">
          <Users className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-semibold text-[#F2F2F2] mb-1">No Matching Candidates</h3>
        <p className="text-xs text-[#4A4A4A] max-w-xs mb-6">
          No candidates match the active search and readiness filter criteria.
        </p>
        <button
          type="button"
          onClick={onClearFilters}
          className="px-4 py-2 rounded-lg border border-[#343434] bg-[#1A1A1A] text-xs font-medium text-[#F2F2F2] hover:border-[#10D97A]/40 hover:text-[#10D97A] transition-all"
          data-testid="clear-filters-empty-btn"
        >
          Clear Active Filters
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center p-12 text-center border border-[#343434] bg-[#111111] rounded-2xl my-8 max-w-2xl mx-auto"
      data-testid="zero-evaluation-cohort-state"
    >
      <div className="w-12 h-12 rounded-full border border-[#343434] bg-[#1A1A1A] flex items-center justify-center mb-4 text-[#4A4A4A]">
        <Users className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold text-[#F2F2F2] mb-1">No Candidates Received Yet</h3>
      <p className="text-xs text-[#A3A3A3] max-w-sm mb-6 leading-relaxed">
        Candidate documents for this role have not been received. Candidate ingestion is
        completed by your pilot administrator through an approved secure transfer process.
      </p>

      {/* Operator Handoff Contract */}
      <div
        className="w-full text-left border border-amber-500/30 bg-amber-500/[0.06] rounded-xl p-5 mb-6 space-y-3"
        data-testid="handoff-guidance-panel"
      >
        <p className="text-[11px] font-mono text-amber-400 uppercase tracking-widest mb-2">
          Approved Candidate Intake Process
        </p>
        <div className="space-y-2 text-xs text-[#A3A3A3]">
          <p className="font-medium text-[#F2F2F2]/80">What you provide to your pilot administrator:</p>
          <ul className="list-disc list-inside space-y-1 text-[#A3A3A3]">
            <li>Role reference: this role brief URL or hiring run ID</li>
            <li>Candidate document set (PDF, DOCX, or CSV résumés)</li>
            <li>Any additional sourcing notes or priority instructions</li>
          </ul>
          <p className="font-medium text-[#F2F2F2]/80 pt-2">Transfer method:</p>
          <p className="text-amber-300/80 font-mono text-[10px]">
            Contact your pilot administrator through the secure channel defined in your
            onboarding agreement. Do not send documents through unsecured email or
            public file-sharing services.
          </p>
        </div>
        <p className="text-[10px] font-mono text-[#4A4A4A] pt-1">
          Candidate files are not submitted through this form. Evaluation begins only after
          an authorized operational handoff is confirmed.
        </p>
      </div>

      {roleId && (
        <Link
          href={`/employer/brief/${roleId}`}
          className="px-4 py-2 rounded-lg border border-[#343434] bg-[#1A1A1A] text-xs font-medium text-[#F2F2F2]/80 hover:text-[#F2F2F2] hover:border-[#10D97A]/40 transition-all flex items-center gap-2"
          data-testid="go-brief-btn"
        >
          Return to Role Brief <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}
