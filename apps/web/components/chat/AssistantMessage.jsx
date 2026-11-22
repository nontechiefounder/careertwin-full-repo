"use client";

import { Globe } from "lucide-react";
import CandidateChatCard from "./CandidateChatCard";
import MessageActions from "@/components/ai-chat/MessageActions";
import {
  SearchSourcesBox,
  CandidatePacketScorecardWidget,
  InteractiveProbeLauncherWidget,
  NaturalLanguageCohortTableWidget,
  RelatedFollowUps,
} from "./AnswerTurn";

/**
 * Inline Citation Pill with Hover Preview Card
 */
function InlineSourcePill({ label, sources = [] }) {
  const cleanLabel = label.replace(/^\[|\]$/g, "").trim();
  const matched =
    sources.find((s) =>
      String(s.title || s.filename || s.type || "")
        .toLowerCase()
        .includes(cleanLabel.toLowerCase())
    ) || null;

  const domain =
    matched?.domain ||
    cleanLabel.toLowerCase().replace(/[^a-z0-9]+/g, "") ||
    "workbyline";
  const cardTitle =
    matched?.title || matched?.filename || `${cleanLabel} · Verified Evidence`;
  const cardSnippet =
    matched?.snippet ||
    "Direct evidence record from active organization role rubric and candidate claim-to-proof ledger.";

  return (
    <span className="relative inline-flex items-center group mx-1 align-baseline">
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#1A1A1A] hover:bg-[#262626] text-[10px] font-mono text-[#8D8D8D] hover:text-[#E1E1E5] cursor-pointer transition-colors">
        {domain}
      </span>

      {/* Hover Preview Popover Card */}
      <span className="hidden group-hover:block absolute left-0 bottom-full mb-2 w-64 p-3 rounded-xl bg-[#181818] border border-[#303030] shadow-2xl z-50 text-left pointer-events-none">
        <span className="flex items-center gap-1.5 text-[11px] text-[#8D8D8D]">
          <span className="w-3.5 h-3.5 rounded-full bg-[#6366F1] flex items-center justify-center text-white shrink-0">
            <Globe className="h-2.5 w-2.5" />
          </span>
          <span className="truncate">www.{domain}.com</span>
        </span>
        <span className="block text-[12px] font-semibold text-[#E1E1E5] mt-1 leading-snug">
          {cardTitle}
        </span>
        <span className="block text-[11px] text-[#8D8D8D] mt-1 line-clamp-2 leading-snug font-normal">
          {cardSnippet}
        </span>
      </span>
    </span>
  );
}

/**
 * Format inline **bold** spans (crisp white font-semibold) and [source] pills (with hover popover)
 */
