"use client";

import { useState } from "react";
import {
  Sparkles,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Clock,
  Lock,
  Loader2,
  Building2,
  Layers,
} from "lucide-react";

const SUGGESTED_QUERIES = [
  "What core responsibilities and technical deliverables are documented?",
  "What required tools, languages, or compliance frameworks are specified?",
  "What past project experience or domain knowledge is explicitly mentioned?",
  "What constraints or non-negotiable requirements are stated in the brief?",
  "What evaluation criteria or quality standards are documented?",
];

const STATUS_CONFIG = {
  GROUNDED: {
    label: "Source-Grounded",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: ShieldCheck,
  },
  AMBIGUOUS: {
    label: "Ambiguous Evidence",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    icon: AlertTriangle,
  },
  DISAGREEMENT: {
    label: "Source Disagreement",
    badgeClass: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    icon: AlertTriangle,
  },
  INSUFFICIENT_EVIDENCE: {
    label: "Insufficient Evidence",
    badgeClass: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    icon: AlertTriangle,
  },
  RETRIEVAL_ONLY_COMPLETE: {
    label: "Passages Retrieved",
    badgeClass: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
    icon: FileText,
  },
  NO_RELEVANT_PASSAGES: {
    label: "No Passages Found",
    badgeClass: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    icon: AlertTriangle,
  },
  UNVERIFIED_STATUS: {
    label: "Unverified Status",
    badgeClass: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    icon: AlertTriangle,
  },
};

