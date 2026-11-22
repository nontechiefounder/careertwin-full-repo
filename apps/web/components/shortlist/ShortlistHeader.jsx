"use client";

import { useState } from "react";
import { ArrowLeft, Zap, UploadCloud, Loader2, Search, FileEdit, Users, FileText, Database, Activity, Sparkles, MessageSquare, ShieldCheck, Upload } from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";
import { toast } from "sonner";
import AddMaterialModal from "@/components/role/AddMaterialModal";

export default function ShortlistHeader({
  roleTitle,
  company,
  roleId,
  counts = {},
  onUploadSuccess,
  status = "ACTIVE"
}) {
  const [uploading, setUploading] = useState(false);
  const [isAddMaterialOpen, setIsAddMaterialOpen] = useState(false);

  const cohortCandidates = counts.cohort_candidates || 0;
  const evaluationsCompleted = counts.evaluations_completed || 0;
  const pendingEvaluation = Math.max(0, cohortCandidates - evaluationsCompleted);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const toastId = toast.loading(`Ingesting & parsing ${file.name} via pdf-parse...`);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("hiring_run_id", roleId);

      const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");
      const formattedName = baseName.replace(/\b\w/g, (l) => l.toUpperCase());
      formData.append("candidate_name", formattedName);

      const res = await api.post("/employer/candidate-documents/upload", formData, {
        headers: { "Content-Type": undefined },
      });

      if (res.data?.success) {
        toast.success(
          `Parsed & ingested ${file.name} successfully ✓`,
          { id: toastId }
        );
        if (onUploadSuccess) onUploadSuccess(res.data);
      } else {
        toast.error(res.data?.error || "Upload failed", { id: toastId });
      }
    } catch (err) {
      const msg = err.response?.data?.details || err.response?.data?.error || err.message;
      toast.error(`Ingestion error: ${msg}`, { id: toastId });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <header className="border-b border-white/[0.08] bg-[#111111] text-white">
      {/* Top Bar: Identity & Actions */}
      <div className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/employer"
            className="p-2 rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/60 hover:text-white hover:border-[#00D604]/40 transition-colors inline-flex items-center gap-1.5 text-xs shrink-0"
            aria-label="Return to roles dashboard"
            data-testid="return-to-roles-btn"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="font-medium hidden sm:inline">Roles</span>
          </Link>

          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-base sm:text-lg font-semibold text-white/95 tracking-tight">
                {roleTitle || "Candidate Shortlist"}
              </h1>
              <span
                className="px-2.5 py-0.5 rounded-full border border-white/[0.10] bg-white/[0.04] text-white/80 text-[10px] font-mono font-medium"
                data-testid="cohort-candidates-badge"
              >
                {cohortCandidates} Cohort Candidates
              </span>
            </div>
            <p className="text-xs text-white/60 mt-0.5 font-mono" data-testid="shortlist-subtitle">
              {company ? `${company} · ` : ""}{evaluationsCompleted} evaluations completed · {pendingEvaluation} pending evaluation
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/employer/chat?roleId=${roleId}`}
            className="px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-xs font-mono text-white/80 hover:text-white hover:bg-white/[0.06] transition-colors flex items-center gap-1.5"
          >
            <MessageSquare className="h-3.5 w-3.5 text-[#00D604]" />
            Ask About Role
          </Link>

          <button
            type="button"
            onClick={() => setIsAddMaterialOpen(true)}
            className="px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-xs font-mono text-white/80 hover:text-white hover:bg-white/[0.06] transition-colors flex items-center gap-1.5"
          >
            <Upload className="h-3.5 w-3.5 text-blue-400" />
            Add Material
          </button>

          <Link
            href={`/employer/sourcing/${roleId}`}
            className="px-3.5 py-1.5 rounded-lg border border-[#00D604]/40 bg-[#00D604] text-xs font-semibold text-black hover:bg-[#00D604]/90 transition-all flex items-center gap-1.5 shadow-sm"
            data-testid="header-source-candidates-btn"
          >
            <Zap className="h-3.5 w-3.5" />
            Find Candidates
          </Link>

          <label
            className="px-3 py-1.5 rounded-lg border border-[#00D604]/30 bg-[#00D604]/10 text-xs font-medium text-[#00D604] hover:bg-[#00D604]/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            data-testid="upload-resume-btn"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />}
            Upload Resume
            <input
              type="file"
              accept=".pdf,.docx,.csv"
              disabled={uploading}
              className="hidden"
              data-testid="shortlist-file-upload-input"
              onChange={handleFileUpload}
            />
          </label>
        </div>
      </div>

      {/* Bottom Nav: 4 Role Tabs */}
        <nav className="px-6 flex items-center gap-1 border-t border-white/[0.04] bg-[#0A0A0A]" aria-label="Role Workspace Tabs">
          <Link
            href={`/employer/brief/${roleId}`}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 border-transparent text-white/50 hover:text-white/80 hover:bg-white/[0.01] transition-all"
          >
            <FileText className="h-3.5 w-3.5 text-white/40" />
            <span>Overview</span>
          </Link>

          <Link
            href={`/employer/shortlist/${roleId}`}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 border-[#00D604] text-white bg-white/[0.02] transition-all"
          >
            <Users className="h-3.5 w-3.5 text-[#00D604]" />
            <span>Candidates</span>
            {cohortCandidates > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/[0.08] text-white/80">
                {cohortCandidates}
              </span>
            )}
          </Link>

          <Link
            href={`/employer/brief/${roleId}?tab=evidence`}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 border-transparent text-white/50 hover:text-white/80 hover:bg-white/[0.01] transition-all"
          >
            <Database className="h-3.5 w-3.5 text-white/40" />
            <span>Evidence</span>
          </Link>

          <Link
            href={`/employer/brief/${roleId}?tab=activity`}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 border-transparent text-white/50 hover:text-white/80 hover:bg-white/[0.01] transition-all"
          >
            <Activity className="h-3.5 w-3.5 text-white/40" />
            <span>Activity</span>
          </Link>
        </nav>

        {/* Add Material Modal */}
        <AddMaterialModal
          isOpen={isAddMaterialOpen}
          onClose={() => setIsAddMaterialOpen(false)}
          hiringRunId={roleId}
          roleTitle={roleTitle}
          onUploadSuccess={onUploadSuccess}
        />
    </header>
  );
}
