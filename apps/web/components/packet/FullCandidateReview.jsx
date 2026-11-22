"use client";

import React, { useState } from "react";
import { 
  ShieldCheck, CheckCircle2, AlertTriangle, HelpCircle, 
  FileText, ExternalLink, Sparkles, Database, Layers,
  Check, ArrowRight, Loader2, RefreshCw, User, MapPin, Building
} from "lucide-react";
import { resolveAuthoritativeFitScore, formatCanonicalScorePercent } from "@/lib/scoreUtils";
import LinkedInIcon from "@/components/icons/LinkedInIcon";

export default function FullCandidateReview({
  candidate,
  packet,
  hiringRun,
  onGenerateEvaluation,
  generating = false
}) {
  const name = candidate?.candidate_name || candidate?.name || candidate?.candidate_profiles?.name || "Candidate Profile";
  const title = candidate?.current_role || candidate?.candidate_profiles?.headline || candidate?.candidate_profiles?.bio || null;
  const location = candidate?.location || candidate?.candidate_profiles?.location || null;
  const company = candidate?.current_company || candidate?.candidate_profiles?.current_company || null;
  const linkedInUrl = candidate?.candidate_profiles?.resume_link || candidate?.linkedin_url || null;

  const hasEvaluation = Boolean(packet && (packet.evaluation_timestamp || packet.id));
  const metrics = packet?.evaluation_metrics || {};
  const fitScore = hasEvaluation
    ? resolveAuthoritativeFitScore(packet, candidate)
    : null;

  const readiness = metrics.decision_readiness || packet?.decision_readiness || (hasEvaluation ? "EVALUATED" : "EVALUATION_NOT_STARTED");

  // Capabilities: strictly from candidate or packet payload
  const capabilities = Array.isArray(candidate?.skills) && candidate.skills.length > 0
    ? candidate.skills
    : (Array.isArray(packet?.extracted_capabilities) && packet.extracted_capabilities.length > 0
        ? packet.extracted_capabilities
        : (Array.isArray(candidate?.highlights) && candidate.highlights.length > 0 ? candidate.highlights : []));

  // Verified / Inferred / Uncertain claims: strictly authoritative
  const verifiedClaims = Array.isArray(packet?.what_is_verified) ? packet.what_is_verified : [];
  const inferredClaims = Array.isArray(packet?.what_is_inferred) ? packet.what_is_inferred : [];
  const uncertainClaims = Array.isArray(packet?.what_remains_uncertain) 
    ? packet.what_remains_uncertain 
    : (Array.isArray(packet?.missing_proof) ? packet.missing_proof.map(m => m.unproven_requirement || m.requirement || String(m)) : []);

  // Strongest evidence items: strictly authoritative
  const evidenceItems = Array.isArray(packet?.strongest_evidence) ? packet.strongest_evidence : [];

  // Recommended questions
  const recommendedQuestions = Array.isArray(packet?.recommended_questions) 
    ? packet.recommended_questions 
    : (Array.isArray(packet?.follow_up_questions) ? packet.follow_up_questions : []);

  return (
    <div className="space-y-6 text-white font-sans max-w-4xl mx-auto pb-16">
      {/* ── Top Header Card (Truthful Identity & Status) ── */}
      <div className="p-6 rounded-2xl bg-[#121212] border border-white/[0.08] shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
              <h1 className="text-xl font-bold tracking-tight text-white/95">{name}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-medium border ${
                !hasEvaluation
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                  : readiness === "EVIDENCE READY"
                  ? "bg-green-500/10 border-green-500/30 text-green-400"
                  : readiness === "HUMAN REVIEW REQUIRED"
                  ? "bg-blue-500/10 border-blue-500/30 text-blue-300"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-300"
              }`}>
                {readiness}
              </span>
              {fitScore != null ? (
                <span className="px-2 py-0.5 rounded bg-white/[0.04] text-[10px] font-mono text-white/45">
                  Fit: {formatCanonicalScorePercent(fitScore)}
                </span>
              ) : hasEvaluation ? (
                <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] font-mono text-amber-300">
                  Fit: Unverified (Insufficient Corroboration)
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
              {title && <span>{title}</span>}
              {company && (
                <span className="flex items-center gap-1 text-white/50">
                  <Building className="h-3 w-3" /> {company}
                </span>
              )}
              {location && (
                <span className="flex items-center gap-1 text-white/40">
                  <MapPin className="h-3 w-3" /> {location}
                </span>
              )}
              {!title && !company && !location && (
                <span className="text-white/30 italic">Profile details pending extraction</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {linkedInUrl && (
              <a
                href={linkedInUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-[#0A66C2] hover:bg-[#0A66C2]/10 hover:border-[#0A66C2]/30 transition-all font-medium"
              >
                <LinkedInIcon className="h-3.5 w-3.5 fill-current" />
                <span>Profile</span>
                <ExternalLink className="h-2.5 w-2.5 opacity-60" />
              </a>
            )}

            {!hasEvaluation && onGenerateEvaluation && (
              <button
                onClick={onGenerateEvaluation}
                disabled={generating}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#00D604] text-black text-xs font-semibold hover:bg-[#00D604]/90 transition-all shadow-sm disabled:opacity-50"
              >
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span>{generating ? "Evaluating..." : "Generate Decision Packet"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Verification Route States */}
        <div className="pt-3 border-t border-white/[0.06] flex items-center gap-2 overflow-x-auto scrollbar-hide text-[11px] font-mono">
          <span className="text-white/30 text-[10px] uppercase tracking-wider shrink-0 mr-1">Status:</span>
          <span className="px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/70 shrink-0 flex items-center gap-1">
            <Check className="h-3 w-3 text-green-400" />
            extraction (complete)
          </span>
          <span className={`px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1 border ${
            hasEvaluation
              ? "bg-green-500/10 border-green-500/20 text-green-400"
              : "bg-white/[0.02] border-white/[0.05] text-white/40"
          }`}>
            {hasEvaluation && <Check className="h-3 w-3 text-green-400" />}
            evaluation ({hasEvaluation ? "complete" : "pending"})
          </span>
          <span className="px-2 py-0.5 rounded-full bg-white/[0.02] border border-white/[0.05] text-white/40 shrink-0">
            human-review ({typeof packet?.human_decision === "string"
              ? packet.human_decision
              : (packet?.human_decision?.action || packet?.human_decision?.status || (candidate?.status && candidate.status !== "new" ? candidate.status : "pending"))})
          </span>
        </div>
      </div>

      {/* ── Section 1: Sourcing Rationale & Role Match ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sourcing Rationale */}
        <div className="p-5 rounded-2xl bg-[#121212] border border-white/[0.08] space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-400" />
            <h3 className="text-xs font-semibold text-white/90 uppercase tracking-wider font-mono">
              Sourcing Rationale
            </h3>
          </div>
          {candidate?.sourcing_reason || candidate?.notes || packet?.sourcing_summary ? (
            <p className="text-xs text-white/70 leading-relaxed">
              {candidate?.sourcing_reason || candidate?.notes || packet?.sourcing_summary}
            </p>
          ) : (
            <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] text-xs text-white/40 italic">
              Sourced candidate record awaiting decision kernel evaluation against approved role rubric.
            </div>
          )}
        </div>

        {/* Role Alignment */}
        <div className="p-5 rounded-2xl bg-[#121212] border border-white/[0.08] space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-green-400" />
            <h3 className="text-xs font-semibold text-white/90 uppercase tracking-wider font-mono">
              Rubric Alignment
            </h3>
          </div>
          {hiringRun?.role_title ? (
            <div className="space-y-1.5 text-xs text-white/70">
              <p>Target Role: <strong className="text-white/90">{hiringRun.role_title}</strong></p>
              {hiringRun?.company && <p className="text-white/50">Company: {hiringRun.company}</p>}
              <p className="text-white/40 text-[11px] pt-1">
                {hasEvaluation
                  ? "Evaluated against authoritative ProofContract and grounded criteria."
                  : "Criteria alignment will be computed when decision packet is generated."}
              </p>
            </div>
          ) : (
            <p className="text-xs text-white/40 italic">Target role context pending.</p>
          )}
        </div>
      </div>

      {/* ── Section 2: Strongest Supporting Evidence ── */}
      <div className="p-5 rounded-2xl bg-[#121212] border border-white/[0.08] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-blue-400" />
            <h3 className="text-xs font-semibold text-white/90 uppercase tracking-wider font-mono">
              Strongest Supporting Evidence
            </h3>
          </div>
          <span className="text-[10px] font-mono text-white/35">Citations grounded in authoritative sources</span>
        </div>

        {evidenceItems.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {evidenceItems.map((ev, i) => {
              const isObj = typeof ev === 'object' && ev !== null;
              const heading = isObj ? (ev.title || `Evidence Item #${i + 1}`) : `Evidence Item #${i + 1}`;
              const text = isObj ? (ev.excerpt || ev.content || JSON.stringify(ev)) : String(ev);
              const source = isObj ? (ev.citation || ev.source || packet?.parser_name || "Document Span") : (packet?.parser_name || packet?.filename || "Document Span");

              return (
                <div key={i} className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-white/90 truncate">{heading}</span>
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
                  </div>
                  <p className="text-[11px] text-white/50 leading-relaxed line-clamp-3">
                    {text}
                  </p>
                  <div className="pt-1.5 border-t border-white/[0.04]">
                    <span className="text-[9px] font-mono text-blue-400/80 bg-blue-500/10 px-1.5 py-0.5 rounded">
                      [{source}]
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] text-xs text-white/40 text-center">
            No extracted evidence citations recorded. Ingest role context or generate an evaluation packet to surface grounded evidence.
          </div>
        )}
      </div>

      {/* ── Section 3: Extracted Capabilities ── */}
      <div className="p-5 rounded-2xl bg-[#121212] border border-white/[0.08] space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-amber-400" />
          <h3 className="text-xs font-semibold text-white/90 uppercase tracking-wider font-mono">
            Extracted Capabilities
          </h3>
        </div>

        {capabilities.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {capabilities.map((cap, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-xs font-medium text-white/80"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#00D604]" />
                <span>{cap}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-white/40 italic">No capabilities recorded for this candidate profile.</p>
        )}
      </div>

      {/* ── Section 4: Trust Matrix (Verified / Inferred / Uncertain) ── */}
      <div className="p-5 rounded-2xl bg-[#121212] border border-white/[0.08] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#00D604]" />
            <h3 className="text-xs font-semibold text-white/90 uppercase tracking-wider font-mono">
              Trust Matrix & Claim Ledger
            </h3>
          </div>
          <span className="text-[10px] font-mono text-white/35">Fail-closed truth boundaries</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Verified Column */}
          <div className="p-3.5 rounded-xl bg-green-500/[0.03] border border-green-500/20 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-green-400 font-semibold">
                Verified Claims ({verifiedClaims.length})
              </span>
              <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
            </div>
            {verifiedClaims.length > 0 ? (
              <ul className="space-y-2 text-[11px] text-white/70">
                {verifiedClaims.map((claim, i) => (
                  <li key={i} className="flex items-start gap-1.5 leading-snug">
                    <span className="text-green-400 shrink-0">✓</span>
                    <span>{typeof claim === 'string' ? claim : (claim.claim || claim.title || JSON.stringify(claim))}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[10px] text-white/30 italic">No verified claims recorded.</p>
            )}
          </div>

          {/* Inferred Column */}
          <div className="p-3.5 rounded-xl bg-blue-500/[0.03] border border-blue-500/20 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400 font-semibold">
                Inferred Signals ({inferredClaims.length})
              </span>
              <HelpCircle className="h-3.5 w-3.5 text-blue-400" />
            </div>
            {inferredClaims.length > 0 ? (
              <ul className="space-y-2 text-[11px] text-white/70">
                {inferredClaims.map((claim, i) => (
                  <li key={i} className="flex items-start gap-1.5 leading-snug">
                    <span className="text-blue-400 shrink-0">≈</span>
                    <span>{typeof claim === 'string' ? claim : (claim.claim || claim.title || JSON.stringify(claim))}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[10px] text-white/30 italic">No inferred claims recorded.</p>
            )}
          </div>

          {/* Uncertain Column */}
          <div className="p-3.5 rounded-xl bg-amber-500/[0.03] border border-amber-500/20 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-semibold">
                Uncertain / Missing ({uncertainClaims.length})
              </span>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            </div>
            {uncertainClaims.length > 0 ? (
              <ul className="space-y-2 text-[11px] text-white/70">
                {uncertainClaims.map((claim, i) => (
                  <li key={i} className="flex items-start gap-1.5 leading-snug">
                    <span className="text-amber-400 shrink-0">?</span>
                    <span>{typeof claim === 'string' ? claim : (claim.unproven_requirement || claim.requirement || JSON.stringify(claim))}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[10px] text-white/30 italic">No unproven blockers flagged.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 5: Recommended Follow-Up Questions ── */}
      {recommendedQuestions.length > 0 && (
        <div className="p-5 rounded-2xl bg-[#121212] border border-white/[0.08] space-y-3">
          <h3 className="text-xs font-semibold text-white/90 uppercase tracking-wider font-mono">
            Recommended Screening Inquiries
          </h3>
          <p className="text-xs text-white/50">
            Targeted questions formulated to resolve remaining uncertain claims during initial screen:
          </p>
          <div className="space-y-2">
            {recommendedQuestions.map((q, i) => (
              <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] text-xs text-white/80">
                <strong>{i + 1}.</strong> {typeof q === 'string' ? q : (q.question || q.text || JSON.stringify(q))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