export default function ResearchQAPanel({
  hiringRunId,
  roleId,
  className = "",
}) {
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState("retrieval_augmented"); // 'retrieval_augmented' | 'retrieval_only'
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [errorState, setErrorState] = useState(null);
  const [expandedCitation, setExpandedCitation] = useState(null);

  const handleSubmit = async (queryText = question) => {
    const q = (queryText || "").trim();
    if (!q || loading) return;

    setLoading(true);
    setErrorState(null);
    setResult(null);

    try {
      const res = await fetch("/api/employer/research-qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          hiring_run_id: hiringRunId,
          role_id: roleId,
          mode,
          limit: 5,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errCode = data.code || data.error;
        if (res.status === 401) {
          setErrorState({
            type: "UNAUTHORIZED",
            title: "Authentication Required",
            message: "Your session has expired or is invalid. Please sign in.",
          });
        } else if (res.status === 403 && (errCode === "RESEARCH_QA_DISABLED" || data.error?.includes?.("disabled"))) {
          setErrorState({
            type: "DISABLED",
            title: "Feature Disabled",
            message: "Research QA is currently disabled by organization policy.",
          });
        } else if (errCode === "UNMAPPED_WORKSPACE" || errCode === "UNMAPPED_RUN") {
          setErrorState({
            type: "UNMAPPED",
            title: "Workspace Not Mapped",
            message: data.error || data.message || "No context engine workspace is mapped for this hiring run.",
          });
        } else if (errCode === "MAPPING_REVOKED") {
          setErrorState({
            type: "REVOKED",
            title: "Mapping Inactive or Revoked",
            message: data.error || data.message || "Context engine access for this run has been revoked.",
          });
        } else if (errCode === "ENGINE_CONFIG_MISSING" || errCode === "ENGINE_CONFIG_INVALID") {
          setErrorState({
            type: "CONFIG_ERROR",
            title: "Configuration Required",
            message: data.error || data.message || "Context engine service is not configured.",
          });
        } else if (errCode === "BLOCKED_PENDING_KEY_ROTATION") {
          setErrorState({
            type: "BLOCKED",
            title: "Live Provider Blocked",
            message: "Live generation is blocked pending provider key configuration. No mock fallback is used in production.",
          });
        } else if (res.status === 403 || res.status === 404) {
          setErrorState({
            type: "FORBIDDEN",
            title: "Access Denied",
            message: data.error || data.message || "You do not have authorization to query this workspace.",
          });
        } else if (res.status === 504) {
          setErrorState({
            type: "TIMEOUT",
            title: "Gateway Timeout",
            message: "The research query exceeded deadline. Try asking a more specific question.",
          });
        } else if (res.status === 503) {
          setErrorState({
            type: "UNAVAILABLE",
            title: "Engine Service Unavailable",
            message: data.error || data.message || "The Context Engine service is temporarily offline or unreachable.",
          });
        } else {
          setErrorState({
            type: "ERROR",
            title: "Query Execution Failed",
            message: data.error || data.message || "An unexpected error occurred during execution.",
          });
        }
        return;
      }

      setResult(data);
    } catch (err) {
      setErrorState({
        type: "NETWORK_ERROR",
        title: "Network Error",
        message: err.message || "Failed to reach the research endpoint.",
      });
    } finally {
      setLoading(false);
    }
  };

  const statusInfo =
    result && STATUS_CONFIG[result.status]
      ? STATUS_CONFIG[result.status]
      : STATUS_CONFIG.UNVERIFIED_STATUS;
  const StatusIcon = statusInfo.icon;

  const resolvedRole = result?.role_id || roleId;
  const corpusScopeLabel = result?.corpus_scope
    ? result.corpus_scope === "PUBLIC_RESEARCH"
      ? "Public Reference Corpus"
      : "Private Tenant Corpus"
    : "Context Scope: Resolving...";

  return (
    <div
      role="region"
      aria-label="Research Context Panel"
      data-testid="research-qa-panel"
      className={`rounded-2xl border border-white/[0.08] bg-[#111111] p-6 space-y-6 ${className}`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
        <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-[#00D604]/10 border border-[#00D604]/20 flex items-center justify-center text-[#00D604]">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#F2F2F2]">
                Role & Document Research QA
              </h3>
              <div className="flex items-center gap-2 text-[11px] font-mono text-[#A3A3A3] mt-0.5">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-[#00D604]" />
                  {result?.company_name || "Authorized Workspace"}
                </span>
                <span>•</span>
                <span data-testid="corpus-scope-label">{corpusScopeLabel}</span>
                {resolvedRole && (
                  <>
                    <span>•</span>
                    <span data-testid="resolved-role-label">Role: {resolvedRole}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Feature Isolation Notice Tag */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.08] text-[10px] font-mono text-[#A3A3A3]">
            <Lock className="h-3 w-3 text-amber-400" />
            <span>Non-Scoring Auxiliary Context</span>
          </div>
        </div>

        {/* Scope-Aware Disclaimer */}
        <div
          data-testid="public-research-disclaimer"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-3 text-amber-200"
        >
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="text-[11px] font-mono uppercase tracking-wider font-semibold text-amber-300">
              {result?.corpus_scope === "TENANT_PRIVATE"
                ? "CONFIDENTIAL TENANT CORPUS / NOT EMPLOYER-APPROVED"
                : "PUBLIC RESEARCH / NOT EMPLOYER-APPROVED"}
            </p>
            <p className="text-xs text-amber-200/90 leading-relaxed font-sans">
              {result?.corpus_scope === "TENANT_PRIVATE"
                ? "Answers and passages are retrieved strictly from indexed private tenant documents for recruiter background context. They do not automatically approve requirements, establish candidate competence, or alter hiring rubric evaluations."
                : "Research answers are retrieved strictly from indexed reference documents for recruiter background context. They do not automatically approve requirements, establish candidate competence, or alter hiring rubric evaluations."}
            </p>
          </div>
        </div>

        {/* Search Input Box & Mode Selector */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-white/40 text-[11px] font-mono">Query Mode:</span>
            <div className="flex items-center gap-1 bg-[#161616] border border-white/[0.08] p-0.5 rounded-lg text-[11px]">
              <button
                type="button"
                onClick={() => setMode("retrieval_augmented")}
                className={`px-2.5 py-1 rounded-md transition-all font-medium ${mode === "retrieval_augmented"
                      ? "bg-[#00D604]/20 text-[#00D604] border border-[#00D604]/40"
                      : "text-white/50 hover:text-white/80"
              }`}
              >
                Grounded Q&A
              </button>
              <button
                type="button"
                onClick={() => setMode("retrieval_only")}
                className={`px-2.5 py-1 rounded-md transition-all font-medium ${mode === "retrieval_only"
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                    : "text-white/50 hover:text-white/80"
                  }`}
              >
                Reference Passages Only
              </button>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            className="relative flex items-center"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#666666]" />
              <input
                type="text"
                data-testid="research-qa-input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={
                  mode === "retrieval_only"
                    ? "Search indexed reference passages for role requirements, tech stack, or criteria..."
                    : "Ask a question about documented role requirements, deliverables, or background context..."
                }
                disabled={loading}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/[0.1] bg-[#161616] text-xs text-[#F2F2F2] placeholder-[#666666] focus:outline-none focus:border-[#00D604]/50 focus:ring-1 focus:ring-[#00D604]/30 transition-all font-sans"
              />
            </div>
            <button
              type="submit"
              data-testid="research-qa-submit"
              disabled={loading || !question.trim()}
              className="ml-2.5 px-4 py-2.5 rounded-xl bg-[#E1E1E5] hover:bg-white text-[#030303] font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-xs"
            >
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Searching...</span>
                </>
              ) : (
                <span>{mode === "retrieval_only" ? "Find Passages" : "Ask Context"}</span>
              )}
            </button>
          </form>

          {/* Suggested Queries */}
          {!result && !loading && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[11px] font-mono text-[#666666]">
                Suggested Reference Inquiries:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_QUERIES.map((sq, idx) => (
                  <button
                    key={idx}
                    type="button"
                    data-testid={`suggested-query-${idx}`}
                    onClick={() => {
                      setQuestion(sq);
                      handleSubmit(sq);
                    }}
                    className="text-left text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] text-[#A3A3A3] hover:text-[#F2F2F2] transition-colors"
                  >
                    {sq}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Loading Skeleton */}
        {loading && (
          <div
            data-testid="research-qa-loading"
            className="rounded-xl border border-white/[0.06] bg-[#161616]/50 p-6 flex flex-col items-center justify-center space-y-3"
          >
            <Loader2 className="h-6 w-6 text-[#00D604] animate-spin" />
            <p className="text-xs text-[#F2F2F2] font-medium">
              Retrieving source passages & verifying grounding...
            </p>
            <p className="text-[11px] font-mono text-[#A3A3A3]">
              Executing lexical ranking and passage citation reconciliation
            </p>
          </div>
        )}

        {/* Error Message */}
        {errorState && (
          <div
            data-testid="research-qa-error"
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 space-y-1 text-rose-200"
          >
            <div className="flex items-center gap-2 text-rose-400 font-semibold text-xs">
              <AlertTriangle className="h-4 w-4" />
              <span>{errorState.title}</span>
            </div>
            <p className="text-xs text-rose-200/90 leading-relaxed">
              {errorState.message}
            </p>
          </div>
        )}

        {/* Results Display */}
        {result && (
          <div data-testid="research-qa-result" className="space-y-5">
            {/* Status Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span
                  data-testid="research-qa-status-badge"
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium ${statusInfo.badgeClass}`}
                >
                  <StatusIcon className="h-3.5 w-3.5" />
                  <span>{statusInfo.label}</span>
                </span>
                {result.has_validation_errors && (
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded">
                    Validation Warnings
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 text-[11px] font-mono text-[#A3A3A3]">
                {result.latency_ms && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>{result.latency_ms} ms</span>
                  </span>
                )}
                {result.execution_provenance && (
                  <span className="border-l border-white/[0.1] pl-3 text-[10px]">
                    {result.execution_provenance}
                  </span>
                )}
              </div>
            </div>

            {/* Generated Answer Text (for retrieval_augmented) */}
            {result.answer && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-mono uppercase tracking-wider text-[#A3A3A3]">
                  Synthesized Answer
                </h4>
                <div
                  data-testid="research-qa-answer"
                  className="text-xs text-[#F2F2F2] leading-relaxed p-4 rounded-xl bg-[#161616] border border-white/[0.06] whitespace-pre-line font-sans"
                >
                  {result.answer}
                </div>
              </div>
            )}

            {/* Retrieved Passages (for retrieval_only mode) */}
            {result.mode === "retrieval_only" && Array.isArray(result.passages) && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-[#F2F2F2] flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Retrieved Passages ({result.passages.length})</span>
                  </h4>
                  <span className="text-[10px] font-mono text-[#A3A3A3]">
                    Ranked lexical passage matches
                  </span>
                </div>
                <div className="space-y-2.5">
                  {result.passages.map((p, idx) => (
                    <div
                      key={p.span_id || idx}
                      className="p-3.5 rounded-xl bg-[#161616] border border-white/[0.06] space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono text-[#A3A3A3]">
                        <span className="text-[#00D604] font-semibold">{p.span_id}</span>
                        <span>{p.filename}</span>
                        {p.score !== null && <span>Score: {p.score.toFixed(3)}</span>}
                      </div>
                      <p className="text-white/80 leading-relaxed font-sans">{p.text}</p>
                      {p.source_url && (
                        <a
                          href={p.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-[#00D604] hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>Source Document</span>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Citations Inspector (for retrieval_augmented) */}
            {result.mode !== "retrieval_only" && result.citations && result.citations.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-[#F2F2F2] flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5 text-[#00D604]" />
                    <span>Source-Linked Citations ({result.citations.length})</span>
                  </h4>
                  <span className="text-[10px] font-mono text-[#A3A3A3]">
                    Exact quote substrings matched to indexed reference documents
                  </span>
                </div>

                <div className="space-y-2">
                  {result.citations.map((c, idx) => {
                    const isExpanded = expandedCitation === idx;
                    return (
                      <div
                        key={c.span_id || idx}
                        data-testid={`citation-item-${idx}`}
                        className="rounded-xl border border-white/[0.06] bg-[#161616] overflow-hidden transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedCitation(isExpanded ? null : idx)
                          }
                          className="w-full p-3 flex items-center justify-between gap-3 text-left hover:bg-white/[0.02] transition-colors"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-[#00D604] shrink-0">
                                {c.span_id}
                              </span>
                              <span className="text-xs text-[#A3A3A3] truncate font-sans italic">
                                &ldquo;{c.quote}&rdquo;
                              </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {c.source_url && (
                              <a
                                href={c.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-[11px] font-mono text-[#00D604] hover:underline flex items-center gap-1"
                              >
                                <span>View Source</span>
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-[#A3A3A3]" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-[#A3A3A3]" />
                            )}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="p-3.5 border-t border-white/[0.06] bg-[#121212] space-y-2 text-xs">
                            <div className="space-y-1">
                              <span className="text-[10px] font-mono text-[#666666] uppercase">
                                Exact Passage Quote:
                              </span>
                                <blockquote className="border-l-2 border-[#00D604]/40 pl-3 py-0.5 text-xs text-[#F2F2F2] italic font-serif">
                                  &ldquo;{c.quote}&rdquo;
                                </blockquote>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[11px] font-mono text-[#A3A3A3]">
                              {c.filename && <span>File: {c.filename}</span>}
                              {c.locator && <span>Locator: {c.locator}</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      );
}
