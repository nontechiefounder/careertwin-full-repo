"use client";

import { useState, useEffect, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Loader2,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Send,
  MessageSquare,
  FileText,
  Users,
  Sparkles,
  Clock,
} from "lucide-react";
import { CTLogo } from "@/components/NaiveShell";
import {
  Frame,
  FramePanel,
  FrameHeader,
  FrameTitle,
  FrameDescription,
  FrameFooter,
  HatchedProgressBar,
} from "@/components/ui/frame";

export default function CandidateScreenPage({ params }) {
  const { sessionId } = use(params);
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [completing, setCompleting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await api.get(`/candidate/screening-sessions/${sessionId}`);
      setData(res.data);
      const qs = res.data?.session?.questions || [];
      const answerMap = {};
      (res.data.answers || []).forEach((a) => {
        const mappedKey =
          a.question_id ||
          qs[a.question_index]?.id ||
          `q${(a.question_index ?? 0) + 1}`;
        answerMap[mappedKey] = a.answer_text;
      });
      setAnswers(answerMap);
    } catch (err) {
      toast.error("Failed to load screening session");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) fetchData();
    });
    return () => { cancelled = true; };
  }, [fetchData]);

  const questions = data?.session?.questions || [];
  const session = data?.session;
  const summary = data?.summary;
  const ext = data?.extraction;
  const extractionId = data?.extraction_id || ext?.extraction_id || null;
  const hiringRunId = data?.hiring_run_id || session?.hiring_run_id || null;
  const roleTitle = data?.role_title || ext?.role_title || "Active Role";
  const candidateName = ext?.name || ext?.candidate_name || "Candidate";

  const saveAnswer = async (qId, text, qIdx = currentQ) => {
    setSubmitting(true);
    try {
      await api.post(`/candidate/screening-sessions/${sessionId}/answer`, {
        question_id: qId,
        question_index: qIdx,
        answer_text: text,
      });
      if (session?.status === "not_started") {
        await api.post(`/candidate/screening-sessions/${sessionId}/start`);
      }
    } catch (err) {
      toast.error("Failed to save answer");
    } finally {
      setSubmitting(false);
    }
  };

  const completeScreen = async () => {
    setCompleting(true);
    try {
      if (q && answers[q.id]?.trim()) {
        await saveAnswer(q.id, answers[q.id], currentQ);
      }
      await api.post(`/candidate/screening-sessions/${sessionId}/complete`);
      toast.success("Screening completed & AI summary generated!");
      await fetchData();
    } catch (err) {
      toast.error(
        err.response?.data?.detail ||
          err.response?.data?.error ||
          "Failed to complete screening"
      );
    } finally {
      setCompleting(false);
    }
  };

  if (loading)
    return (
      <div className="h-screen bg-[#030303] flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[#00D604]" />
      </div>
    );

  if (session?.status === "completed" && summary) {
    return (
      <div
        className="wbl-app-shell min-h-screen bg-[#030303] text-[#E1E1E5]"
        style={{ fontFamily: "var(--font-sans)" }}
        data-testid="screen-completed-page"
      >
        <nav className="flex items-center justify-between px-6 py-3.5 border-b border-[#303030] bg-[#181818]">
          <div className="flex items-center gap-2.5">
            <CTLogo />
            <span className="text-[13px] font-semibold text-[#E1E1E5]">
              work<span className="text-[var(--wbl-emerald-text)]">BYLiNE</span>
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#00D604]/12 text-[var(--wbl-emerald-text)] border border-[#00D604]/30">
              Async Verification Complete
            </span>
          </div>
          <div className="flex items-center gap-2">
            {extractionId && (
              <button
                type="button"
                onClick={() => router.push(`/employer/packet/${extractionId}`)}
                className="btn-ghost"
              >
                ← Back to Decision Packet
              </button>
            )}
          </div>
        </nav>

        <div className="max-w-2xl mx-auto px-6 py-8 space-y-4">
          <Frame>
            <FrameHeader>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#00D604]/12 border border-[#00D604]/30 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-[var(--wbl-emerald-text)]" />
                </div>
                <div>
                  <FrameTitle>
                    Screening complete for {candidateName}
                  </FrameTitle>
                  <FrameDescription>
                    Role: {roleTitle} · Responses evaluated & attached to
                    Decision Packet
                  </FrameDescription>
                </div>
              </div>
              <div className="text-right">
                <p className="mono-label">VERIFIED SCORE</p>
                <span className="text-xl font-mono font-bold text-[var(--wbl-emerald-text)]">
                  {(summary.overall_score ?? summary.technical_score) != null
                    ? `${((summary.overall_score ?? summary.technical_score) * 100).toFixed(0)}%`
                    : "Unavailable"}
                </span>
              </div>
            </FrameHeader>

            <FramePanel className="space-y-3">
              <p className="mono-label">STRUCTURED SCREENING ASSESSMENT</p>
              <p className="text-[12px] text-[#E1E1E5] leading-relaxed">
                {summary.summary_text}
              </p>
            </FramePanel>
          </Frame>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Frame>
              <FrameHeader>
                <FrameTitle className="flex items-center gap-1.5 text-xs">
                  <CheckCircle className="h-3.5 w-3.5 text-[var(--wbl-emerald-text)]" />
                  Verified Strengths
                </FrameTitle>
              </FrameHeader>
              <FramePanel>
                {Array.isArray(summary.strengths) && summary.strengths.length > 0 ? (
                  <ul className="space-y-1.5">
                    {summary.strengths.map((s, i) => (
                      <li
                        key={i}
                        className="text-[11px] text-[#E1E1E5] flex items-start gap-1.5"
                      >
                        <span className="text-[var(--wbl-emerald-text)] mt-0.5">·</span> {s}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-[#8D8D8D] italic">
                    No structured strength bullets recorded.
                  </p>
                )}
              </FramePanel>
            </Frame>

            <Frame>
              <FrameHeader>
                <FrameTitle className="text-xs">Follow-Up Areas</FrameTitle>
              </FrameHeader>
              <FramePanel>
                {Array.isArray(summary.concerns) && summary.concerns.length > 0 ? (
                  <ul className="space-y-1.5">
                    {summary.concerns.map((c, i) => (
                      <li
                        key={i}
                        className="text-[11px] text-[#E1E1E5] flex items-start gap-1.5"
                      >
                        <span className="text-amber-400 mt-0.5">·</span> {c}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-[#8D8D8D] italic">
                    No structured follow-up concerns recorded.
                  </p>
                )}
              </FramePanel>
            </Frame>
          </div>

          {summary.recommended_next_step && (
            <Frame>
              <FramePanel className="!p-3.5">
                <p className="mono-label mb-1 text-[var(--wbl-emerald-text)]">
                  RECOMMENDED NEXT STEP
                </p>
                <p className="text-[12px] text-[#E1E1E5]">
                  {summary.recommended_next_step}
                </p>
              </FramePanel>
            </Frame>
          )}

          {/* Post-Screening Workflow Continuation Hub */}
          <Frame>
            <FrameHeader>
              <FrameTitle className="text-xs">Continue Workflow</FrameTitle>
              <FrameDescription>
                Jump directly back to the Candidate Decision Packet or AI
                Hiring Assistant
              </FrameDescription>
            </FrameHeader>
            <FramePanel className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {extractionId && (
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/employer/packet/${extractionId}`)
                  }
                  className="btn-white justify-between !py-2.5"
                  data-testid="return-to-packet-btn"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5" /> Return to Decision
                    Packet
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/employer/chat?role_id=${hiringRunId || ""}${
                      extractionId ? `&candidate_id=${extractionId}` : ""
                    }`
                  )
                }
                className="btn-ghost justify-between !py-2.5 !text-[var(--wbl-emerald-text)] !border-[#00D604]/30"
                data-testid="continue-in-chat-btn"
              >
                <span className="flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5" /> Continue in AI
                  Chat
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>

              {session?.candidate_id && (
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/candidate/status/${session.candidate_id}`)
                  }
                  className="btn-ghost justify-between !py-2.5"
                  data-testid="view-candidate-status-btn"
                >
                  <span className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 opacity-60" /> Candidate
                    Status Timeline
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 opacity-50" />
                </button>
              )}

              {hiringRunId && (
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/employer/shortlist/${hiringRunId}`)
                  }
                  className="btn-ghost justify-between !py-2.5"
                  data-testid="back-to-shortlist-btn"
                >
                  <span className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 opacity-60" /> Role Shortlist
                    & Kanban
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 opacity-50" />
                </button>
              )}
            </FramePanel>
          </Frame>

          <button
            type="button"
            onClick={() => router.push("/employer")}
            className="btn-ghost"
            data-testid="back-home-btn"
          >
            ← Back to Roles Workspace
          </button>
        </div>
      </div>
    );
  }

  const q = questions[currentQ];
  const answeredCount = questions.filter((item) =>
    answers[item.id]?.trim()
  ).length;
  const progress =
    questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;
  const allAnswered =
    questions.length > 0 &&
    questions.every((questionsItem) => answers[questionsItem.id]?.trim());

  const fillSampleAnswer = () => {
    if (!q) return;
    const sample = `In my recent role as Senior Engineer, I architected and scaled our production distributed service handling 15k+ req/sec on PostgreSQL and Node.js/TypeScript. Regarding "${q.dimension || q.requirement || "this requirement"}", I led the schema partitioning, connection pooling, and zero-downtime migration strategy, reducing p99 tail latency by 42% while maintaining 99.98% uptime.`;
    setAnswers((a) => ({ ...a, [q.id]: sample }));
  };

  return (
    <div
      className="wbl-app-shell min-h-screen bg-[#030303] text-[#E1E1E5]"
      style={{ fontFamily: "var(--font-sans)" }}
      data-testid="screen-page"
    >
      <nav className="flex items-center justify-between px-6 py-3.5 border-b border-[#303030] bg-[#181818]">
        <div className="flex items-center gap-2.5">
          <CTLogo />
          <span className="text-[13px] font-semibold text-[#E1E1E5]">
            work<span className="text-[var(--wbl-emerald-text)]">BYLiNE</span>
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#222222] text-[#8D8D8D] border border-[#303030]">
            Async Technical Verification Room
          </span>
        </div>
        <div className="flex items-center gap-3">
          {extractionId && (
            <button
              type="button"
              onClick={() => router.push(`/employer/packet/${extractionId}`)}
              className="btn-ghost !py-1 !px-2.5"
            >
              ← Decision Packet
            </button>
          )}
          <span className="text-[11px] text-[#8D8D8D] font-medium">
            {candidateName} · {roleTitle}
          </span>
          <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-[#00D604]/12 text-[var(--wbl-emerald-text)] border border-[#00D604]/30">
            {currentQ + 1}/{questions.length}
          </span>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-5">
        <Frame>
          <FrameHeader>
            <span className="mono-label">
              VERIFICATION PROGRESS · {roleTitle.toUpperCase()}
            </span>
            <span className="text-[10px] font-mono text-[var(--wbl-emerald-text)]">
              {answeredCount}/{questions.length} answered
            </span>
          </FrameHeader>
          <FramePanel className="!py-3">
            <HatchedProgressBar percent={progress} color="#00D604" />
          </FramePanel>
        </Frame>

        {q && (
          <Frame className="animate-fade-in" key={q.id}>
            <FrameHeader className="flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-[#00D604]/12 border border-[#00D604]/30 text-[10px] font-mono text-[var(--wbl-emerald-text)] uppercase">
                  {q.dimension || q.requirement || "Technical Verification"}
                </span>
                <span className="text-[11px] font-mono text-[#8D8D8D]">
                  Question {currentQ + 1} of {questions.length}
                </span>
              </div>
              <button
                type="button"
                onClick={fillSampleAnswer}
                className="btn-ghost !py-1 !px-2.5 !text-[10px]"
                title="Insert sample grounded response for quick evaluation"
              >
                <Sparkles className="h-3 w-3 text-[var(--wbl-emerald-text)]" />
                <span>Draft Sample Response</span>
              </button>
            </FrameHeader>

            <FramePanel className="space-y-4">
              <h2 className="text-[15px] font-medium text-[#E1E1E5] leading-relaxed">
                {q.question}
              </h2>

              <textarea
                value={answers[q.id] || ""}
                onChange={(e) =>
                  setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
                }
                placeholder="Write your specific technical and architectural response here (include metrics, system scale, and direct ownership)..."
                rows={7}
                className="naive-input w-full p-3.5 resize-none text-[12px] leading-relaxed"
                data-testid="screen-answer-input"
              />

              <div className="flex items-center justify-between pt-2 border-t border-[#303030]">
                <button
                  type="button"
                  disabled={currentQ === 0}
                  onClick={() => setCurrentQ((c) => c - 1)}
                  className="btn-ghost disabled:opacity-30"
                  data-testid="prev-question-btn"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Previous
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      saveAnswer(q.id, answers[q.id] || "", currentQ)
                    }
                    disabled={submitting || !answers[q.id]?.trim()}
                    className="btn-ghost disabled:opacity-30"
                    data-testid="save-answer-btn"
                  >
                    {submitting ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Send className="h-3 w-3" />
                    )}
                    Save Draft
                  </button>
                  {currentQ < questions.length - 1 ? (
                    <button
                      type="button"
                      className="btn-white disabled:opacity-40"
                      onClick={async () => {
                        await saveAnswer(q.id, answers[q.id] || "", currentQ);
                        setCurrentQ((c) => c + 1);
                      }}
                      disabled={!answers[q.id]?.trim() || submitting}
                      data-testid="next-question-btn"
                    >
                      Save & Next <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-white disabled:opacity-40"
                      onClick={completeScreen}
                      disabled={!allAnswered || completing}
                      data-testid="complete-screen-btn"
                    >
                      {completing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle className="h-3.5 w-3.5" />
                      )}
                      Complete Screening
                    </button>
                  )}
                </div>
              </div>
            </FramePanel>

            <FrameFooter>
              <span>Grounded Async Proof Verification</span>
              <div className="flex items-center gap-1.5">
                {questions.map((questionItem, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCurrentQ(i)}
                    className={`h-2 rounded-full transition-all ${
                      i === currentQ
                        ? "w-5 bg-[#00D604]"
                        : answers[questionItem.id]
                        ? "w-2 bg-[#00D604]/50"
                        : "w-2 bg-[#303030]"
                    }`}
                    data-testid={`question-dot-${i}`}
                  />
                ))}
              </div>
            </FrameFooter>
          </Frame>
        )}
      </div>
    </div>
  );
}