function renderInlineFormatted(text, sources = []) {
  if (!text || typeof text !== "string") return text;
  const parts = text.split(/(\*\*.*?\*\*|\[.*?\])/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-[#E1E1E5]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("[") && part.endsWith("]")) {
      return <InlineSourcePill key={i} label={part} sources={sources} />;
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * Editorial Markdown Block Renderer (headings, paragraphs, and bullet lists)
 */
function renderEditorialMarkdown(content, sources = []) {
  if (!content || typeof content !== "string") return null;

  const lines = content.split("\n");
  // Fast path for single-line plain text (preserves exact getByText in unit tests)
  if (
    lines.length === 1 &&
    !content.includes("**") &&
    !content.includes("[") &&
    !content.startsWith("#") &&
    !content.startsWith("•") &&
    !content.startsWith("- ")
  ) {
    return (
      <p className="text-[14px] leading-[1.7] text-[#C8C8CD]">{content}</p>
    );
  }

  const blocks = [];
  let bulletBuffer = [];

  const flushBullets = (keyPrefix) => {
    if (bulletBuffer.length === 0) return;
    blocks.push(
      <ul
        key={`ul_${keyPrefix}`}
        className="list-disc pl-5 space-y-2.5 my-3 text-[14px] leading-[1.7] text-[#C8C8CD] marker:text-[#E1E1E5]"
      >
        {bulletBuffer.map((b, idx) => (
          <li key={idx} className="pl-1">
            {renderInlineFormatted(b, sources)}
          </li>
        ))}
      </ul>
    );
    bulletBuffer = [];
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) {
      flushBullets(idx);
      return;
    }

    // Markdown heading (## / ###)
    if (line.startsWith("#")) {
      flushBullets(idx);
      const headingText = line.replace(/^#+\s*/, "");
      blocks.push(
        <h3
          key={`h_${idx}`}
          className="text-[16px] font-semibold text-[#E1E1E5] tracking-tight mt-5 mb-2 pb-1.5 border-b border-[#181818]"
        >
          {renderInlineFormatted(headingText, sources)}
        </h3>
      );
      return;
    }

    // Bullet item (• or - or *)
    if (/^([•\-*])\s+/.test(line)) {
      const cleaned = line.replace(/^([•\-*])\s+/, "");
      bulletBuffer.push(cleaned);
      return;
    }

    flushBullets(idx);
    blocks.push(
      <p
        key={`p_${idx}`}
        className="text-[14px] leading-[1.7] text-[#C8C8CD] my-2.5"
      >
        {renderInlineFormatted(line, sources)}
      </p>
    );
  });

  flushBullets("end");
  return blocks;
}

export default function AssistantMessage({
  message,
  onSelectSuggestion,
  onNavigate,
  onPinToRubric,
  onOpenArtifact,
}) {
  if (!message) return null;

  const content = message.content || message.reply || "";
  const sources = Array.isArray(message.sources) ? message.sources : [];
  const artifact =
    message.artifact && typeof message.artifact === "object"
      ? message.artifact
      : null;
  const suggestions = Array.isArray(message.suggestions)
    ? message.suggestions
    : [];
  const relatedQuestions =
    Array.isArray(message.relatedQuestions) &&
    message.relatedQuestions.length > 0
      ? message.relatedQuestions
      : suggestions;
  const generativeUi = message.generativeUi || null;

  const isGreeting = message.id === "welcome_greeting";
  const searchQueryText = message.searchQuery || null;

  return (
    <div
      className="max-w-[740px] mx-auto w-full my-3 animate-fade-in"
      data-message-role="assistant"
    >
      {/* 1. Collapsible Search & Sources Box */}
      {!isGreeting && (sources.length > 0 || searchQueryText) && (
        <SearchSourcesBox
          searchQuery={searchQueryText || "Grounded workflow sources"}
          sources={sources}
          defaultExpanded={false}
          onOpenArtifact={onOpenArtifact}
        />
      )}

      {/* 2. Editorial Answer Typography Directly on Canvas */}
      <div className="space-y-2">
        {renderEditorialMarkdown(content, sources)}
      </div>

      {/* 3. Inline Generative UI Widgets */}
      {generativeUi?.type === "packet_scorecard" && (
        <CandidatePacketScorecardWidget
          data={generativeUi.data}
          onNavigate={onNavigate}
          onOpenArtifact={onOpenArtifact}
          onSelectSuggestion={onSelectSuggestion}
        />
      )}
      {generativeUi?.type === "probe_launcher" && (
        <InteractiveProbeLauncherWidget
          data={generativeUi.data}
          onNavigate={onNavigate}
        />
      )}
      {generativeUi?.type === "cohort_table" && (
        <NaturalLanguageCohortTableWidget
          data={generativeUi.data}
          onNavigate={onNavigate}
        />
      )}

      {/* Candidate / Role Artifact Card */}
      {artifact && artifact.title && artifact.type && artifact.href && (
        <CandidateChatCard artifact={artifact} onNavigate={onNavigate} />
      )}

      {/* 4. "⇄ Related" Follow-Up Questions */}
      {relatedQuestions.length > 0 && (
        <RelatedFollowUps
          questions={relatedQuestions}
          onSelect={onSelectSuggestion}
          onNavigate={onNavigate}
        />
      )}

      {/* 5. Minimal 5-Icon Action Row (↻  ⧉  👍  👎  🔖) + Two-Dot Separator */}
      <MessageActions
        content={content}
        onPinToRubric={onPinToRubric}
        onRetry={() => onSelectSuggestion && onSelectSuggestion("Regenerate analysis with additional evidence")}
      />

      {!isGreeting && (
        <div className="flex items-center gap-1 pt-4 pb-2 pl-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#E1E1E5]" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#E1E1E5]" />
        </div>
      )}
    </div>
  );
}
