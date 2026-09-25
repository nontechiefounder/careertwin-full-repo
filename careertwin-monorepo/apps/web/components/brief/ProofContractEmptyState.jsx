"use client";

import { FileX, Search } from "lucide-react";
import Link from "next/link";

export default function ProofContractEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border border-[#343434] bg-[#111111] rounded-2xl my-8 max-w-lg mx-auto">
      <div className="w-12 h-12 rounded-full border border-[#343434] bg-[#1A1A1A] flex items-center justify-center mb-4 text-[#4A4A4A]">
        <FileX className="h-6 w-6" />
      </div>
      <h3 className="text-sm font-semibold text-[#F2F2F2] mb-1">Proof Contract Not Found</h3>
      <p className="text-xs text-[#4A4A4A] max-w-xs mb-6">
        No brief or proof contract data is available for this hiring run.
      </p>
      <Link
        href="/employer/intake"
        className="px-4 py-2 rounded-lg border border-[#10D97A]/40 bg-[#10D97A] text-xs font-semibold text-[#0E0E0E] hover:bg-[#10D97A]/90 transition-all flex items-center gap-2"
      >
        <Search className="h-3.5 w-3.5" />
        Create New Role Intake
      </Link>
    </div>
  );
}
