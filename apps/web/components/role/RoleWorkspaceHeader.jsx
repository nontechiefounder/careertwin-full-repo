"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, FileText, Users, Database, Activity, Sparkles, Plus,
  ShieldCheck, AlertCircle, MessageSquare, Search, Upload, FileEdit
} from "lucide-react";
import AddMaterialModal from "./AddMaterialModal";

export default function RoleWorkspaceHeader({
  id,
  roleTitle = "Role Brief",
  company = "",
  status,
  isComplete = true,
  missingFields = [],
  rubricVersion = "1.0.0",
  isRubricApproved = false,
  approvedRubricVersion = null,
  onApproveRubric,
  approvingRubric = false,
  candidatesCount = 0,
  unreviewedCount = 0,
  activeTab = "overview",
  onTabChange,
  existingSources = [],
  onUploadSuccess
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isAddMaterialOpen, setIsAddMaterialOpen] = useState(false);

  const ALLOWED_STATUSES = new Set(["ACTIVE", "DRAFT", "PAUSED", "CLOSED", "ARCHIVED", "COMPLETED"]);
  const normalizedStatus = status && String(status).trim() ? String(status).toUpperCase().trim() : "";
  const rawStatus = ALLOWED_STATUSES.has(normalizedStatus) ? normalizedStatus : "STATUS UNAVAILABLE";
  const isRubricStale = isRubricApproved && approvedRubricVersion && approvedRubricVersion !== rubricVersion;

  // Determine current active tab from pathname or query param if not explicitly passed
  let currentTab = activeTab;
  if (pathname.includes("/shortlist") || pathname.includes("/sourcing")) {
    currentTab = "candidates";
  } else if (searchParams.get("tab") === "evidence") {
    currentTab = "evidence";
  } else if (searchParams.get("tab") === "activity") {
    currentTab = "activity";
  }

  const handleTabClick = (tabId) => {
    if (onTabChange) {
      onTabChange(tabId);
      return;
    }

    if (tabId === "overview") {
      router.push(`/employer/brief/${id}`);
    } else if (tabId === "candidates") {
      router.push(`/employer/shortlist/${id}`);
    } else if (tabId === "evidence") {
      router.push(`/employer/brief/${id}?tab=evidence`);
    } else if (tabId === "activity") {
      router.push(`/employer/brief/${id}?tab=activity`);
    }
  };

  return (
    <header className="border-b border-white/[0.08] bg-[#111111] text-white">
      {/* Top Bar: Identity & Actions */}
      <div className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Return + Role Title + Status Badges */}
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
                {roleTitle}
              </h1>

              {/* Status Badge */}
              <span
                className={`px-2 py-0.5 rounded-full border text-[9px] font-mono font-medium uppercase tracking-wider ${rawStatus === "DRAFT"
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                    : rawStatus === "ACTIVE"
                      ? "border-[#00D604]/30 bg-[#00D604]/10 text-[#00D604]"
                      : "border-white/20 bg-white/5 text-white/60"
                  }`}
                data-testid="brief-status"
              >
                {rawStatus}
              </span>

              {/* Rubric Version Badge */}
              <span
                className={`px-2 py-0.5 rounded-full border text-[9px] font-mono font-medium flex items-center gap-1 ${isRubricApproved && !isRubricStale
                    ? "border-[#00D604]/30 bg-[#00D604]/10 text-[#00D604]"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                  }`}
                data-testid="role-rubric-version-badge"
              >
                <ShieldCheck className="h-3 w-3" />
                v{rubricVersion} {isRubricApproved && !isRubricStale ? "Approved" : "Unapproved"}
              </span>

              {/* Contract Completeness */}
              {!isComplete && (
                <span className="px-2 py-0.5 rounded-full border border-rose-500/40 bg-rose-500/10 text-rose-400 text-[9px] font-mono font-medium">
                  Inputs Incomplete
                </span>
              )}
            </div>

            <p className="text-xs text-white/40 mt-0.5 font-sans">
              {company ? `${company} · ` : ""}Role Workspace & Verification Contract
            </p>
          </div>
        </div>

        {/* Right: State-Appropriate Primary Action + Utilities */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Ask About Role (Contextual Copilot) */}
          <Link
            href={`/employer/chat?roleId=${id}`}
            className="px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-xs font-mono text-white/80 hover:text-white hover:bg-white/[0.06] transition-colors flex items-center gap-1.5"
            data-testid="ask-about-role-btn"
          >
            <MessageSquare className="h-3.5 w-3.5 text-[#00D604]" />
            Ask About Role
          </Link>

          {/* Add Material Launcher */}
          <button
            type="button"
            onClick={() => setIsAddMaterialOpen(true)}
            className="px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-xs font-mono text-white/80 hover:text-white hover:bg-white/[0.06] transition-colors flex items-center gap-1.5"
            data-testid="add-material-btn"
          >
            <Upload className="h-3.5 w-3.5 text-blue-400" />
            Add Material
          </button>

          {/* Sourcing / Find Candidates */}
          <Link
            href={`/employer/sourcing/${id}`}
            className="px-3 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-xs font-mono text-white/80 hover:text-white hover:bg-white/[0.06] transition-colors flex items-center gap-1.5"
            data-testid="find-candidates-quick-btn"
          >
            <Search className="h-3.5 w-3.5 text-[#00D604]" />
            Find Candidates
          </Link>

          {/* Primary Action Button Based on State */}
          {!isComplete ? (
            <Link
              href={`/employer/intake?id=${id}`}
              className="px-3.5 py-1.5 rounded-lg border border-amber-500/50 bg-amber-500 text-xs font-semibold text-black hover:bg-amber-400 transition-all flex items-center gap-1.5 shadow-sm"
              data-testid="complete-intake-primary-btn"
            >
              <FileEdit className="h-3.5 w-3.5" />
              Complete Role Intake
            </Link>
          ) : !isRubricApproved || isRubricStale ? (
            <button
              type="button"
              onClick={onApproveRubric}
              disabled={approvingRubric}
              className="px-3.5 py-1.5 rounded-lg border border-[#00D604]/50 bg-[#00D604] text-xs font-semibold text-black hover:bg-[#00D604]/90 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              data-testid="approve-rubric-primary-btn"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {approvingRubric ? "Approving..." : `Approve Rubric v${rubricVersion}`}
            </button>
          ) : unreviewedCount > 0 ? (
            <Link
              href={`/employer/shortlist/${id}`}
              className="px-3.5 py-1.5 rounded-lg border border-[#00D604]/50 bg-[#00D604] text-xs font-semibold text-black hover:bg-[#00D604]/90 transition-all flex items-center gap-1.5 shadow-sm"
              data-testid="review-next-candidate-btn"
            >
              <Users className="h-3.5 w-3.5" />
              Review Next Candidate ({unreviewedCount})
            </Link>
          ) : (
            <Link
              href={`/employer/sourcing/${id}`}
              className="px-3.5 py-1.5 rounded-lg border border-[#00D604]/50 bg-[#00D604] text-xs font-semibold text-black hover:bg-[#00D604]/90 transition-all flex items-center gap-1.5 shadow-sm"
              data-testid="source-candidates-primary-btn"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Find Candidates
            </Link>
          )}
        </div>
      </div>

      {/* Bottom Nav: The 4 Canonical Role Tabs */}
        <nav className="px-4 sm:px-6 flex items-center gap-1 border-t border-white/[0.04] bg-[#0A0A0A] overflow-x-auto" aria-label="Role Workspace Tabs">
          {[
            { id: "overview", label: "Overview", icon: FileText },
            {
              id: "candidates",
              label: "Candidates",
              icon: Users,
              badge: candidatesCount > 0 ? candidatesCount : null
            },
            { id: "evidence", label: "Evidence", icon: Database },
            { id: "activity", label: "Activity", icon: Activity }
          ].map((tab) => {
            const isActive = currentTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabClick(tab.id)}
                className={`shrink-0 whitespace-nowrap flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${isActive
                    ? "border-[#00D604] text-white bg-white/[0.02]"
                    : "border-transparent text-white/50 hover:text-white/80 hover:bg-white/[0.01]"
                  }`}
                data-testid={`role-tab-${tab.id}`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? "text-[#00D604]" : "text-white/40"}`} />
                <span>{tab.label}</span>
                {tab.badge != null && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-white/[0.08] text-white/70">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Add Material Modal */}
        <AddMaterialModal
          isOpen={isAddMaterialOpen}
          onClose={() => setIsAddMaterialOpen(false)}
          hiringRunId={id}
          roleTitle={roleTitle}
          existingSources={existingSources}
          onUploadSuccess={onUploadSuccess}
        />
    </header>
  );
}

