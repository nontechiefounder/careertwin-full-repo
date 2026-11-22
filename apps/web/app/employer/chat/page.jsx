"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { resolveAuthoritativeFitScore, formatCanonicalScorePercent } from "@/lib/scoreUtils";
import NaiveShell from "@/components/NaiveShell";
import ConversationList from "@/components/chat/ConversationList";
import PromptBar from "@/components/chat/PromptBar";
import ChatErrorState from "@/components/chat/ChatErrorState";
import { ArtifactPreviewDrawer } from "@/components/chat/AnswerTurn";
import { Frame, FramePanel } from "@/components/ui/frame";
import {
  Briefcase,
  Plus,
  FileText,
  X,
  ArrowUpRight,
  History,
  Sparkles,
  Settings,
} from "lucide-react";

function ChatPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idSeqRef = useRef(0);

  const queryRoleId =
    searchParams?.get?.("roleId") ||
    searchParams?.get?.("role_id") ||
    null;
  const queryCandidateId =
    searchParams?.get?.("candidateId") ||
    searchParams?.get?.("candidate_id") ||
    searchParams?.get?.("extractionId") ||
    null;

  const { user } = useAuth();

  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [messages, setMessages] = useState([]);
  const [errorMessage, setErrorMessage] = useState(null);
  const [lastSubmittedInput, setLastSubmittedInput] = useState("");
  const [runs, setRuns] = useState([]);
  const [activeRun, setActiveRun] = useState(null);
  const [orgId, setOrgId] = useState(null);

  // Active Candidate Decision Packet Context (from URL or recent PacketPage session)
  const [activeCandidateId, setActiveCandidateId] = useState(queryCandidateId);
  const [activePacketData, setActivePacketData] = useState(null);
  const [cohortCandidates, setCohortCandidates] = useState([]);
  const [activeMode, setActiveMode] = useState("packet");
  const [conciseMode, setConciseMode] = useState(false);
  const [drawerArtifact, setDrawerArtifact] = useState(null);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [threads, setThreads] = useState([
    { id: "default_thread", title: "Active Hiring Thread", updatedAt: "Just now" }
  ]);
  const [activeThreadId, setActiveThreadId] = useState("default_thread");

  // Restore candidate packet context from URL or sessionStorage (when navigating from /employer/packet/[id])
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      if (queryCandidateId) {
        setActiveCandidateId(queryCandidateId);
        return;
      }
      if (typeof window !== "undefined") {
        const urlParams = new URLSearchParams(window.location.search);
        const fromUrl = urlParams.get("candidate_id") || urlParams.get("candidateId") || urlParams.get("extractionId");
        if (fromUrl) {
          setActiveCandidateId(fromUrl);
          return;
        }
        try {
          const savedCtx =
            window.sessionStorage.getItem("workbyline_active_packet_context") ||
            window.sessionStorage.getItem("wbl_last_viewed_packet");
          if (savedCtx) {
            const parsed = JSON.parse(savedCtx);
            if (parsed?.extractionId) {
              setActiveCandidateId(parsed.extractionId);
            }
          }
        } catch (_) {}
      }
    });
    return () => {
      cancelled = true;
    };
  }, [queryCandidateId]);

  // Fetch hiring runs for role & organization context
  useEffect(() => {
    api
      .get("/employer/analytics")
      .then((res) => {
        const r = res.data?.runs || [];
        setRuns(r);
        if (r.length > 0) {
          let effectiveRoleId = queryRoleId;
          if (!effectiveRoleId && typeof window !== "undefined") {
            const urlParams = new URLSearchParams(window.location.search);
            effectiveRoleId = urlParams.get("role_id") || urlParams.get("roleId");
            if (!effectiveRoleId) {
              try {
                const savedCtx = JSON.parse(
                  window.sessionStorage.getItem("workbyline_active_packet_context") ||
                    window.sessionStorage.getItem("wbl_last_viewed_packet") ||
                    "null"
                );
                effectiveRoleId = savedCtx?.roleId || null;
              } catch (_) {}
            }
          }
          if (effectiveRoleId) {
            const matched = r.find(item => item.id === effectiveRoleId);
            setActiveRun(matched || r[0]);
          } else {
            setActiveRun(r[0]);
          }
          if (r[0].org_id) setOrgId(r[0].org_id);
        }
      })
      .catch(() => {});
  }, [queryRoleId]);

  // Fetch active candidate decision packet details when activeCandidateId is set
  useEffect(() => {
    let cancelled = false;
    if (!activeCandidateId) {
      Promise.resolve().then(() => {
        if (!cancelled) setActivePacketData(null);
      });
      return () => {
        cancelled = true;
      };
    }
    api
      .get(`/employer/packets/${activeCandidateId}`)
      .then((res) => {
        if (cancelled || !res?.data?.extraction) return;
        setActivePacketData(res.data);
        if (res.data.hiring_run?.id) {
          setActiveRun((prev) => prev?.id === res.data.hiring_run.id ? prev : res.data.hiring_run);
          if (res.data.hiring_run.org_id) {
            setOrgId((prev) => prev || res.data.hiring_run.org_id);
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeCandidateId]);

  // Fetch role cohort candidates for quick switching in the right rail
  useEffect(() => {
    if (!activeRun?.id || activeRun.id === "run-123") return;
    api
      .get(`/employer/shortlist/${activeRun.id}`)
      .then((res) => {
        if (Array.isArray(res?.data?.extractions)) {
          setCohortCandidates(res.data.extractions);
        }
      })
      .catch(() => {});
  }, [activeRun?.id]);

  // Initial welcome message (formatted in clean editorial style)
  useEffect(() => {
    if (!user) return;
    const firstName =
      user.name?.split(" ")[0] ||
      user.full_name?.split(" ")[0] ||
      user.email?.split("@")[0] ||
      "there";
    const roleName = activeRun?.role_title || "Senior Backend Engineer";
    const initialUserMsg = {
      id: "welcome_user_prompt",
      role: "user",
      time: "Just now",
      content: `HELP ME HIRE ${roleName.toUpperCase()} FOR 4+ YEARS IN SAN FRANCISCO`,
    };
    const initialAiMsg = {
      id: "welcome_answer_init",
      role: "assistant",
      time: "Just now",
      searchQuery: null,
      content: `Hi ${firstName} 👋 — I'm your workBYLiNE hiring AI. I can help you review candidates, draft role briefs, and structure hiring criteria for **${roleName}**.\n\n### Practical next steps\n\n• **Define the role brief:** Specify the required stack, systems experience, and work arrangement (onsite, hybrid, or remote) in Role Intake.\n• **Set evaluation criteria:** Record must-have proof criteria, nice-to-have signals, and explicit disqualifiers in your Proof Contract.\n• **Collect candidate evidence:** Upload resumes or sourced profiles so every claim is backed by verifiable document citations.\n• **Review compiled packets:** Inspect claim-level evidence and approve or hold candidates directly from the Candidate Packet view.\n\nTell me your **tech stack, seniority expectations, or pipeline question** to query your connected workspace records.`,
      sources: [],
      relatedQuestions: [
        `Write a job description for a ${roleName.toLowerCase()} with 4+ years' experience`,
        `Build a sourcing plan for ${roleName.toLowerCase()}s in San Francisco`,
        "What salary range should I offer for this role in San Francisco?",
        "Give me a summary of my current hiring pipeline",
        { label: "New Role", kind: "navigate", href: "/employer/intake" },
      ],
      suggestions: [
        "Give me a summary of my current hiring pipeline",
        { label: "New Role", kind: "navigate", href: "/employer/intake" },
        `What are the must-have requirements for ${roleName}?`,
        "Show candidates in this role cohort"
      ],
    };
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) {
        setMessages((prev) => (prev.length > 0 ? prev : [initialUserMsg, initialAiMsg]));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, activeRun?.role_title]);

  // Inject or update candidate Decision Packet Continuation message when activePacketData arrives
  useEffect(() => {
    if (!activePacketData?.extraction) return;
    const ext = activePacketData.extraction;
    const pkt = activePacketData.packet || ext.decision_packet || {};
    const run = activePacketData.hiring_run || activeRun || {};
    const cName = ext.candidate_name || ext.candidate_profiles?.name || "Candidate";
    const cRole = ext.current_role || ext.candidate_profiles?.bio || "Role profile unrecorded";
    const rTitle = run.role_title || "Active Role";
    const canonicalFit = resolveAuthoritativeFitScore(pkt, ext);
    const rawFit = canonicalFit != null ? Math.round(canonicalFit * 100) : null;
    const fitText = rawFit != null ? `${rawFit}% Fit` : "Unassessed";
    const proofPct = pkt?.evaluation_metrics?.proof_strength != null
      ? Math.round(Number(pkt.evaluation_metrics.proof_strength) * 100)
      : null;
    const readiness = pkt?.evaluation_metrics?.decision_readiness || "EVALUATION_NOT_STARTED";
    const disposition = pkt?.human_decision?.action || ext.status || "pending_review";
    const rationale = ext.decision_rationale || pkt?.human_decision?.rationale || "Awaiting human reviewer disposition";
    const verifiedList = Array.isArray(pkt?.what_is_verified) ? pkt.what_is_verified : [];
    const missingList = Array.isArray(pkt?.missing_proof) ? pkt.missing_proof : [];

    const continuationUserMsg = {
      id: `packet_continuation_usr_${ext.id}`,
      role: "user",
      time: "Just now",
      content: `REVIEW DECISION PACKET FOR ${cName.toUpperCase()} (${rTitle.toUpperCase()})`,
    };
    const continuationMsgId = `packet_continuation_${ext.id}`;
    const continuationMsg = {
      id: continuationMsgId,
      role: "assistant",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      searchQuery: `${cName} ${rTitle} decision packet verified claims missing proof blockers ${fitText}`,
      content: `### Decision Packet Synthesis · ${cName} (${rTitle})\n\nConnected to **${cName}**'s grounded Decision Packet (**${fitText}** · Readiness **${readiness}**). [claim-ledger] [role-brief]\n\n### Claim-to-Proof Verification Summary\n\n• **Candidate Profile:** ${cRole} evaluated against **${rTitle}** rubric criteria.\n• **Human Decision Status:** **${String(disposition).toUpperCase()}** — ${rationale}. [workbyline]\n• **Evidence Ledger:** **${verifiedList.length} verified claim(s)** confirmed with **${missingList.length} missing-proof blocker(s)** flagged for follow-up.\n\nAsk anything about **${cName}**'s evidence ledger, generate targeted interview probes for missing proof, or launch an async screening room directly below.`,
      generativeUi: {
        type: "packet_scorecard",
        data: {
          candidateId: ext.id,
          candidateName: cName,
          roleTitle: rTitle,
          fitScore: rawFit,
          proofScore: proofPct,
          readiness,
          disposition,
          rationale,
          verifiedClaims: verifiedList,
          missingProof: missingList,
          packetHref: `/employer/packet/${ext.id}`,
        },
      },
      artifact: {
        title: `${cName} · Decision Packet (${fitText})`,
        type: "DECISION_PACKET",
        href: `/employer/packet/${ext.id}`
      },
      relatedQuestions: [
        `Generate targeted interview probes for ${cName}`,
        `Compare ${cName}'s verified claims against must-haves`,
        `Summarize ${cName}'s human decision & next steps`,
      ],
      suggestions: [
        `Generate targeted interview probes for ${cName}`,
        `Compare ${cName}'s verified claims against must-haves`,
        `Summarize ${cName}'s human decision & next steps`,
        "Give me a summary of my current hiring pipeline"
      ]
    };

    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) {
        setMessages((prev) => {
          const filtered = prev.filter((m) => !String(m.id || "").startsWith("packet_continuation_"));
          return [...filtered, continuationUserMsg, continuationMsg];
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activePacketData, activeRun]);

  const handleClearCandidateContext = useCallback(() => {
    setActiveCandidateId(null);
    setActivePacketData(null);
    setDrawerArtifact(null);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem("workbyline_active_packet_context");
        window.sessionStorage.removeItem("wbl_last_viewed_packet");
      } catch (_) {}
    }
    setMessages((prev) => prev.filter((m) => !String(m.id || "").startsWith("packet_continuation_")));
  }, []);

  const handleStartNewThread = () => {
    const newId = `thread_${Date.now()}`;
    const candidateLabel = activePacketData?.extraction?.candidate_name || activePacketData?.extraction?.candidate_profiles?.name;
    const threadTitle = candidateLabel
      ? `${candidateLabel} · Packet Review`
      : `${activeRun?.role_title || "Role"} Thread #${threads.length + 1}`;
    setThreads((prev) => [{ id: newId, title: threadTitle, updatedAt: "Just now" }, ...prev]);
    setActiveThreadId(newId);
    setMessages((prev) => prev.filter((m) => m.id?.startsWith("welcome_") || String(m.id || "").startsWith("packet_continuation_")));
  };

  const handleSubmitPrompt = async (customPrompt) => {
    const msgText = (customPrompt || input).trim();
    if (!msgText || isSubmitting) return;

    setInput("");
    setErrorMessage(null);
    setLastSubmittedInput(msgText);
    setIsSubmitting(true);

    idSeqRef.current += 1;
    const userMsg = {
      id: `usr_${idSeqRef.current}`,
      role: "user",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      content: msgText,
    };

    setMessages((prev) => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg && lastMsg.role === "user" && lastMsg.content === msgText) {
        return prev;
      }
      return [...prev, userMsg];
    });

    try {
      const payloadContext = {};
      const effectiveOrgId = orgId || activeRun?.org_id || activePacketData?.hiring_run?.org_id;
      const effectiveRunId = activeRun?.id || activePacketData?.hiring_run?.id;
      const effectiveCandId = activePacketData?.extraction?.id || activeCandidateId;
      if (effectiveOrgId) payloadContext.org_id = effectiveOrgId;
      if (effectiveRunId) payloadContext.active_run_id = effectiveRunId;
      if (effectiveCandId) payloadContext.candidate_id = effectiveCandId;
      if (conciseMode) payloadContext.concise_mode = true;

      const res = await api.post("/employer/chat", {
        message: msgText,
        context: payloadContext,
        concise_mode: conciseMode,
      });

      const data = res.data || {};

      // Fail closed if reply is missing or non-string
      if (!data.reply || typeof data.reply !== "string" || data.reply.trim().length === 0) {
        throw new Error("Malformed API response: Missing reply text.");
      }

      idSeqRef.current += 1;
      const aiMsg = {
        id: `ai_${idSeqRef.current}`,
        role: "assistant",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        searchQuery:
          data.searchQuery ||
          `${msgText} ${activeRun?.role_title || "backend engineer"} hiring rubric verified claims 2026`,
        content: data.reply,
        artifact: data.artifact || null,
        sources: Array.isArray(data.sources) ? data.sources : [],
        generativeUi: data.generativeUi || null,
        relatedQuestions: Array.isArray(data.relatedQuestions) ? data.relatedQuestions : [],
        compactionTelemetry: data.compactionTelemetry || null,
        suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      console.log("[ChatPage] Error during chat submit caught:", err?.message || err);
      const apiErr = err.response?.data?.error;
      const apiNext = err.response?.data?.safe_next_action;

      if (apiErr === "ORGANIZATION_CONTEXT_REQUIRED") {
        setErrorMessage(apiNext || "Select an organization before using hiring chat.");
      } else if (apiErr === "CHAT_DATA_UNAVAILABLE") {
        setErrorMessage(apiNext || "Hiring chat data is temporarily unavailable. Please try again.");
      } else {
        setErrorMessage("Unable to connect to hiring chat service. Your message has been saved.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeCandidateExt = activePacketData?.extraction;
  const activeCandidatePkt = activePacketData?.packet || activeCandidateExt?.decision_packet;
  const activeCandidateName =
    activeCandidateExt?.candidate_name ||
    activeCandidateExt?.candidate_profiles?.name ||
    null;
  const activeCandidateFit = (() => {
    const score = resolveAuthoritativeFitScore(activeCandidatePkt, activeCandidateExt);
    return score != null ? formatCanonicalScorePercent(score) : "Unassessed";
  })();
  const activeCandidateDisposition =
    activeCandidatePkt?.human_decision?.action ||
    activeCandidateExt?.status ||
    "pending_review";

  const llmChatSidebar = (
    <div className="flex flex-col h-full bg-[#181818] text-[#E1E1E5] p-3 space-y-4 overflow-y-auto scrollbar-hide select-none">
      <button
        type="button"
        onClick={handleStartNewThread}
        className="btn-white w-full justify-center !py-2"
      >
        <Plus className="h-3.5 w-3.5" />
        <span>New Chat Thread</span>
      </button>

      <Frame className="!p-1">
        <div className="px-2 py-1">
          <span className="mono-label">Answer Engine Modes</span>
        </div>
        <FramePanel className="!p-1.5 space-y-1">
          {[
            {
              id: "packet",
              label: "Decision Packet Deep-Dive",
              prompt: activeCandidateName
                ? `Summarize ${activeCandidateName}'s Decision Packet, verified claims, and human decision status`
                : "Show candidates in this role cohort"
            },
            {
              id: "probes",
              label: "Missing-Proof Probes",
              prompt: activeCandidateName
                ? `Generate targeted interview probes for ${activeCandidateName}`
                : "Draft 3 technical screening questions based on the must-haves"
            },
            {
              id: "rubric",
              label: "Rubric Claim Alignment",
              prompt: activeCandidateName
                ? `Compare ${activeCandidateName}'s verified claims against must-haves`
                : `What are the must-have requirements for ${activeRun?.role_title || "this role"}?`
            },
            {
              id: "pipeline",
              label: "Pipeline & Cohort Health",
              prompt: "Give me a summary of my current hiring pipeline"
            }
          ].map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => {
                setActiveMode(mode.id);
                handleSubmitPrompt(mode.prompt);
              }}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all flex items-center justify-between ${
                activeMode === mode.id
                  ? "bg-[#00D604]/12 text-[var(--wbl-emerald-text)] border border-[#00D604]/30"
                  : "text-[#8D8D8D] hover:text-[#E1E1E5] hover:bg-[#292929] border border-transparent"
              }`}
            >
              <span className="truncate">{mode.label}</span>
              <ArrowUpRight className="h-3 w-3 opacity-60 shrink-0" />
            </button>
          ))}
        </FramePanel>
      </Frame>

      <Frame className="!p-1">
        <div className="flex items-center justify-between px-2 py-1">
          <span className="mono-label">
            Candidate Packets ({cohortCandidates.length})
          </span>
          {activeCandidateId && (
            <button
              type="button"
              onClick={handleClearCandidateContext}
              className="text-[9px] font-mono text-[#8D8D8D] hover:text-[#E1E1E5] underline"
            >
              Reset
            </button>
          )}
        </div>
        <FramePanel className="!p-1.5">
          {cohortCandidates.length === 0 ? (
            <p className="text-[11px] text-[#8D8D8D] p-1.5">
              Open any candidate Decision Packet to pin its live ledger here.
            </p>
          ) : (
            <div className="space-y-1 max-h-52 overflow-y-auto pr-0.5 scrollbar-hide">
              {cohortCandidates.slice(0, 12).map((cand) => {
                const name = cand.candidate_profiles?.name || cand.candidate_name || "Candidate";
                const isSelected = cand.id === activeCandidateId;
                const candScore = resolveAuthoritativeFitScore(cand.decision_packet, cand);
                const fit = candScore != null ? formatCanonicalScorePercent(candScore) : "Unassessed";
                return (
                  <button
                    key={cand.id}
                    type="button"
                    onClick={() => setActiveCandidateId(cand.id)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg border transition-all flex items-center justify-between gap-2 ${
                      isSelected
                        ? "bg-[#00D604]/12 border-[#00D604]/30 text-[#E1E1E5]"
                        : "bg-[#222222]/50 border-[#303030] text-[#8D8D8D] hover:text-[#E1E1E5] hover:bg-[#292929]"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium truncate">{name}</p>
                      <p className="text-[9px] font-mono text-[#8D8D8D] uppercase truncate">
                        {cand.status || "in_review"}
                      </p>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#222222] text-[var(--wbl-emerald-text)] shrink-0">
                      {fit}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </FramePanel>
      </Frame>

      <div className="space-y-1.5 pt-1">
        <span className="mono-label px-1 flex items-center gap-1">
          <History className="h-2.5 w-2.5" /> Recent Threads
        </span>
        <div className="space-y-1">
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveThreadId(t.id)}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] truncate transition-colors flex items-center gap-2 ${
                activeThreadId === t.id
                  ? "bg-[var(--nav-selected-bg)] text-[#E1E1E5] font-medium border border-[#303030]"
                  : "text-[#8D8D8D] hover:text-[#E1E1E5] hover:bg-[#292929]"
              }`}
            >
              {activeThreadId === t.id && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#00D604] shrink-0" />
              )}
              <span className="truncate">{t.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <NaiveShell
      pageTitle="AI Chat"
      pageSubtitle={
        activeCandidateName
          ? `${activeCandidateName} · ${activeRun?.role_title || "Active Role"}`
          : activeRun?.role_title || "Hiring Intelligence"
      }
      showRightPanel={rightDrawerOpen}
      rightPanelTitle="Context & Packets"
      rightPanel={llmChatSidebar}
      topBar={
        <div className="flex items-center gap-2">
          {runs.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[#262626] bg-[#0c0c0c] text-xs font-mono text-[#8D8D8D]">
              <Briefcase className="h-3 w-3 text-[#00D604]" />
              <select
                value={activeRun?.id || ""}
                onChange={(e) => {
                  const selected = runs.find(r => r.id === e.target.value);
                  if (selected) setActiveRun(selected);
                }}
                className="bg-transparent text-[#E1E1E5] border-none focus:outline-none cursor-pointer text-[11px]"
              >
                {runs.map(r => (
                  <option key={r.id} value={r.id} className="bg-[#181818] text-[#E1E1E5]">
                    {r.role_title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeCandidateExt?.id && (
            <button
              type="button"
              onClick={() => router.push(`/employer/packet/${activeCandidateExt.id}`)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-mono text-[#00D604] bg-[#00D604]/10 hover:bg-[#00D604]/15 border border-[#00D604]/30 transition-all"
            >
              ← {activeCandidateName} Packet
            </button>
          )}

          {/* Top-Right Feedback + Settings Gear Controls */}
          <button
            type="button"
            onClick={() => setRightDrawerOpen((prev) => !prev)}
            className="px-3 py-1.5 rounded-lg border border-[#262626] bg-[#0c0c0c] hover:bg-[#181818] text-[12px] font-medium text-[#E1E1E5] transition-colors"
          >
            Feedback
          </button>
          <button
            type="button"
            onClick={() => setRightDrawerOpen((prev) => !prev)}
            className="p-1.5 rounded-lg text-[#8D8D8D] hover:text-[#E1E1E5] hover:bg-[#181818] transition-colors"
            title="Toggle Context & Candidate Packets"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      }
    >
      <div className="flex-1 flex h-full overflow-hidden bg-[#030303]">
        {/* Primary Answer Stream Column */}
        <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
          {/* Compact Candidate Continuity Bar (Only shown when deep-linked from a Candidate Decision Packet) */}
          {activeCandidateExt && (
            <div
              className="max-w-[740px] mx-auto w-full px-6 pt-3 shrink-0"
              data-testid="active-candidate-chat-banner"
            >
              <div className="rounded-xl border border-[#222222] bg-[#0c0c0c] px-3.5 py-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 text-xs">
                  <span className="w-2 h-2 rounded-full bg-[#00D604] shrink-0" />
                  <span className="font-medium text-[#E1E1E5] truncate">
                    Packet Context: {activeCandidateName}
                  </span>
                  <span className="font-mono text-[10px] text-[#00D604]">
                    ({activeCandidateFit} Fit · {String(activeCandidateDisposition)})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      handleSubmitPrompt(
                        `Generate targeted interview probes for ${activeCandidateName}`
                      )
                    }
                    className="px-2 py-0.5 rounded-md bg-[#181818] hover:bg-[#222222] border border-[#262626] text-[10px] font-mono text-[#E1E1E5] inline-flex items-center gap-1"
                  >
                    <Sparkles className="h-2.5 w-2.5 text-[#00D604]" />
                    <span>Probes</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDrawerArtifact({
                        title: `${activeCandidateName} · Decision Packet`,
                        type: "DECISION_PACKET",
                        href: `/employer/packet/${activeCandidateExt.id}`,
                        packetData: {
                          candidateName: activeCandidateName,
                          roleTitle: activeRun?.role_title,
                          fitScore: (() => {
                          const parsed = parseInt(activeCandidateFit, 10);
                          return Number.isFinite(parsed) ? parsed : null;
                        })(),
                          verifiedClaims: activeCandidatePkt?.what_is_verified || [],
                          missingProof: activeCandidatePkt?.missing_proof || [],
                        },
                      })
                    }
                    className="px-2 py-0.5 rounded-md bg-[#181818] hover:bg-[#222222] border border-[#262626] text-[10px] font-mono text-[#8D8D8D] hover:text-[#E1E1E5] inline-flex items-center gap-1"
                  >
                    <FileText className="h-2.5 w-2.5 text-[#00D604]" />
                    <span>Artifact</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClearCandidateContext}
                    className="p-1 text-[#8D8D8D] hover:text-[#E1E1E5]"
                    title="Clear candidate filter"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="max-w-[740px] mx-auto w-full px-6 pt-2 shrink-0">
              <ChatErrorState
                errorMessage={errorMessage}
                lastSubmittedInput={lastSubmittedInput}
                onResend={(resendText) => handleSubmitPrompt(resendText)}
              />
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            <ConversationList
              messages={messages}
              isSubmitting={isSubmitting}
              onSelectSuggestion={(promptText) => handleSubmitPrompt(promptText)}
              onNavigate={(targetPath) => router.push(targetPath)}
              onOpenArtifact={(art) => setDrawerArtifact(art)}
            />
          </div>

          <PromptBar
            input={input}
            onChange={(val) => setInput(val)}
            onSubmit={() => handleSubmitPrompt()}
            isSubmitting={isSubmitting}
            conciseMode={conciseMode}
            onToggleConcise={() => setConciseMode((prev) => !prev)}
            activeRoleTitle={
              activeCandidateName
                ? `${activeCandidateName} (${activeRun?.role_title || "Active Role"})`
                : activeRun?.role_title || "Role Context"
            }
            onAttachDoc={() => {
              if (activeRun?.id) {
                router.push(`/employer/brief/${activeRun.id}?tab=evidence`);
              } else {
                router.push("/employer/intake");
              }
            }}
          />
        </div>

        {/* Side-by-Side Artifact Preview Drawer */}
        {drawerArtifact && (
          <ArtifactPreviewDrawer
            artifact={drawerArtifact}
            onClose={() => setDrawerArtifact(null)}
            onNavigate={(href) => router.push(href)}
          />
        )}
      </div>
    </NaiveShell>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatPageInner />
    </Suspense>
  );
}
