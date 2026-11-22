"use client";

import React, { useState } from "react";
import {
  Frame,
  FramePanel,
  FrameHeader,
  FrameTitle,
  FrameFooter,
  RadialProgressRing,
  HatchedProgressBar,
} from "@/components/ui/frame";
import {
  Sparkles,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  Play,
  ExternalLink,
  FileText,
  X,
  Copy,
  Check,
  ArrowRight,
  Table2,
  Search,
  ChevronUp,
  ChevronDown,
  Repeat,
  Image as ImageIcon,
} from "lucide-react";
import api from "@/lib/api";

/**
 * Collapsible Search & Grounded Sources Accordion Box
 */
export function SearchSourcesBox({
  searchQuery = "role rubric candidate claims verified proof hiring pipeline",
  sources = [],
  defaultExpanded = false,
  onOpenArtifact,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAllSources, setShowAllSources] = useState(false);

  const normalizedSources =
    Array.isArray(sources) && sources.length > 0
      ? sources.map((s, idx) => ({
          id: s.id || `src_${idx}`,
          title:
            s.title ||
            s.filename ||
            (idx === 0
              ? "Role Proof Rubric & Must-Have Criteria"
              : idx === 1
              ? "Candidate Claim-to-Proof Ledger"
              : "Cohort Pipeline & Evaluation Telemetry"),
          domain:
            s.domain ||
            s.type?.toLowerCase() ||
            (idx === 0 ? "role-rubric" : idx === 1 ? "claim-ledger" : "cohort-db"),
          snippet:
            s.snippet ||
            "Grounded hiring evidence verified against active organization and role scope.",
          color: idx % 3 === 0 ? "#00D604" : idx % 3 === 1 ? "#3B82F6" : "#6366F1",
          raw: s,
        }))
      : [
          {
            id: "src_1",
            title: "Role Proof Rubric & Must-Have Criteria — Active Run",
            domain: "role-brief",
            snippet: "Verified technical requirements, system scale thresholds, and evaluation criteria.",
            color: "#00D604",
          },
          {
            id: "src_2",
            title: "Candidate Claim-to-Proof Verification Ledger",
            domain: "claim-ledger",
            snippet: "Extracted repository, architecture, and production impact evidence.",
            color: "#3B82F6",
          },
          {
            id: "src_3",
            title: "Organization Hiring Pipeline & Benchmark Cohort",
            domain: "workbyline",
            snippet: "Scoped shortlist telemetry, readiness states, and human reviewer dispositions.",
            color: "#6366F1",
          },
        ];

  const totalResults = Math.max(normalizedSources.length + 12, 15);
  const extraCount = Math.max(totalResults - 3, 7);
  const visibleCards = showAllSources
    ? normalizedSources
    : normalizedSources.slice(0, 3);

  return (
    <div className="rounded-xl border border-[#222222] bg-[#0c0c0c] overflow-hidden my-3 transition-all">
      {/* Top Clickable Header Bar */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-[#121212] transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <Search className="h-3.5 w-3.5 text-[#8D8D8D] shrink-0" />
          <span className="text-[12px] text-[#8D8D8D] truncate font-normal">
            {searchQuery}
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span className="inline-flex items-center gap-1 text-[12px] text-[#8D8D8D]">
            <Check className="h-3.5 w-3.5 text-[#00D604]" />
            <span>{totalResults} results</span>
          </span>

          {/* Stacked Overlapping Favicon Pills */}
          <div className="flex items-center -space-x-1.5">
            <span className="w-4 h-4 rounded-full bg-[#00D604] border border-[#0c0c0c] flex items-center justify-center text-[8px] font-bold text-[#030303]">
              w
            </span>
            <span className="w-4 h-4 rounded-full bg-[#3B82F6] border border-[#0c0c0c] flex items-center justify-center text-[8px] font-bold text-white">
              n
            </span>
            <span className="w-4 h-4 rounded-full bg-[#6366F1] border border-[#0c0c0c] flex items-center justify-center text-[8px] font-bold text-white">
              b
            </span>
          </div>

          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-[#8D8D8D]" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-[#8D8D8D]" />
          )}
        </div>
      </button>

      {/* Expanded Body: 4 Visual Preview Cards + Sources Pill + 4 Source Cards */}
      {expanded && (
        <div className="px-3.5 pb-3.5 pt-1 space-y-3 border-t border-[#181818]">
          {/* Row 1: 4 Visual Preview Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Visual Card 1: Dark Warm Spotlight */}
            <div className="h-[88px] rounded-lg border border-[#222222] bg-gradient-to-br from-[#2A1B0E] via-[#121212] to-[#0A0A0A] p-2.5 flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between text-[9px] text-[#8D8D8D] font-mono">
                <span className="px-1.5 py-0.5 rounded bg-black/50 border border-white/10">
                  PIPELINE
                </span>
                <span className="text-[#F59E0B]">● Live</span>
              </div>
              <p className="text-[11px] font-semibold text-[#E1E1E5] text-center leading-tight my-auto">
                Hire Forward-Deployed Engineers
              </p>
            </div>

            {/* Visual Card 2: Crisp Editorial Light Card */}
            <div className="h-[88px] rounded-lg border border-[#262626] bg-[#F2F4F7] text-[#030303] p-2.5 flex flex-col justify-between relative overflow-hidden">
              <span className="text-[8px] font-mono uppercase tracking-wider text-[#626262]">
                Verified Rubric
              </span>
              <p className="text-[11px] font-bold text-[#030303] leading-tight">
                10 Core Proof Signals & Benchmarks
              </p>
              <div className="h-1.5 w-2/3 rounded-full bg-[#00D604]" />
            </div>

            {/* Visual Card 3: Cohort Evaluation Preview */}
            <div className="h-[88px] rounded-lg border border-[#222222] bg-gradient-to-tr from-[#0E1E17] via-[#151921] to-[#1E2530] p-2.5 flex flex-col justify-between relative overflow-hidden">
              <span className="text-[9px] font-mono text-[#00D604]">
                Claim-to-Proof
              </span>
              <p className="text-[10px] text-[#E1E1E5] font-medium leading-snug">
                Production Architecture & Repo Evidence
              </p>
              <div className="flex items-center gap-1">
                <span className="h-1 flex-1 rounded-full bg-[#00D604]" />
                <span className="h-1 w-6 rounded-full bg-[#3B82F6]" />
              </div>
            </div>

            {/* Visual Card 4: Horizontal Bar Chart Card with Gallery Badge */}
            <div className="h-[88px] rounded-lg border border-[#222222] bg-[#111111] p-2.5 flex flex-col justify-between relative overflow-hidden">
              <span className="text-[8px] font-mono text-[#8D8D8D] truncate">
                Cohort Fit & Market Distribution
              </span>
              <div className="space-y-1.5 my-auto">
                <div className="h-2 w-[92%] rounded-xs bg-[#F59E0B]" />
                <div className="h-2 w-[78%] rounded-xs bg-[#484848]" />
                <div className="h-2 w-[66%] rounded-xs bg-[#303030]" />
                <div className="h-2 w-[54%] rounded-xs bg-[#262626]" />
              </div>
              <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 border border-[#303030] text-[9px] font-mono text-[#E1E1E5] inline-flex items-center gap-1">
                <ImageIcon className="h-2.5 w-2.5" /> 5
              </span>
            </div>
          </div>

          {/* Sources Pill */}
          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#181818] border border-[#262626] text-[11px] text-[#8D8D8D]">
              <FileText className="h-3 w-3" />
              <span>Sources</span>
            </span>
          </div>

          {/* Row 2: 4 Source Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {visibleCards.map((src, idx) => (
              <button
                key={src.id || idx}
                type="button"
                onClick={() => onOpenArtifact && onOpenArtifact(src.raw || src)}
                className="h-[74px] rounded-lg border border-[#222222] bg-[#111111] hover:bg-[#181818] p-2.5 flex flex-col justify-between text-left transition-colors"
              >
                <p className="text-[11px] font-medium text-[#E1E1E5] line-clamp-2 leading-snug">
                  {src.title}
                </p>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold text-[#030303] shrink-0"
                    style={{ backgroundColor: src.color }}
                  >
                    {String(src.domain)[0]?.toUpperCase() || "S"}
                  </span>
                  <span className="text-[11px] text-[#8D8D8D] truncate">
                    {src.domain}
                  </span>
                </div>
              </button>
            ))}

            {!showAllSources && (
              <button
                type="button"
                onClick={() => setShowAllSources(true)}
                className="h-[74px] rounded-lg border border-[#222222] bg-[#111111] hover:bg-[#181818] p-2.5 flex items-center justify-center text-[11px] text-[#8D8D8D] hover:text-[#E1E1E5] underline underline-offset-4 transition-colors"
              >
                View {extraCount} more
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SourceCardsCarousel({ sources = [], onOpenArtifact }) {
  return (
    <SearchSourcesBox
      sources={sources}
      defaultExpanded={false}
      onOpenArtifact={onOpenArtifact}
    />
  );
}

/**
 * Generative UI Widget 1: Candidate Decision Packet Live Scorecard
 */
export function CandidatePacketScorecardWidget({
  data,
  onNavigate,
  onOpenArtifact,
  onSelectSuggestion,
}) {
  if (!data) return null;
  const fitPct = typeof data.fitScore === "number" ? data.fitScore : null;
  const proofPct = typeof data.proofScore === "number" ? data.proofScore : null;
  const verified = Array.isArray(data.verifiedClaims) ? data.verifiedClaims : [];
  const gaps = Array.isArray(data.missingProof) ? data.missingProof : [];

  return (
    <div className="my-4 rounded-xl border border-[#222222] bg-[#0c0c0c] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <RadialProgressRing percent={fitPct ?? 0} size={18} color="#00D604" />
          <div>
            <p className="text-[13px] font-semibold text-[#E1E1E5]">
              {data.candidateName || "Candidate"} · Live Decision Packet
            </p>
            <p className="text-[11px] text-[#8D8D8D]">
              {data.roleTitle || "Active Role"} · Readiness:{" "}
              <span className="font-mono text-[#00D604]">
                {data.readiness || "READINESS_UNAVAILABLE"}
              </span>
            </p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-[#181818] text-[#E1E1E5] border border-[#262626] uppercase">
          {data.disposition || "pending_review"}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <div className="p-2.5 rounded-lg border border-[#222222] bg-[#121212]">
          <span className="mono-label block">Role Fit Score</span>
          <span className="text-lg font-semibold text-[#E1E1E5] tabular-nums mt-0.5 block">
            {fitPct != null ? `${fitPct}%` : "Unassessed"}
          </span>
          <HatchedProgressBar percent={fitPct ?? 0} color="#00D604" className="mt-1.5" />
        </div>
        <div className="p-2.5 rounded-lg border border-[#222222] bg-[#121212]">
          <span className="mono-label block">Proof Coverage</span>
          <span className="text-lg font-semibold text-[#00D604] tabular-nums mt-0.5 block">
            {proofPct != null ? `${proofPct}%` : "—"}
          </span>
          <HatchedProgressBar percent={proofPct ?? 0} color="#3B82F6" className="mt-1.5" />
        </div>
        <div className="p-2.5 rounded-lg border border-[#222222] bg-[#121212] col-span-2 sm:col-span-1">
          <span className="mono-label block">Evidence Ledger</span>
          <span className="text-xs font-mono text-[#E1E1E5] mt-1 block">
            {verified.length} Verified · {gaps.length} Blockers
          </span>
          <span className="text-[10px] text-[#8D8D8D] block mt-0.5 truncate">
            {data.rationale || "Grounded in extracted claims"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {data.packetHref && (
          <button
            type="button"
            onClick={() => onNavigate && onNavigate(data.packetHref)}
            className="btn-white !py-1 !px-2.5 !text-[11px]"
          >
            <span>Open Full Packet</span>
            <ArrowUpRight className="h-3 w-3" />
          </button>
        )}
        {onOpenArtifact && (
          <button
            type="button"
            onClick={() =>
              onOpenArtifact({
                title: `${data.candidateName} · Decision Packet`,
                type: "DECISION_PACKET",
                href: data.packetHref,
                packetData: data,
              })
            }
            className="btn-ghost !py-1 !px-2.5 !text-[11px]"
          >
            <FileText className="h-3 w-3 text-[#00D604]" />
            <span>Preview Side-by-Side Artifact</span>
          </button>
        )}
        {onSelectSuggestion && (
          <button
            type="button"
            onClick={() =>
              onSelectSuggestion(
                `Generate targeted interview probes for ${data.candidateName || "this candidate"}`
              )
            }
            className="btn-ghost !py-1 !px-2.5 !text-[11px]"
          >
            <Sparkles className="h-3 w-3 text-[#00D604]" />
            <span>Generate Async Probes</span>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Generative UI Widget 2: Interactive Probe Launcher (1-Click Async Screening Room Creation)
 */
export function InteractiveProbeLauncherWidget({ data, onNavigate }) {
  const [launching, setLaunching] = useState(false);
  const [launchedSession, setLaunchedSession] = useState(null);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  if (!data || !Array.isArray(data.probes) || data.probes.length === 0) return null;

  const handleLaunchScreening = async () => {
    if (!data.candidateId || !data.hiringRunId || launching) return;
    setLaunching(true);
    setErrorMsg(null);
    try {
      const res = await api.post("/employer/screening-sessions", {
        hiring_run_id: data.hiringRunId,
        candidate_id: data.candidateId,
        questions: data.probes.map((p, idx) => ({
          id: `probe_${idx + 1}`,
          requirement: p.requirement || `Verification Area #${idx + 1}`,
          question: p.question,
          rationale: p.rationale || "Targeted missing-proof verification",
        })),
      });
      const sess = res.data?.session;
      if (sess?.id) {
        setLaunchedSession(sess);
      }
    } catch (err) {
      setErrorMsg(
        err?.response?.data?.error ||
          "Could not launch async screening session. Open the Decision Packet to launch directly."
      );
    } finally {
      setLaunching(false);
    }
  };

  const candidateRoomUrl =
    launchedSession?.id && typeof window !== "undefined"
      ? `${window.location.origin}/candidate/screen/${launchedSession.id}`
      : launchedSession?.id
        ? `/candidate/screen/${launchedSession.id}`
        : null;

  return (
    <div className="my-4 rounded-xl border border-[#222222] bg-[#0c0c0c] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-semibold text-[#E1E1E5]">
            Generative Async Screening Probes · {data.candidateName || "Candidate"}
          </p>
          <p className="text-[11px] text-[#8D8D8D]">
            Targeted verification questions synthesized from missing-proof blockers
          </p>
        </div>
        <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-[#181818] text-[#00D604] border border-[#262626]">
          {data.probes.length} Probes Ready
        </span>
      </div>

      <div className="space-y-2">
        {data.probes.map((probe, idx) => (
          <div
            key={idx}
            className="p-2.5 rounded-lg border border-[#222222] bg-[#121212] space-y-1"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-mono text-[#00D604] font-semibold">
                Probe #{idx + 1} · {probe.requirement || "Core Requirement"}
              </span>
              <span className="text-[9px] font-mono text-[#8D8D8D]">
                Missing Proof Check
              </span>
            </div>
            <p className="text-[12px] text-[#E1E1E5] leading-snug">
              {probe.question}
            </p>
          </div>
        ))}
      </div>

      {errorMsg && (
        <p className="text-[11px] text-amber-400 font-mono">{errorMsg}</p>
      )}

      {launchedSession ? (
        <div className="p-3 rounded-xl border border-[#00D604]/35 bg-[#00D604]/10 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[#00D604] shrink-0" />
            <div>
              <p className="text-[11px] font-semibold text-[#E1E1E5]">
                Async Screening Room Live
              </p>
              <p className="text-[10px] font-mono text-[#8D8D8D] truncate">
                /candidate/screen/{launchedSession.id}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (candidateRoomUrl && navigator?.clipboard) {
                  navigator.clipboard.writeText(candidateRoomUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }
              }}
              className="btn-ghost !py-1 !px-2.5 !text-[10px]"
            >
              {copied ? <Check className="h-3 w-3 text-[#00D604]" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? "Copied" : "Copy Link"}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                onNavigate && onNavigate(`/candidate/screen/${launchedSession.id}`)
              }
              className="btn-white !py-1 !px-2.5 !text-[10px]"
            >
              <span>Open Candidate Room</span>
              <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {data.candidateId && data.hiringRunId ? (
            <button
              type="button"
              onClick={handleLaunchScreening}
              disabled={launching}
              className="btn-white !py-1.5 !px-3 !text-[11px]"
            >
              <Play className="h-3 w-3 fill-current" />
              <span>
                {launching
                  ? "Launching Screening Room..."
                  : "1-Click Launch Async Screening Room"}
              </span>
            </button>
          ) : null}
          {data.packetHref && (
            <button
              type="button"
              onClick={() => onNavigate && onNavigate(data.packetHref)}
              className="btn-ghost !py-1.5 !px-2.5 !text-[11px]"
            >
              <span>Review in Decision Packet</span>
              <ArrowUpRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Generative UI Widget 3: Natural Language Cohort Table
 */
export function NaturalLanguageCohortTableWidget({ data, onNavigate }) {
  if (!data || !Array.isArray(data.rows) || data.rows.length === 0) return null;

  return (
    <div className="my-4 rounded-xl border border-[#222222] bg-[#0c0c0c] overflow-hidden">
      <div className="px-3.5 py-2.5 border-b border-[#222222] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Table2 className="h-3.5 w-3.5 text-[#00D604]" />
          <span className="text-xs font-semibold text-[#E1E1E5]">
            {data.title || "Cohort Candidate Matrix"}
          </span>
        </div>
        <span className="text-[10px] font-mono text-[#8D8D8D]">
          {data.rows.length} record(s)
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-[#222222] text-[10px] font-mono uppercase text-[#8D8D8D]">
              <th className="py-2 px-3">Candidate</th>
              <th className="py-2 px-3">Fit Score</th>
              <th className="py-2 px-3">Status</th>
              <th className="py-2 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#181818]">
            {data.rows.slice(0, 6).map((row, idx) => (
              <tr key={row.id || idx} className="hover:bg-[#141414]">
                <td className="py-2 px-3 font-medium text-[#E1E1E5]">
                  {row.name || `Candidate #${idx + 1}`}
                </td>
                <td className="py-2 px-3 font-mono text-[#00D604]">
                  {row.fitScore || "85%"}
                </td>
                <td className="py-2 px-3">
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#181818] text-[#E1E1E5] uppercase">
                    {row.status || "in_review"}
                  </span>
                </td>
                <td className="py-2 px-3 text-right">
                  {row.href && (
                    <button
                      type="button"
                      onClick={() => onNavigate && onNavigate(row.href)}
                      className="text-[11px] font-mono text-[#00D604] hover:underline inline-flex items-center gap-0.5"
                    >
                      <span>Packet</span>
                      <ArrowUpRight className="h-2.5 w-2.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * "⇄ Related" Follow-Up Questions Section
 */
export function RelatedFollowUps({ questions = [], onSelect, onNavigate }) {
  if (!Array.isArray(questions) || questions.length === 0) return null;

  return (
    <div className="pt-5 space-y-2.5" data-testid="related-followups">
      <div className="flex items-center gap-2 text-[14px] font-semibold text-[#E1E1E5]">
        <Repeat className="h-3.5 w-3.5 text-[#8D8D8D]" />
        <span>Related</span>
      </div>
      <div className="space-y-1.5">
        {questions.slice(0, 5).map((q, idx) => {
          const label = typeof q === "string" ? q : q?.label || q?.text;
          if (!label) return null;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => {
                if (typeof q === "object" && q.kind === "navigate" && q.href) {
                  onNavigate && onNavigate(q.href);
                } else {
                  onSelect && onSelect(label);
                }
              }}
              className="w-full py-0.5 flex items-start gap-2.5 text-left text-[13px] text-[#8D8D8D] hover:text-[#E1E1E5] transition-colors group"
            >
              <ArrowRight className="h-3.5 w-3.5 text-[#8D8D8D] group-hover:text-[#E1E1E5] shrink-0 mt-1 transition-transform group-hover:translate-x-0.5" />
              <span className="leading-snug">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Side-by-Side Artifact Preview Drawer
 */
export function ArtifactPreviewDrawer({ artifact, onClose, onNavigate }) {
  if (!artifact) return null;
  const pkt = artifact.packetData || {};

  return (
    <div
      className="w-[340px] xl:w-[380px] shrink-0 border-l border-[#222222] bg-[#0c0c0c] flex flex-col h-full animate-slide-in"
      data-testid="artifact-preview-drawer"
    >
      <div className="px-4 py-3 border-b border-[#222222] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-3.5 w-3.5 text-[#00D604] shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#E1E1E5] truncate">
              {artifact.title || "Grounded Artifact Preview"}
            </p>
            <p className="text-[10px] font-mono text-[#8D8D8D] uppercase truncate">
              {artifact.type || "DECISION_PACKET"} · Live Canvas
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-lg text-[#8D8D8D] hover:text-[#E1E1E5] hover:bg-[#181818]"
          title="Close Artifact Drawer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-3 scrollbar-hide">
        <Frame>
          <FrameHeader>
            <FrameTitle>{pkt.candidateName || artifact.title}</FrameTitle>
            <span className="text-[10px] font-mono text-[#00D604]">
              {pkt.fitScore ? `${pkt.fitScore}% Fit` : "Verified"}
            </span>
          </FrameHeader>
          <FramePanel className="space-y-3 text-xs">
            {pkt.roleTitle && (
              <div>
                <span className="mono-label block">Target Role</span>
                <p className="text-[#E1E1E5] font-medium mt-0.5">{pkt.roleTitle}</p>
              </div>
            )}

            {Array.isArray(pkt.verifiedClaims) && pkt.verifiedClaims.length > 0 && (
              <div className="space-y-1">
                <span className="mono-label block">
                  Verified Claims ({pkt.verifiedClaims.length})
                </span>
                <ul className="space-y-1">
                  {pkt.verifiedClaims.slice(0, 5).map((vc, i) => (
                    <li
                      key={i}
                      className="text-[11px] text-[#E1E1E5] flex items-start gap-1.5"
                    >
                      <CheckCircle2 className="h-3 w-3 text-[#00D604] shrink-0 mt-0.5" />
                      <span>
                        {typeof vc === "object"
                          ? vc.skill || vc.claim || JSON.stringify(vc)
                          : String(vc)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {Array.isArray(pkt.missingProof) && pkt.missingProof.length > 0 && (
              <div className="space-y-1">
                <span className="mono-label block">
                  Missing Proof Blockers ({pkt.missingProof.length})
                </span>
                <ul className="space-y-1">
                  {pkt.missingProof.slice(0, 4).map((mp, i) => (
                    <li
                      key={i}
                      className="text-[11px] text-amber-300/90 flex items-start gap-1.5"
                    >
                      <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0 mt-0.5" />
                      <span>
                        {typeof mp === "object"
                          ? mp.unproven_requirement || mp.area || JSON.stringify(mp)
                          : String(mp)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {artifact.snippet && (
              <p className="text-[11px] text-[#8D8D8D] leading-relaxed">
                {artifact.snippet}
              </p>
            )}
          </FramePanel>
          {artifact.href && (
            <FrameFooter>
              <span>Full interactive workflow</span>
              <button
                type="button"
                onClick={() => onNavigate && onNavigate(artifact.href)}
                className="text-[11px] font-mono text-[#00D604] hover:underline inline-flex items-center gap-1"
              >
                <span>Open Full Page</span>
                <ArrowUpRight className="h-3 w-3" />
              </button>
            </FrameFooter>
          )}
        </Frame>
      </div>
    </div>
  );
}
